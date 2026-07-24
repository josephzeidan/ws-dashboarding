// Shared types for the Support & Resistance engine (spec §6, §8, §13, §14).

import type { Timeframe } from '@/lib/market-data/provider'

export type { Timeframe }

export type Polarity = 'SUPPORT' | 'RESISTANCE' | 'FLIP'
export type ZoneStatus = 'ACTIVE' | 'BROKEN' | 'UNCONFIRMED'
export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D'
export type RegimeType = 'UPTREND' | 'DOWNTREND' | 'RANGE' | 'TRANSITIONAL'
export type ApproachKind = 'EXHAUSTIVE' | 'HEALTHY' | 'CHOPPY'
export type StructureState = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

export interface Swing {
  index: number
  t: number
  price: number // extreme high (HIGH) or low (LOW)
  bodyEdge: number // max(o,c) for HIGH, min(o,c) for LOW — the "meat"
  kind: 'HIGH' | 'LOW'
  prominenceATR: number
  atrAtPivot: number
  provisional: boolean // within trailing-edge window
}

export interface ReactionMetrics {
  displacementATR: number
  barsToExtreme: number
  velocityATRPerBar: number
  efficiency: number
  bodyRatio: number
  score: number // 0..100
}

export interface Touch {
  index: number
  t: number
  penetrationATR: number
  reaction: ReactionMetrics
  provisional: boolean
}

export type ZoneEventType = 'BREAK' | 'BREAK_AND_RETEST' | 'FAILED_BREAKOUT'

export interface ZoneEvent {
  type: ZoneEventType
  index: number
  t: number
  resolvedIndex?: number
  penetrationATR?: number
  trapStrength?: number
  detail?: string
}

export interface Cluster {
  polarity: 'SUPPORT' | 'RESISTANCE'
  swings: Swing[]
}

export interface Zone {
  id: string
  symbol: string
  timeframe: Timeframe
  polarity: Polarity
  status: ZoneStatus
  lower: number
  upper: number
  anchor: number // the extreme edge
  midpoint: number
  widthATR: number
  atrRef: number

  touchCount: number
  touches: Touch[]
  activeTouch: Touch | null
  firstTouchAt: string
  lastTouchAt: string

  strength: number // 0..100
  grade: Grade
  components: {
    touch: number
    velocity: number
    extremity: number
    htf: number
    round: number
    freshness: number
  }
  bonuses: number
  penalties: number

  confluenceTFs: Timeframe[]
  roundNumber: number | null
  events: ZoneEvent[]
  flipped: boolean
  extensions: number
  filtered: boolean // below extremity floor

  distanceFromPrice: number
  distanceATR: number

  reasons: string[]
  warnings: string[]

  // internal — index of the zone's anchor bar, used across stages
  anchorIndex: number
  slope?: number // set for trendline (sloped) zones
}

export interface ChecklistItem {
  key: string
  label: string
  passed: boolean
  detail: string
  required: boolean
}

export interface SetupSignal {
  zoneId: string
  direction: 'LONG' | 'SHORT'
  pattern: 'REVERSAL' | 'FAILED_BREAKOUT' | 'BREAK_AND_RETEST'
  confidence: number // 0..100
  checklist: ChecklistItem[]
  invalidationPrice: number
  approach: ApproachKind
  notes: string[]
}

export interface RegimeResult {
  type: RegimeType
  strength: number
  timeframe: Timeframe
  description: string
  normSlope: number
  r2: number
}

export interface SRAnalysis {
  symbol: string
  generatedAt: string
  profile: TimeframeProfile
  lastPrice: number
  atr: Partial<Record<Timeframe, number>>
  regime: {
    type: RegimeType
    strength: number
    timeframe: Timeframe
    description: string
  }
  zones: Zone[]
  retiredZones: Zone[]
  setups: SetupSignal[]
  watching: SetupSignal | null // price is at a zone but required gates unmet (checklist to show)
  structure: {
    state: StructureState
    sequence: ('HH' | 'HL' | 'LH' | 'LL')[]
  }
  meta: {
    barsAnalyzed: Partial<Record<Timeframe, number>>
    dataProvider: string
    oldestBar: string
    newestBar: string
    warnings: string[]
    cached: boolean
    computeMs: number
  }
}

export interface TimeframeProfile {
  id: string
  label: string
  executionTF: Timeframe
  anchorTFs: Timeframe[]
  primaryAnchor: Timeframe
  lookbackBars: Partial<Record<Timeframe, number>>
}

export interface SwingParams {
  swingLookback: number
  prominenceWindow: number
  minProminenceATR: number
}

export interface SRConfig {
  minBars: number
  lookbackBars: number
  session: 'regular' | 'extended' | 'all'

  swingLookback: number
  prominenceWindow: number
  minProminenceATR: number

  clusterTolATR: number
  clusterTolPct: number
  crossPolarityMergeRatio: number

  zoneMinWidthATR: number
  zoneMaxWidthATR: number
  maxExtensions: number

  touchSeparationBars: number
  touchExitATR: number
  idealTouches: number

  reactionWindowBars: number
  strongReactionATR: number
  strongVelocityATR: number
  velocityDecay: number

  extremityWindow: number
  extremityFloor: number
  maxVisibleZones: number

  breakCloseATR: number
  breakConfirmBars: number
  breakFollowWindow: number
  breakContinueATR: number
  retestWindow: number
  flipConfirmATR: number

  maxFailedBreakoutPenetrationATR: number
  failedBreakoutWindow: number

  approachWindow: number

  regimeWindow: number
  trendSlopeATR: number
  trendR2: number
  rangeATRCap: number

  invalidationBufferATR: number

  weights: {
    touch: number
    velocity: number
    extremity: number
    htf: number
    round: number
    freshness: number
  }
}
