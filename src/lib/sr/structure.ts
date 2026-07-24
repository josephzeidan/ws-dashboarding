// Market-structure state machine (spec §11), runs on the execution timeframe.
// A zone touch alone is not a signal — structure must confirm with a CLOSE
// through the relevant swing (break of structure), not a wick.

import type { NormBar } from '@/lib/market-data/provider'
import type { SRConfig, StructureState, Swing, Timeframe } from './types'
import { detectSwings } from './swings'
import { swingParamsFor } from './config'

export interface StructureBreak {
  t: number
  index: number
  to: 'BULLISH' | 'BEARISH'
}

export interface StructureSnapshot {
  state: StructureState
  lastSwingHigh: Swing | null
  lastSwingLow: Swing | null
  brokenAt: number | null
  sequence: ('HH' | 'HL' | 'LH' | 'LL')[]
  breaks: StructureBreak[]
}

export function trackStructure(execBars: NormBar[], execAtr: number[], execTF: Timeframe, cfg: SRConfig): StructureSnapshot {
  const swings = detectSwings(execBars, execAtr, swingParamsFor(execTF)).filter((s) => !s.provisional)
  const sequence: ('HH' | 'HL' | 'LH' | 'LL')[] = []

  let prevHigh: number | null = null
  let prevLow: number | null = null
  for (const s of swings) {
    if (s.kind === 'HIGH') {
      sequence.push(prevHigh != null && s.price > prevHigh ? 'HH' : 'LH')
      prevHigh = s.price
    } else {
      sequence.push(prevLow != null && s.price > prevLow ? 'HL' : 'LL')
      prevLow = s.price
    }
  }

  // Break-of-structure via close: bull→bear on a close below the most recent
  // confirmed swing low; bear→bull on a close above the most recent swing high.
  const breaks: StructureBreak[] = []
  let state: StructureState = 'NEUTRAL'
  let refHigh: Swing | null = null
  let refLow: Swing | null = null
  let lastSwingHigh: Swing | null = null
  let lastSwingLow: Swing | null = null

  let si = 0
  for (let i = 0; i < execBars.length; i++) {
    // absorb any swings confirmed at/before this bar
    while (si < swings.length && swings[si].index <= i) {
      const s = swings[si]
      if (s.kind === 'HIGH') { refHigh = s; lastSwingHigh = s }
      else { refLow = s; lastSwingLow = s }
      si++
    }
    const c = execBars[i].c
    if (refLow && c < refLow.price && state !== 'BEARISH') {
      state = 'BEARISH'
      breaks.push({ t: execBars[i].t, index: i, to: 'BEARISH' })
    } else if (refHigh && c > refHigh.price && state !== 'BULLISH') {
      state = 'BULLISH'
      breaks.push({ t: execBars[i].t, index: i, to: 'BULLISH' })
    }
  }

  return {
    state,
    lastSwingHigh,
    lastSwingLow,
    brokenAt: breaks.length ? breaks[breaks.length - 1].index : null,
    sequence: sequence.slice(-6),
    breaks,
  }
}
