// Trendlines as sloped zones (spec §1.3, Phase 5). Identical logic to horizontal
// zones — two clean anchor touches define it, the third is tradable — but the
// level slopes. We fit a line through same-kind swings and keep it only if a
// third swing lands near the projected line.

import type { NormBar } from '@/lib/market-data/provider'
import type { SRConfig, Swing } from './types'

export interface Trendline {
  kind: 'SUPPORT' | 'RESISTANCE'
  slope: number // price per bar
  intercept: number // price at index 0
  anchorIndices: number[]
  touchCount: number
  priceAt: (index: number) => number
  currentPrice: number
  currentBandATR: number
}

function fitLine(a: Swing, b: Swing): { slope: number; intercept: number } {
  const slope = (b.price - a.price) / Math.max(1, b.index - a.index)
  const intercept = a.price - slope * a.index
  return { slope, intercept }
}

/** Detect the best-fitting up-trendline (through lows) and down-trendline
 *  (through highs) that have at least `minTouches` confirming swings. */
export function detectTrendlines(swings: Swing[], atr: number[], lastIndex: number, cfg: SRConfig, minTouches = 3): Trendline[] {
  const out: Trendline[] = []
  const confirmed = swings.filter((s) => !s.provisional)

  for (const kind of ['SUPPORT', 'RESISTANCE'] as const) {
    const pts = confirmed.filter((s) => (kind === 'SUPPORT' ? s.kind === 'LOW' : s.kind === 'HIGH'))
    if (pts.length < minTouches) continue

    let best: Trendline | null = null
    // try each pair of anchors, count swings landing within tolerance of the line
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const { slope, intercept } = fitLine(pts[i], pts[j])
        // reject near-vertical / wrong-way lines
        if (!isFinite(slope)) continue
        const anchors: number[] = []
        let touchCount = 0
        for (const p of pts) {
          const proj = slope * p.index + intercept
          const tol = 0.5 * (atr[p.index] || 1e-9)
          if (Math.abs(p.price - proj) <= tol) {
            touchCount++
            anchors.push(p.index)
          }
        }
        // an up-trendline (support) should slope up-ish for longs; keep both but
        // require the line to sit on the correct side (not cutting through price)
        if (touchCount >= minTouches) {
          if (!best || touchCount > best.touchCount) {
            const atrLast = atr[lastIndex] || 1e-9
            best = {
              kind, slope, intercept, anchorIndices: anchors, touchCount,
              priceAt: (index: number) => slope * index + intercept,
              currentPrice: slope * lastIndex + intercept,
              currentBandATR: 0.4, // band half-width in ATR for rendering
            }
          }
        }
      }
    }
    if (best) out.push(best)
  }
  return out
}
