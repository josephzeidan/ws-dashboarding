// Alert engine: rules run inside the poller ticks; alerts are persisted with
// a dedupe key (one alert per rule/ticker/session) and pushed live over SSE.

import { prisma } from '@/lib/prisma'
import { broadcast } from '@/lib/live/broadcaster'
import { toEt } from '@/lib/daytrade/intraday'
import type { YahooPrice } from '@/lib/yahoo-finance'

export interface AlertPayload {
  id: string
  type: string
  ticker: string
  title: string
  body: string
  href: string
  severity: string
  createdAt: string
}

/** Create + broadcast an alert unless the dedupe key already fired. */
export async function raiseAlert(input: {
  type: string
  ticker?: string
  title: string
  body?: string
  href?: string
  severity?: 'info' | 'warning' | 'action'
  dedupeKey: string
}): Promise<void> {
  try {
    const alert = await prisma.alert.create({
      data: {
        type: input.type,
        ticker: input.ticker ?? '',
        title: input.title,
        body: input.body ?? '',
        href: input.href ?? '',
        severity: input.severity ?? 'info',
        dedupeKey: input.dedupeKey,
      },
    })
    broadcast('alert', {
      id: alert.id,
      type: alert.type,
      ticker: alert.ticker,
      title: alert.title,
      body: alert.body,
      href: alert.href,
      severity: alert.severity,
      createdAt: alert.createdAt.toISOString(),
    } satisfies AlertPayload)
  } catch {
    // unique(dedupeKey) violation → already alerted; stay quiet
  }
}

function todayEt(): string {
  return toEt(Date.now() / 1000).date
}

/** Rule: any holding moving ±4% or more on the day. */
export async function checkBigMovers(prices: YahooPrice[]): Promise<void> {
  for (const p of prices) {
    if (Math.abs(p.changePct) < 4) continue
    const dir = p.changePct > 0 ? 'up' : 'down'
    await raiseAlert({
      type: 'PRICE_MOVE',
      ticker: p.ticker,
      title: `${p.ticker} is ${dir} ${Math.abs(p.changePct).toFixed(1)}% today`,
      body: `Now $${p.price}. Big enough to check the news and your thesis.`,
      href: '/news',
      severity: 'warning',
      dedupeKey: `PRICE_MOVE:${p.ticker}:${todayEt()}`,
    })
  }
}

/** Rule: watchlist items crossing their alert price (in either direction). */
export async function checkWatchlist(fetchPrices: (tickers: string[]) => Promise<YahooPrice[]>): Promise<void> {
  const items = await prisma.watchlistItem.findMany({ where: { alertPrice: { not: null } } })
  if (items.length === 0) return
  const prices = await fetchPrices(items.map((i) => i.ticker))
  const byTicker = new Map(prices.map((p) => [p.ticker, p]))
  for (const item of items) {
    const p = byTicker.get(item.ticker)
    if (!p || item.alertPrice == null) continue
    // crossed = current price within/past the alert level relative to prev close
    const prev = p.price - p.change
    const crossedDown = prev > item.alertPrice && p.price <= item.alertPrice
    const crossedUp = prev < item.alertPrice && p.price >= item.alertPrice
    if (crossedDown || crossedUp) {
      await raiseAlert({
        type: 'WATCHLIST',
        ticker: item.ticker,
        title: `${item.ticker} crossed your alert price $${item.alertPrice}`,
        body: `Now $${p.price} (${p.changePct > 0 ? '+' : ''}${p.changePct}% today). You were watching this one.`,
        href: '/watchlist',
        severity: 'action',
        dedupeKey: `WATCHLIST:${item.ticker}:${todayEt()}`,
      })
    }
  }
}

/** Rule: price has entered an A/A+ grade S/R zone on a holding or watchlist name. */
export async function checkSrZoneEntries(): Promise<void> {
  const { findAGradeZoneEntries } = await import('@/lib/sr/scanner')
  const [holdings, watch] = await Promise.all([
    prisma.holding.findMany({ where: { quantity: { gt: 0 } }, select: { ticker: true } }),
    prisma.watchlistItem.findMany({ select: { ticker: true } }),
  ])
  const symbols = Array.from(new Set([...holdings.map((h) => h.ticker), ...watch.map((w) => w.ticker)])).slice(0, 8)
  if (symbols.length === 0) return
  const hits = await findAGradeZoneEntries(symbols)
  for (const hit of hits) {
    await raiseAlert({
      type: 'SR_ZONE',
      ticker: hit.symbol,
      title: `${hit.symbol} is at an ${hit.grade} ${hit.polarity.toLowerCase()} zone`,
      body: `Zone $${hit.lower.toFixed(2)}–$${hit.upper.toFixed(2)}${hit.setupConfidence != null ? ` · setup read ${hit.setupConfidence}/100` : ''}. Check structure before acting.`,
      href: '/sr',
      severity: 'action',
      dedupeKey: `SR_ZONE:${hit.symbol}:${hit.grade}:${todayEt()}`,
    })
  }
}

/** Rule: the SPY day-trade ensemble fired above the trade threshold. */
export async function checkDayTradeSignal(direction: string, confidence: number): Promise<void> {
  if (direction === 'NEUTRAL' || confidence < 55) return
  await raiseAlert({
    type: 'DAYTRADE',
    ticker: 'SPY',
    title: `SPY signal: ${direction} (confidence ${confidence})`,
    body: 'The intraday ensemble crossed the trade threshold. Review the defined-risk spread on the Day Trade page.',
    href: '/daytrade',
    severity: 'action',
    dedupeKey: `DAYTRADE:${direction}:${todayEt()}`,
  })
}
