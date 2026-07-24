import { describe, it, expect } from 'vitest'
import { atr, efficiencyRatio, pctRank, linreg } from '../indicators'
import { bar, norm } from './fixtures'

describe('ATR', () => {
  it('equals the constant true range for constant-range flat bars', () => {
    // 20 bars, each h-l = 2, closes flat → every TR = 2 → ATR = 2
    const bars = norm(Array.from({ length: 20 }, () => bar(100, 101, 99, 100)))
    const a = atr(bars, 14)
    expect(a[a.length - 1]).toBeCloseTo(2, 6)
  })

  it('returns one value per bar', () => {
    const bars = norm(Array.from({ length: 30 }, () => bar(50, 51, 49, 50)))
    expect(atr(bars, 14).length).toBe(30)
  })
})

describe('efficiencyRatio', () => {
  it('is 1.0 for a perfectly monotonic series', () => {
    const closes = [1, 2, 3, 4, 5, 6]
    expect(efficiencyRatio(closes, 0, 5)).toBeCloseTo(1, 6)
  })
  it('is ~0 for a pure sawtooth', () => {
    const closes = [1, 2, 1, 2, 1, 2, 1]
    expect(efficiencyRatio(closes, 0, 6)).toBeLessThan(0.2)
  })
  it('guards divide-by-zero', () => {
    expect(efficiencyRatio([5, 5, 5], 0, 2)).toBe(0)
  })
})

describe('pctRank', () => {
  it('ranks correctly', () => {
    expect(pctRank(3, [1, 2, 3, 4])).toBeCloseTo(0.75, 6)
  })
})

describe('linreg', () => {
  it('recovers a known slope', () => {
    const closes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const { slope, r2 } = linreg(closes, 10, 1)
    expect(slope).toBeCloseTo(1, 6)
    expect(r2).toBeCloseTo(1, 6)
  })
})
