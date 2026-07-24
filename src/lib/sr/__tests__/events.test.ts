import { describe, it, expect } from 'vitest'
import { processZoneLifecycle } from '../events'
import { DEFAULT_SR_CONFIG } from '../config'
import type { Zone } from '../types'
import { bar, norm } from './fixtures'

const cfg = DEFAULT_SR_CONFIG

function resZone(): Zone {
  return {
    id: 'z', symbol: 'T', timeframe: '1D', polarity: 'RESISTANCE', status: 'ACTIVE',
    lower: 100, upper: 101, anchor: 101, midpoint: 100.5, widthATR: 1, atrRef: 1,
    touchCount: 2, touches: [], activeTouch: null, firstTouchAt: '', lastTouchAt: '',
    strength: 0, grade: 'D', components: { touch: 0, velocity: 0, extremity: 0, htf: 0, round: 0, freshness: 0 },
    bonuses: 0, penalties: 0, confluenceTFs: [], roundNumber: null, events: [], flipped: false,
    extensions: 0, filtered: false, distanceFromPrice: 0, distanceATR: 0, reasons: [], warnings: [], anchorIndex: 2,
  }
}

describe('decisive break', () => {
  it('does NOT treat a single wick beyond the edge as a break', () => {
    const bars = norm([
      bar(99, 99.5, 98.5, 99), bar(99, 99.5, 98.5, 99), bar(99, 99.5, 98.5, 99),
      bar(99.5, 102, 99.3, 100.4), // wick to 102 but closes back inside at 100.4
      bar(99, 99.5, 98.5, 99), bar(99, 99.5, 98.5, 99),
    ])
    const z = resZone()
    processZoneLifecycle(z, bars, new Array(bars.length).fill(1), cfg)
    expect(z.status).not.toBe('BROKEN')
  })

  it('treats two closes beyond + follow-through as a decisive break', () => {
    const bars = norm([
      bar(99, 99.5, 98.5, 99), bar(99, 99.5, 98.5, 99), bar(99, 99.5, 98.5, 99),
      bar(101, 101.8, 100.9, 101.6), // close 0.6 beyond
      bar(101.6, 102.0, 101.4, 101.7), // close 0.7 beyond (confirm)
      bar(102, 103, 101.8, 102.8), // follow-through beyond 101 + 1.5 ATR
      bar(103, 104, 102.8, 103.8), bar(104, 105, 103.8, 104.8), // keeps going, no retest
    ])
    const z = resZone()
    processZoneLifecycle(z, bars, new Array(bars.length).fill(1), cfg)
    expect(z.status).toBe('BROKEN')
    expect(z.events.some((e) => e.type === 'BREAK')).toBe(true)
  })
})
