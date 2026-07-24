// Background poller: refreshes Yahoo prices and (when connected) syncs the WS
// account, broadcasting changes over SSE. A globalThis singleton with a guard so
// it starts at most once across dev-server reloads. Uses setTimeout chains (not
// setInterval) so a slow tick can never stack on top of the previous one.

import { prisma } from '@/lib/prisma'
import { getKv, setKv } from '@/lib/kv'
import { isMarketOpen } from '@/lib/market-hours'
import { fetchPrices, fetchUsdCadRate } from '@/lib/yahoo-finance'
import { broadcast } from './broadcaster'
import { getConnectionStatus } from '@/lib/ws-api/session-store'
import { fullSync, logSyncFailure } from '@/lib/ws-api/sync'
import { WsRateLimitError } from '@/lib/ws-api/errors'
import { checkBigMovers, checkDayTradeSignal, checkSrZoneEntries, checkWatchlist } from '@/lib/alerts'
import { fetchBars, groupBySession, RANGE_END } from '@/lib/daytrade/intraday'
import { analyzeSession } from '@/lib/daytrade/strategy'

interface PollerState {
  running: boolean
  priceTimer?: NodeJS.Timeout
  wsTimer?: NodeJS.Timeout
  signalTimer?: NodeJS.Timeout
  srTimer?: NodeJS.Timeout
  lastPriceHistoryAt: Map<string, number>
  lastSnapshotAt: number
  wsBackoffUntil: number
}

const g = globalThis as unknown as { __wsPoller?: PollerState }
const state: PollerState =
  g.__wsPoller ?? { running: false, lastPriceHistoryAt: new Map(), lastSnapshotAt: 0, wsBackoffUntil: 0 }
if (!g.__wsPoller) g.__wsPoller = state

const SIGNAL_INTERVAL_OPEN = 10 * 60_000
const SIGNAL_INTERVAL_CLOSED = 60 * 60_000

const PRICE_INTERVAL_OPEN = 20_000
const PRICE_INTERVAL_CLOSED = 15 * 60_000
const WS_INTERVAL_OPEN = 45_000
const WS_INTERVAL_CLOSED = 10 * 60_000
const PRICE_HISTORY_MIN_GAP = 5 * 60_000
const SNAPSHOT_MIN_GAP = 15 * 60_000

// --- price loop --------------------------------------------------------------

async function priceTick(): Promise<void> {
  try {
    const holdings = await prisma.holding.findMany({ select: { ticker: true, exchange: true } })
    if (holdings.length > 0) {
      const tickers = holdings.map((h) => h.ticker)
      const exchanges = Object.fromEntries(holdings.map((h) => [h.ticker, h.exchange]))
      const prices = await fetchPrices(tickers, { noStore: true }, exchanges)

      const now = Date.now()
      for (const p of prices) {
        const holding = await prisma.holding.update({
          where: { ticker: p.ticker },
          data: { marketPrice: p.price, marketPriceCurrency: p.currency },
        })
        // marketValue tracks live price when we know the quantity
        if (holding.quantity > 0) {
          await prisma.holding.update({
            where: { ticker: p.ticker },
            data: { marketValue: Math.round(p.price * holding.quantity * 100) / 100 },
          })
        }
        const last = state.lastPriceHistoryAt.get(p.ticker) ?? 0
        if (now - last > PRICE_HISTORY_MIN_GAP) {
          await prisma.priceHistory.create({ data: { ticker: p.ticker, price: p.price, currency: p.currency } })
          state.lastPriceHistoryAt.set(p.ticker, now)
        }
      }
      if (prices.length > 0) {
        broadcast('prices-updated', { count: prices.length, at: new Date().toISOString() })
        await checkBigMovers(prices)
      }
      await checkWatchlist((tickers) => fetchPrices(tickers, { noStore: true }))
    }

    const rate = await fetchUsdCadRate({ noStore: true })
    if (rate) await setKv('usdCadRate', String(rate))
    await setKv('health:lastPriceTickAt', new Date().toISOString())

    await maybeSnapshot(rate)
  } catch (err) {
    console.error('priceTick failed:', err instanceof Error ? err.message : err)
  } finally {
    state.priceTimer = setTimeout(priceTick, isMarketOpen() ? PRICE_INTERVAL_OPEN : PRICE_INTERVAL_CLOSED)
  }
}

// --- portfolio value snapshots ----------------------------------------------

const DEFAULT_USD_CAD = 1.39

/** Write a PortfolioSnapshot at most every 15 min (during market hours; plus
 *  whenever the market just closed) so the value chart has intraday points. */
async function maybeSnapshot(liveRate: number | null): Promise<void> {
  const now = Date.now()
  const open = isMarketOpen()
  if (open && now - state.lastSnapshotAt < SNAPSHOT_MIN_GAP) return
  if (!open && state.lastSnapshotAt !== 0 && now - state.lastSnapshotAt < 6 * 3600_000) return

  const storedRate = Number(await getKv('usdCadRate'))
  const rate = liveRate ?? (storedRate > 0 ? storedRate : DEFAULT_USD_CAD)
  const holdings = await prisma.holding.findMany({
    select: { marketValue: true, marketValueCurrency: true, bookValueCAD: true },
  })
  if (holdings.length === 0) return

  const totalCAD = holdings.reduce(
    (s, h) => s + (h.marketValueCurrency === 'CAD' ? h.marketValue : h.marketValue * rate),
    0
  )
  const bookCostCAD = holdings.reduce((s, h) => s + h.bookValueCAD, 0)
  const account = await prisma.wsAccount.findFirst({ where: { type: 'tfsa' } })
  const cashCAD = account?.cashCAD ?? 0

  await prisma.portfolioSnapshot.create({
    data: { totalCAD: Math.round(totalCAD * 100) / 100, cashCAD, bookCostCAD, usdCadRate: rate },
  })
  state.lastSnapshotAt = now
  broadcast('snapshot', { at: new Date().toISOString() })
}

// --- WS loop -----------------------------------------------------------------

async function wsTick(): Promise<void> {
  try {
    const { status } = await getConnectionStatus()
    if (status !== 'connected') return
    if (Date.now() < state.wsBackoffUntil) return

    const result = await fullSync()
    if (result.newActivities > 0) {
      // fullSync already persisted; fetch the unseen fills to push to the UI
      const fresh = await prisma.activity.findMany({
        where: { seen: false },
        orderBy: { occurredAt: 'desc' },
        take: 20,
      })
      broadcast('activity', fresh)
      broadcast('holdings-updated', { reason: 'new-activity' })
    }
    broadcast('ws-status', { status: 'connected' })
  } catch (err) {
    await logSyncFailure(err)
    if (err instanceof WsRateLimitError) {
      state.wsBackoffUntil = Date.now() + 5 * 60_000
    }
    const { status } = await getConnectionStatus()
    broadcast('ws-status', { status })
  } finally {
    state.wsTimer = setTimeout(wsTick, isMarketOpen() ? WS_INTERVAL_OPEN : WS_INTERVAL_CLOSED)
  }
}

// --- day-trade signal watch (fires alerts without the page being open) -------

async function signalTick(): Promise<void> {
  try {
    if (!isMarketOpen()) return
    const bars = await fetchBars('SPY', '1m', '5d')
    const sessions = groupBySession(bars)
    const current = sessions[sessions.length - 1]
    if (!current) return
    // only meaningful after the opening range completes
    if (!current.bars.some((b) => b.et.minutes >= RANGE_END)) return
    const priorSession = sessions.length > 1 ? sessions[sessions.length - 2] : null
    const prior = priorSession
      ? {
          close: priorSession.bars[priorSession.bars.length - 1].close,
          high: Math.max(...priorSession.bars.map((b) => b.high)),
          low: Math.min(...priorSession.bars.map((b) => b.low)),
        }
      : undefined
    const analysis = analyzeSession(current.bars, prior)
    await checkDayTradeSignal(analysis.direction, analysis.confidence)
  } catch (err) {
    console.error('signalTick failed:', err instanceof Error ? err.message : err)
  } finally {
    state.signalTimer = setTimeout(signalTick, isMarketOpen() ? SIGNAL_INTERVAL_OPEN : SIGNAL_INTERVAL_CLOSED)
  }
}

// --- S/R zone-entry watch (slow; network-heavy) ------------------------------

const SR_INTERVAL_OPEN = 30 * 60_000
const SR_INTERVAL_CLOSED = 3 * 3600_000

async function srTick(): Promise<void> {
  try {
    if (isMarketOpen()) await checkSrZoneEntries()
  } catch (err) {
    console.error('srTick failed:', err instanceof Error ? err.message : err)
  } finally {
    state.srTimer = setTimeout(srTick, isMarketOpen() ? SR_INTERVAL_OPEN : SR_INTERVAL_CLOSED)
  }
}

export function startPoller(): void {
  if (state.running) return
  state.running = true
  // stagger the first ticks slightly so they don't all fire on cold start
  state.priceTimer = setTimeout(priceTick, 1_000)
  state.wsTimer = setTimeout(wsTick, 4_000)
  state.signalTimer = setTimeout(signalTick, 8_000)
  state.srTimer = setTimeout(srTick, 60_000) // first SR scan a minute in
  console.log('[poller] started')
}

export function isPollerRunning(): boolean {
  return state.running
}
