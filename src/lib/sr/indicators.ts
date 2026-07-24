// Pure indicator functions (spec §5). ATR is the universal unit — every
// threshold in the engine is expressed in ATR multiples, never dollars/percent.

import type { Bar } from '@/lib/market-data/provider'

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** True Range series. TR[0] = h-l. */
export function trueRange(bars: Bar[]): number[] {
  const tr: number[] = []
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr.push(bars[i].h - bars[i].l)
    } else {
      const prevC = bars[i - 1].c
      tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prevC), Math.abs(bars[i].l - prevC)))
    }
  }
  return tr
}

/** Wilder-smoothed ATR series (spec §5.1). Returns one value per bar; the first
 *  `period-1` values are seeded with a running mean so early bars aren't NaN. */
export function atr(bars: Bar[], period = 14): number[] {
  const tr = trueRange(bars)
  const out: number[] = new Array(bars.length).fill(0)
  if (bars.length === 0) return out

  let runningSum = 0
  let seed = 0
  for (let i = 0; i < bars.length; i++) {
    if (i < period) {
      runningSum += tr[i]
      seed = runningSum / (i + 1)
      out[i] = seed
      if (i === period - 1) out[i] = runningSum / period // proper SMA seed at the boundary
    } else {
      out[i] = (out[i - 1] * (period - 1) + tr[i]) / period
    }
  }
  return out
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  const k = 2 / (period + 1)
  let prev = values[0]
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** Kaufman efficiency ratio over closes[start..end] inclusive (spec §5.2). */
export function efficiencyRatio(closes: number[], start: number, end: number): number {
  if (end <= start) return 0
  const net = Math.abs(closes[end] - closes[start])
  let path = 0
  for (let i = start + 1; i <= end; i++) path += Math.abs(closes[i] - closes[i - 1])
  return path === 0 ? 0 : net / path
}

/** OLS regression of closes against index over the last `window` bars (spec §5.3).
 *  normSlope = total drift over the window expressed in ATRs. */
export function linreg(closes: number[], window: number, atrLast: number): { slope: number; normSlope: number; r2: number; intercept: number } {
  const n = Math.min(window, closes.length)
  const seg = closes.slice(closes.length - n)
  if (n < 2) return { slope: 0, normSlope: 0, r2: 0, intercept: seg[0] ?? 0 }

  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (let i = 0; i < n; i++) {
    sx += i
    sy += seg[i]
    sxx += i * i
    sxy += i * seg[i]
  }
  const denom = n * sxx - sx * sx
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n

  // r²
  const meanY = sy / n
  let ssTot = 0, ssRes = 0
  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept
    ssTot += (seg[i] - meanY) ** 2
    ssRes += (seg[i] - pred) ** 2
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot
  const normSlope = atrLast > 0 ? (slope * n) / atrLast : 0
  return { slope, normSlope, r2, intercept }
}

/** Fraction of series values <= x (spec §5.4). */
export function pctRank(x: number, series: number[]): number {
  if (series.length === 0) return 0
  let count = 0
  for (const v of series) if (v <= x) count++
  return count / series.length
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}
