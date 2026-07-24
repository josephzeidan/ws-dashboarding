import { describe, it, expect } from 'vitest'
import { buildZoneGeometry, detectTouches } from '../zones'
import { DEFAULT_SR_CONFIG } from '../config'
import type { Cluster, Swing } from '../types'
import { bar, norm } from './fixtures'

const cfg = DEFAULT_SR_CONFIG

function swing(index: number, price: number, bodyEdge: number, kind: 'HIGH' | 'LOW'): Swing {
  return { index, t: index * 1000, price, bodyEdge, kind, prominenceATR: 1, atrAtPivot: 1, provisional: false }
}

describe('zone boundaries (extreme edge is sacred)', () => {
  const atrSeries = new Array(200).fill(1) // atrRef = 1

  it('preserves the extreme high when trimming a too-wide resistance', () => {
    const cluster: Cluster = { polarity: 'RESISTANCE', swings: [swing(10, 110.2, 108, 'HIGH'), swing(20, 110.0, 109, 'HIGH')] }
    const g = buildZoneGeometry(cluster, atrSeries, cfg)
    expect(g.upper).toBeCloseTo(110.2, 6) // extreme preserved
    expect(g.anchor).toBeCloseTo(110.2, 6)
    expect(g.upper - g.lower).toBeLessThanOrEqual(cfg.zoneMaxWidthATR + 1e-6) // trimmed to maxW
  })

  it('preserves the extreme when widening a too-thin resistance', () => {
    const cluster: Cluster = { polarity: 'RESISTANCE', swings: [swing(10, 110.0, 109.95, 'HIGH')] }
    const g = buildZoneGeometry(cluster, atrSeries, cfg)
    expect(g.upper).toBeCloseTo(110.0, 6)
    expect(g.anchor).toBeCloseTo(110.0, 6)
    expect(g.upper - g.lower).toBeCloseTo(cfg.zoneMinWidthATR, 6) // widened to minW
  })

  it('preserves the extreme low for support', () => {
    const cluster: Cluster = { polarity: 'SUPPORT', swings: [swing(10, 90.0, 90.05, 'LOW')] }
    const g = buildZoneGeometry(cluster, atrSeries, cfg)
    expect(g.lower).toBeCloseTo(90.0, 6)
    expect(g.anchor).toBeCloseTo(90.0, 6)
  })
})

describe('touch detection (chop is not touches)', () => {
  const atrSeries = new Array(200).fill(1)
  const geom: any = { lower: 98, upper: 100, anchor: 98, atrRef: 1, anchorIndex: 0, polarity: 'SUPPORT', startIndex: 0 }

  it('counts a long consolidation inside the zone as ONE touch', () => {
    const bars = [
      ...Array.from({ length: 2 }, () => bar(103, 103.2, 102.8, 103)), // outside above
      ...Array.from({ length: 30 }, () => bar(99, 99.5, 98.5, 99)), // 30 bars inside
      bar(101.2, 101.6, 101.0, 101.4), // exit up by >1 ATR
    ]
    const { touches, activeTouch } = detectTouches(geom, norm(bars), atrSeries, cfg, 3)
    expect(touches.length).toBe(1)
    expect(activeTouch).toBeNull()
  })

  it('counts two visits separated by a >1 ATR excursion as TWO touches', () => {
    const bars = [
      bar(103, 103.2, 102.8, 103),
      ...Array.from({ length: 8 }, () => bar(99, 99.5, 98.5, 99)), // visit 1
      bar(101.2, 101.6, 101.0, 101.4), // exit up
      ...Array.from({ length: 8 }, () => bar(103, 103.2, 102.8, 103)), // away (separation)
      ...Array.from({ length: 8 }, () => bar(99, 99.5, 98.5, 99)), // visit 2
      bar(101.2, 101.6, 101.0, 101.4), // exit up
    ]
    const { touches } = detectTouches(geom, norm(bars), atrSeries, cfg, 3)
    expect(touches.length).toBe(2)
  })
})
