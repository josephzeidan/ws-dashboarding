// SPY intraday ensemble. Six sub-strategies vote in [-1, +1]; votes are
// weighted (weights favor the signals with documented edge — confirmed
// opening-range breakout + VWAP trend), a chop filter penalizes low-quality
// sessions, and the aggregate becomes direction + 0-100 confidence.

import { Bar, RANGE_END, SESSION_OPEN, vwapSeries } from './intraday'

export interface Vote {
  key: string
  label: string
  weight: number
  vote: number // -1..+1
  note: string
}

export interface DayAnalysis {
  state: 'RANGE_FORMING' | 'ACTIVE' | 'CLOSED'
  sessionDate: string
  price: number
  openingRange: { high: number; low: number; widthPct: number } | null
  vwap: number | null
  priorClose: number | null
  priorHigh: number | null
  priorLow: number | null
  gapPct: number | null
  votes: Vote[]
  aggregate: number // -1..+1
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: number // 0-100
  chopPenalty: number
  series: { minutes: number; close: number; vwap: number }[] // for the chart
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v))
const r2 = (v: number) => Math.round(v * 100) / 100

export function analyzeSession(
  bars: Bar[],
  prior?: { close: number; high: number; low: number },
  opts: { barMinutes?: number } = {}
): DayAnalysis {
  const barMinutes = opts.barMinutes ?? 1
  const bars30 = Math.max(2, Math.round(30 / barMinutes)) // bars in a 30-min window
  const sessionDate = bars[bars.length - 1]?.et.date ?? ''
  const price = bars[bars.length - 1]?.close ?? 0
  const lastMinutes = bars[bars.length - 1]?.et.minutes ?? 0

  const orBars = bars.filter((b) => b.et.minutes < RANGE_END)
  const postBars = bars.filter((b) => b.et.minutes >= RANGE_END)
  const vwaps = vwapSeries(bars)
  const vwap = vwaps[vwaps.length - 1] ?? null
  const series = bars.map((b, i) => ({ minutes: b.et.minutes, close: r2(b.close), vwap: r2(vwaps[i]) }))

  if (orBars.length === 0) {
    return {
      state: 'RANGE_FORMING', sessionDate, price, openingRange: null, vwap,
      priorClose: prior?.close ?? null, priorHigh: prior?.high ?? null, priorLow: prior?.low ?? null,
      gapPct: null, votes: [], aggregate: 0, direction: 'NEUTRAL', confidence: 0, chopPenalty: 0, series,
    }
  }

  const orHigh = Math.max(...orBars.map((b) => b.high))
  const orLow = Math.min(...orBars.map((b) => b.low))
  const orMid = (orHigh + orLow) / 2
  const orWidth = orHigh - orLow
  const widthPct = (orWidth / price) * 100

  if (postBars.length === 0) {
    return {
      state: 'RANGE_FORMING', sessionDate, price,
      openingRange: { high: r2(orHigh), low: r2(orLow), widthPct: r2(widthPct) }, vwap,
      priorClose: prior?.close ?? null, priorHigh: prior?.high ?? null, priorLow: prior?.low ?? null,
      gapPct: prior ? r2(((bars[0].open - prior.close) / prior.close) * 100) : null,
      votes: [], aggregate: 0, direction: 'NEUTRAL', confidence: 0, chopPenalty: 0, series,
    }
  }

  const votes: Vote[] = []

  // 1. Confirmed opening-range breakout (highest weight — the documented setup).
  {
    const avgOrVol = orBars.reduce((s, b) => s + b.volume, 0) / orBars.length
    let vote = 0
    let note = 'price still inside the opening range — no confirmed breakout'
    let broke: 'up' | 'down' | null = null
    for (const b of postBars) {
      if (b.close > orHigh) { broke = 'up'; break }
      if (b.close < orLow) { broke = 'down'; break }
    }
    if (broke) {
      const stillBeyond = broke === 'up' ? price > orHigh : price < orLow
      const breakoutBar = postBars.find((b) => (broke === 'up' ? b.close > orHigh : b.close < orLow))!
      const volConfirm = breakoutBar.volume > avgOrVol * 1.1
      const base = broke === 'up' ? 1 : -1
      vote = base * (stillBeyond ? 1 : 0.3) * (volConfirm ? 1 : 0.7)
      note = `${broke === 'up' ? 'upside' : 'downside'} breakout${volConfirm ? ' on expanding volume' : ' (weak volume)'}${stillBeyond ? ', still holding beyond the range' : ', but price fell back inside — failed break'}`
    }
    votes.push({ key: 'orb', label: 'Opening-range breakout (confirmed)', weight: 0.3, vote: clamp(vote), note })
  }

  // 2. VWAP trend.
  if (vwap != null) {
    const dist = (price - vwap) / price
    const lookback = Math.min(bars30, bars.length - 1)
    const slope = vwaps[vwaps.length - 1] - vwaps[vwaps.length - 1 - lookback]
    const vote = clamp((dist / 0.0015) * 0.7) + (slope > 0 ? 0.3 : slope < 0 ? -0.3 : 0)
    votes.push({
      key: 'vwap', label: 'VWAP trend', weight: 0.25, vote: clamp(vote),
      note: `price ${dist >= 0 ? 'above' : 'below'} VWAP by ${r2(Math.abs(dist) * 100)}%, VWAP sloping ${slope > 0 ? 'up' : slope < 0 ? 'down' : 'flat'}`,
    })
  }

  // 3. 30-minute momentum.
  {
    const idx = Math.max(0, bars.length - bars30 - 1)
    const ret = (price - bars[idx].close) / bars[idx].close
    votes.push({
      key: 'momentum', label: '30-min momentum', weight: 0.15, vote: clamp(ret / 0.0025),
      note: `${ret >= 0 ? '+' : ''}${r2(ret * 100)}% over the last 30 minutes`,
    })
  }

  // 4. Gap behavior vs prior close.
  let gapPct: number | null = null
  if (prior) {
    gapPct = ((bars[0].open - prior.close) / prior.close) * 100
    const holding = price > prior.close
    let vote = 0
    if (Math.abs(gapPct) >= 0.15) {
      // gap-and-go if holding in gap direction; fade if gap has been given back
      vote = gapPct > 0 ? (holding ? 0.8 : -0.5) : holding ? 0.5 : -0.8
    }
    votes.push({
      key: 'gap', label: 'Gap behavior', weight: 0.1, vote: clamp(vote),
      note: `${gapPct >= 0 ? '+' : ''}${r2(gapPct)}% gap vs prior close, price now ${holding ? 'above' : 'below'} prior close`,
    })
  }

  // 5. Position within the opening range (the user's original 10am idea — kept as a weak vote).
  {
    const half = orWidth / 2 || 1
    const vote = clamp((price - orMid) / half) * 0.8
    votes.push({
      key: 'rangepos', label: 'Range position (original rule)', weight: 0.1, vote,
      note: `price sits ${r2(((price - orLow) / (orWidth || 1)) * 100)}% up the opening range`,
    })
  }

  // 6. Prior-day levels.
  if (prior) {
    let vote = 0
    let note = 'between prior day high and low'
    if (price > prior.high) { vote = 1; note = 'trading above the prior day high — trend continuation zone' }
    else if (price < prior.low) { vote = -1; note = 'trading below the prior day low — breakdown zone' }
    else vote = clamp(((price - prior.close) / prior.close) / 0.004)
    votes.push({ key: 'prior', label: 'Prior-day levels', weight: 0.1, vote: clamp(vote), note })
  }

  // Chop filter: tight range and/or repeated VWAP whipsaws → penalize confidence.
  let chopPenalty = 0
  if (widthPct < 0.18) chopPenalty += 20
  {
    let crosses = 0
    const start = Math.max(1, bars.length - bars30 * 2)
    for (let i = start; i < bars.length; i++) {
      const prev = bars[i - 1].close - vwaps[i - 1]
      const cur = bars[i].close - vwaps[i]
      if ((prev > 0 && cur < 0) || (prev < 0 && cur > 0)) crosses++
    }
    if (crosses >= 6) chopPenalty += 25
    else if (crosses >= 4) chopPenalty += 12
  }

  const totalWeight = votes.reduce((s, v) => s + v.weight, 0)
  const aggregate = votes.reduce((s, v) => s + v.vote * v.weight, 0) / (totalWeight || 1)

  // Agreement bonus: how unanimous are the meaningful votes?
  const meaningful = votes.filter((v) => Math.abs(v.vote) > 0.15)
  const agreeing = meaningful.filter((v) => Math.sign(v.vote) === Math.sign(aggregate)).length
  const agreement = meaningful.length > 0 ? agreeing / meaningful.length : 0

  let confidence = Math.min(95, Math.abs(aggregate) * 110 + agreement * 20) - chopPenalty
  confidence = Math.max(0, Math.round(confidence))

  const direction: DayAnalysis['direction'] =
    confidence >= 35 && aggregate > 0.12 ? 'BULLISH' : confidence >= 35 && aggregate < -0.12 ? 'BEARISH' : 'NEUTRAL'

  return {
    state: lastMinutes >= 955 ? 'CLOSED' : 'ACTIVE',
    sessionDate, price: r2(price),
    openingRange: { high: r2(orHigh), low: r2(orLow), widthPct: r2(widthPct) },
    vwap: vwap != null ? r2(vwap) : null,
    priorClose: prior ? r2(prior.close) : null,
    priorHigh: prior ? r2(prior.high) : null,
    priorLow: prior ? r2(prior.low) : null,
    gapPct: gapPct != null ? r2(gapPct) : null,
    votes: votes.map((v) => ({ ...v, vote: Math.round(v.vote * 100) / 100 })),
    aggregate: Math.round(aggregate * 1000) / 1000,
    direction,
    confidence: direction === 'NEUTRAL' ? Math.min(confidence, 34) : confidence,
    chopPenalty,
    series,
  }
}
