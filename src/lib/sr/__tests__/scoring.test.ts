import { describe, it, expect } from 'vitest'
import { scoreZone } from '../scoring'
import { DEFAULT_SR_CONFIG } from '../config'
import type { Zone } from '../types'

const cfg = DEFAULT_SR_CONFIG

describe('scoring config', () => {
  it('scoring weights sum to 1.0', () => {
    const w = cfg.weights
    const sum = w.touch + w.velocity + w.extremity + w.htf + w.round + w.freshness
    expect(sum).toBeCloseTo(1.0, 6)
  })
})

describe('grade gate (Key #3)', () => {
  it('never grades a single-touch zone above B, even with max components', () => {
    const z: Zone = {
      id: 'z', symbol: 'T', timeframe: '1D', polarity: 'RESISTANCE', status: 'ACTIVE',
      lower: 100, upper: 101, anchor: 101, midpoint: 100.5, widthATR: 1, atrRef: 1,
      touchCount: 1, // <-- one touch
      touches: [{ index: 5, t: 5000, penetrationATR: 0, provisional: false, reaction: { displacementATR: 3, barsToExtreme: 2, velocityATRPerBar: 1.5, efficiency: 1, bodyRatio: 1, score: 100 } }],
      activeTouch: null, firstTouchAt: '', lastTouchAt: '',
      strength: 0, grade: 'D',
      components: { touch: 100, velocity: 100, extremity: 100, htf: 100, round: 100, freshness: 100 },
      bonuses: 0, penalties: 0, confluenceTFs: [], roundNumber: null, events: [], flipped: false,
      extensions: 0, filtered: false, distanceFromPrice: 0, distanceATR: 0, reasons: [], warnings: [], anchorIndex: 5,
    }
    scoreZone(z, cfg, 10)
    expect(['A+', 'A']).not.toContain(z.grade)
  })
})
