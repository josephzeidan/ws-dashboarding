// Builds the "safest expression" of a directional day view: a defined-risk
// debit vertical (bull call / bear put) 3–7 days out — never naked 0DTE.
// Chain data comes from Yahoo's options endpoint (cookie+crumb gated).

import { getCrumb } from '@/lib/rating/fundamentals'

interface ChainOption {
  strike: number
  bid: number | null
  ask: number | null
  lastPrice: number | null
}

export interface SpreadRecommendation {
  kind: 'BULL_CALL_SPREAD' | 'BEAR_PUT_SPREAD'
  expiry: string // YYYY-MM-DD
  dte: number
  longStrike: number
  shortStrike: number
  longMid: number
  shortMid: number
  netDebit: number // per share
  maxRiskPerContract: number // $ (debit × 100)
  maxProfitPerContract: number
  breakeven: number
  riskReward: number
  expectedMoveUsed: number
  note: string
}

export interface NoTrade {
  kind: 'NO_TRADE'
  reason: string
}

export type TradeIdea = SpreadRecommendation | NoTrade

function mid(o: ChainOption): number | null {
  if (o.bid != null && o.ask != null && o.ask > 0) return (o.bid + o.ask) / 2
  return o.lastPrice ?? null
}

const r2 = (v: number) => Math.round(v * 100) / 100

async function fetchChain(symbol: string, date?: number): Promise<any | null> {
  const cr = await getCrumb()
  if (!cr) return null
  const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(cr.crumb)}${date ? `&date=${date}` : ''}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cr.cookie }, cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  return data?.optionChain?.result?.[0] ?? null
}

export async function buildTradeIdea(
  symbol: string,
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  confidence: number,
  spot: number,
  expectedMovePct: number // e.g. avg daily range %
): Promise<TradeIdea> {
  if (direction === 'NEUTRAL' || confidence < 55) {
    return {
      kind: 'NO_TRADE',
      reason:
        direction === 'NEUTRAL'
          ? 'No directional edge today — the signals disagree or the session is choppy. Standing aside is the highest-expectancy move.'
          : `Directional lean is ${direction.toLowerCase()} but confidence (${confidence}) is below the 55 threshold — the edge doesn't justify paying spread + theta.`,
    }
  }

  const root = await fetchChain(symbol)
  if (!root) return { kind: 'NO_TRADE', reason: 'Options chain unavailable right now — try refreshing in a minute.' }

  const nowSec = Date.now() / 1000
  const expiries: number[] = root.expirationDates ?? []
  // 3–7 DTE sweet spot: enough time to be right, limited theta bleed. Fall back to 2–10.
  const pick =
    expiries.find((e) => e - nowSec > 3 * 86400 && e - nowSec < 7.5 * 86400) ??
    expiries.find((e) => e - nowSec > 2 * 86400 && e - nowSec < 10.5 * 86400)
  if (!pick) return { kind: 'NO_TRADE', reason: 'No suitable expiry (3–7 days out) found in the chain.' }

  const chain = await fetchChain(symbol, pick)
  const opts = chain?.options?.[0]
  if (!opts) return { kind: 'NO_TRADE', reason: 'Could not load the option chain for the chosen expiry.' }

  const dte = Math.max(1, Math.round((pick - nowSec) / 86400))
  const expectedMove = spot * (expectedMovePct / 100) * Math.sqrt(dte)

  const list: ChainOption[] = (direction === 'BULLISH' ? opts.calls : opts.puts) ?? []
  if (list.length < 4) return { kind: 'NO_TRADE', reason: 'Option chain too thin to build a spread.' }
  const strikes = list.map((o) => o.strike).sort((a, b) => a - b)

  const nearest = (target: number) => strikes.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), strikes[0])

  let longStrike: number
  let shortStrike: number
  if (direction === 'BULLISH') {
    longStrike = nearest(spot) // ATM long call
    shortStrike = nearest(spot + expectedMove)
    if (shortStrike <= longStrike) shortStrike = strikes[strikes.indexOf(longStrike) + 2] ?? longStrike + 2
  } else {
    longStrike = nearest(spot) // ATM long put
    shortStrike = nearest(spot - expectedMove)
    if (shortStrike >= longStrike) shortStrike = strikes[strikes.indexOf(longStrike) - 2] ?? longStrike - 2
  }

  const byStrike = new Map(list.map((o) => [o.strike, o]))
  const longOpt = byStrike.get(longStrike)
  const shortOpt = byStrike.get(shortStrike)
  const longMid = longOpt ? mid(longOpt) : null
  const shortMid = shortOpt ? mid(shortOpt) : null
  if (longMid == null || shortMid == null) return { kind: 'NO_TRADE', reason: 'Missing quotes on the chosen strikes.' }

  const netDebit = longMid - shortMid
  const width = Math.abs(shortStrike - longStrike)
  if (netDebit <= 0 || netDebit >= width) return { kind: 'NO_TRADE', reason: 'Spread pricing looks off (stale quotes) — refresh during market hours.' }

  const maxProfit = width - netDebit
  const expiry = new Date(pick * 1000).toISOString().slice(0, 10)

  return {
    kind: direction === 'BULLISH' ? 'BULL_CALL_SPREAD' : 'BEAR_PUT_SPREAD',
    expiry,
    dte,
    longStrike,
    shortStrike,
    longMid: r2(longMid),
    shortMid: r2(shortMid),
    netDebit: r2(netDebit),
    maxRiskPerContract: r2(netDebit * 100),
    maxProfitPerContract: r2(maxProfit * 100),
    breakeven: r2(direction === 'BULLISH' ? longStrike + netDebit : longStrike - netDebit),
    riskReward: r2(maxProfit / netDebit),
    expectedMoveUsed: r2(expectedMove),
    note: `Defined risk: you can never lose more than the debit. ${dte} DTE avoids 0DTE theta burn while staying tactical.`,
  }
}
