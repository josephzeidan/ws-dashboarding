import { describe, it, expect } from 'vitest'
import { detectSwings } from '../swings'
import { atr } from '../indicators'
import { swingParamsFor } from '../config'
import { zigzag, norm, bar } from './fixtures'

describe('swing detection', () => {
  it('finds the turning points of a clean zigzag', () => {
    const bars = zigzag(4, 12, 100, 24) // 100→124→100→124→100
    const swings = detectSwings(bars, atr(bars, 14), swingParamsFor('1h'))
    const highs = swings.filter((s) => s.kind === 'HIGH')
    const lows = swings.filter((s) => s.kind === 'LOW')
    expect(highs.length).toBeGreaterThanOrEqual(1)
    expect(lows.length).toBeGreaterThanOrEqual(1)
    expect(swings.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects noise below the prominence threshold', () => {
    // Wiggles of ~±0.3 with ATR fixed at 2.0 → any pivot's retracement is well
    // under the 0.8-ATR prominence floor, so nothing survives. Passing a fixed
    // ATR isolates the prominence gate from ATR adapting to the low volatility.
    const noise = norm(Array.from({ length: 60 }, (_, i) => {
      const p = 100 + Math.sin(i) * 0.25
      return bar(p, p + 0.1, p - 0.1, p)
    }))
    const atrSeries = new Array(60).fill(2.0)
    const swings = detectSwings(noise, atrSeries, swingParamsFor('1h'))
    expect(swings.length).toBe(0)
  })

  it('never emits a confirmed pivot inside the trailing k bars (lookahead guard)', () => {
    const bars = zigzag(4, 12, 100, 24)
    const k = swingParamsFor('1h').swingLookback
    const swings = detectSwings(bars, atr(bars, 14), swingParamsFor('1h'))
    for (const s of swings.filter((x) => !x.provisional)) {
      expect(bars.length - 1 - s.index).toBeGreaterThanOrEqual(k)
    }
  })
})
