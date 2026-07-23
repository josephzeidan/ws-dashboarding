// Backtest over ~60 sessions of 5-minute bars. Two systems are simulated on
// identical data so their results are directly comparable:
//  A. Ensemble: confirmed opening-range breakout with VWAP alignment + volume
//     filter, stop at the opposite side of the range, exit at stop or close.
//  B. The user's original 10am rule: at 10:00, long if price is closer to the
//     opening-range high, short if closer to the low; hold to the close.

import { Bar, RANGE_END, fetchBars, groupBySession, vwapSeries } from './intraday'

export interface TradeRecord {
  date: string
  side: 'LONG' | 'SHORT'
  entry: number
  exit: number
  pct: number // signed return %
  outcome: 'WIN' | 'LOSS'
  exitReason?: string
}

export interface SystemStats {
  label: string
  trades: number
  wins: number
  winRate: number // %
  avgPct: number
  cumPct: number
  bestPct: number
  worstPct: number
  records: TradeRecord[]
}

export interface BacktestResult {
  sessions: number
  from: string
  to: string
  ensemble: SystemStats
  originalRule: SystemStats
}

const r2 = (v: number) => Math.round(v * 100) / 100

function stats(label: string, records: TradeRecord[]): SystemStats {
  const wins = records.filter((r) => r.pct > 0).length
  const cum = records.reduce((s, r) => s + r.pct, 0)
  return {
    label,
    trades: records.length,
    wins,
    winRate: records.length ? r2((wins / records.length) * 100) : 0,
    avgPct: records.length ? r2(cum / records.length) : 0,
    cumPct: r2(cum),
    bestPct: records.length ? r2(Math.max(...records.map((r) => r.pct))) : 0,
    worstPct: records.length ? r2(Math.min(...records.map((r) => r.pct))) : 0,
    records: records.slice(-30).reverse(), // latest first, capped for the UI
  }
}

function simulateEnsemble(sessions: { date: string; bars: Bar[] }[]): TradeRecord[] {
  const out: TradeRecord[] = []
  for (const { date, bars } of sessions) {
    const orBars = bars.filter((b) => b.et.minutes < RANGE_END)
    const postBars = bars.filter((b) => b.et.minutes >= RANGE_END)
    if (orBars.length < 3 || postBars.length < 10) continue

    const orHigh = Math.max(...orBars.map((b) => b.high))
    const orLow = Math.min(...orBars.map((b) => b.low))
    const avgOrVol = orBars.reduce((s, b) => s + b.volume, 0) / orBars.length
    const vwaps = vwapSeries(bars)
    const offset = orBars.length

    let side: 'LONG' | 'SHORT' | null = null
    let entry = 0
    let entryIdx = -1
    for (let i = 0; i < postBars.length; i++) {
      const b = postBars[i]
      const vwap = vwaps[offset + i]
      if (b.et.minutes >= 15 * 60) break // no fresh entries in the last hour
      if (b.close > orHigh && b.close > vwap && b.volume > avgOrVol * 1.1) {
        side = 'LONG'; entry = b.close; entryIdx = i; break
      }
      if (b.close < orLow && b.close < vwap && b.volume > avgOrVol * 1.1) {
        side = 'SHORT'; entry = b.close; entryIdx = i; break
      }
    }
    if (!side) continue

    const stop = side === 'LONG' ? orLow : orHigh
    let exit = postBars[postBars.length - 1].close
    let exitReason = 'close'
    for (let i = entryIdx + 1; i < postBars.length; i++) {
      const b = postBars[i]
      if (side === 'LONG' && b.low <= stop) { exit = stop; exitReason = 'stop'; break }
      if (side === 'SHORT' && b.high >= stop) { exit = stop; exitReason = 'stop'; break }
    }
    const pct = side === 'LONG' ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100
    out.push({ date, side, entry: r2(entry), exit: r2(exit), pct: r2(pct), outcome: pct > 0 ? 'WIN' : 'LOSS', exitReason })
  }
  return out
}

function simulateOriginalRule(sessions: { date: string; bars: Bar[] }[]): TradeRecord[] {
  const out: TradeRecord[] = []
  for (const { date, bars } of sessions) {
    const orBars = bars.filter((b) => b.et.minutes < RANGE_END)
    const postBars = bars.filter((b) => b.et.minutes >= RANGE_END)
    if (orBars.length < 3 || postBars.length < 10) continue

    const orHigh = Math.max(...orBars.map((b) => b.high))
    const orLow = Math.min(...orBars.map((b) => b.low))
    const at10 = postBars[0]
    const entry = at10.open
    const side: 'LONG' | 'SHORT' = entry - orLow >= orHigh - entry ? 'LONG' : 'SHORT'
    const exit = postBars[postBars.length - 1].close
    const pct = side === 'LONG' ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100
    out.push({ date, side, entry: r2(entry), exit: r2(exit), pct: r2(pct), outcome: pct > 0 ? 'WIN' : 'LOSS' })
  }
  return out
}

export async function runBacktest(symbol = 'SPY'): Promise<BacktestResult> {
  const bars = await fetchBars(symbol, '5m', '60d')
  const sessions = groupBySession(bars)
  // Drop the live (possibly partial) session so both systems see complete days.
  const complete = sessions.filter((s) => s.bars.length >= 60)

  return {
    sessions: complete.length,
    from: complete[0]?.date ?? '',
    to: complete[complete.length - 1]?.date ?? '',
    ensemble: stats('Ensemble (confirmed ORB + VWAP + volume, stop at range)', simulateEnsemble(complete)),
    originalRule: stats('Original 10am rule (closer to high → long, hold to close)', simulateOriginalRule(complete)),
  }
}
