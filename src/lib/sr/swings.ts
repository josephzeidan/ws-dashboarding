// Swing/pivot detection (spec §6): fractal detection gated by ATR prominence,
// with alternation cleanup and trailing-edge provisional marking. The provisional
// rule is the main defence against lookahead bias — pivots in the final k bars
// cannot be confirmed and must never count toward a zone.

import type { Bar } from '@/lib/market-data/provider'
import type { Swing, SwingParams } from './types'

function maxH(bars: Bar[], a: number, b: number): number {
  let m = -Infinity
  for (let i = a; i <= b; i++) if (bars[i].h > m) m = bars[i].h
  return m
}
function minL(bars: Bar[], a: number, b: number): number {
  let m = Infinity
  for (let i = a; i <= b; i++) if (bars[i].l < m) m = bars[i].l
  return m
}

export function detectSwings(bars: Bar[], atrSeries: number[], params: SwingParams): Swing[] {
  const k = params.swingLookback
  const pw = params.prominenceWindow
  const n = bars.length
  if (n < 2 * k + 1) return []

  // Stage 1 — raw fractals (>= / <= allows equal-high/low plateaus)
  const raw: Swing[] = []
  for (let i = k; i < n - k; i++) {
    const atrI = atrSeries[i] || 1e-9
    const isHigh = bars[i].h >= maxH(bars, i - k, i + k)
    const isLow = bars[i].l <= minL(bars, i - k, i + k)

    if (isHigh) {
      // Stage 2 — prominence: both sides must have retraced (use the shallower side)
      const lowAfter = minL(bars, i + 1, Math.min(n - 1, i + pw))
      const lowBefore = minL(bars, Math.max(0, i - pw), i - 1)
      const drop = (bars[i].h - Math.max(lowAfter, lowBefore)) / atrI
      if (drop >= params.minProminenceATR) {
        raw.push({
          index: i, t: bars[i].t, price: bars[i].h, bodyEdge: Math.max(bars[i].o, bars[i].c),
          kind: 'HIGH', prominenceATR: drop, atrAtPivot: atrI, provisional: false,
        })
      }
    }
    if (isLow) {
      const highAfter = maxH(bars, i + 1, Math.min(n - 1, i + pw))
      const highBefore = maxH(bars, Math.max(0, i - pw), i - 1)
      const rise = (Math.min(highAfter, highBefore) - bars[i].l) / atrI
      if (rise >= params.minProminenceATR) {
        raw.push({
          index: i, t: bars[i].t, price: bars[i].l, bodyEdge: Math.min(bars[i].o, bars[i].c),
          kind: 'LOW', prominenceATR: rise, atrAtPivot: atrI, provisional: false,
        })
      }
    }
  }

  raw.sort((a, b) => a.index - b.index)

  // Stage 3 — alternation cleanup: collapse consecutive same-kind pivots, keeping
  // the more extreme (higher high / lower low).
  const alt: Swing[] = []
  for (const s of raw) {
    const last = alt[alt.length - 1]
    if (last && last.kind === s.kind) {
      const moreExtreme = s.kind === 'HIGH' ? s.price > last.price : s.price < last.price
      if (moreExtreme) alt[alt.length - 1] = s
    } else {
      alt.push(s)
    }
  }

  // Stage 4 — trailing-edge: mark pivots within the final k bars provisional.
  for (const s of alt) {
    if (n - 1 - s.index < k) s.provisional = true
  }

  return alt
}
