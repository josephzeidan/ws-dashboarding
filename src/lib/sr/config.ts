// Default config, timeframe profiles, and per-timeframe swing presets (spec §4, §6, §16).

import crypto from 'crypto'
import type { SRConfig, SwingParams, Timeframe, TimeframeProfile } from './types'

export const DEFAULT_SR_CONFIG: SRConfig = {
  // data
  minBars: 250,
  lookbackBars: 500,
  session: 'regular',

  // swings (defaults; per-TF presets below override)
  swingLookback: 3,
  prominenceWindow: 20,
  minProminenceATR: 0.8,

  // clustering
  clusterTolATR: 0.35,
  clusterTolPct: 0.0015,
  crossPolarityMergeRatio: 0.5,

  // zone geometry
  zoneMinWidthATR: 0.3,
  zoneMaxWidthATR: 1.2,
  maxExtensions: 3,

  // touches
  touchSeparationBars: 6,
  touchExitATR: 1.0,
  idealTouches: 3,

  // velocity
  reactionWindowBars: 12,
  strongReactionATR: 2.0,
  strongVelocityATR: 0.5,
  velocityDecay: 1.5,

  // extremity
  extremityWindow: 250,
  extremityFloor: 45,
  maxVisibleZones: 6,

  // breaks
  breakCloseATR: 0.5,
  breakConfirmBars: 2,
  breakFollowWindow: 10,
  breakContinueATR: 1.5,
  retestWindow: 40,
  flipConfirmATR: 1.0,

  // failed breakout
  maxFailedBreakoutPenetrationATR: 1.25,
  failedBreakoutWindow: 8,

  // approach
  approachWindow: 10,

  // regime
  regimeWindow: 120,
  trendSlopeATR: 2.5,
  trendR2: 0.55,
  rangeATRCap: 8,

  // setup
  invalidationBufferATR: 0.5,

  // scoring weights (must sum to 1.0)
  weights: {
    touch: 0.24,
    velocity: 0.2,
    extremity: 0.2,
    htf: 0.16,
    round: 0.08,
    freshness: 0.12,
  },
}

// Per-timeframe swing presets (spec §6 table).
export const SWING_PRESETS: Record<Timeframe, SwingParams> = {
  '1m': { swingLookback: 5, prominenceWindow: 30, minProminenceATR: 0.6 },
  '5m': { swingLookback: 4, prominenceWindow: 24, minProminenceATR: 0.7 },
  '15m': { swingLookback: 3, prominenceWindow: 20, minProminenceATR: 0.75 },
  '30m': { swingLookback: 3, prominenceWindow: 20, minProminenceATR: 0.78 },
  '1h': { swingLookback: 3, prominenceWindow: 20, minProminenceATR: 0.8 },
  '4h': { swingLookback: 3, prominenceWindow: 16, minProminenceATR: 0.85 },
  '1D': { swingLookback: 3, prominenceWindow: 15, minProminenceATR: 0.9 },
  '1W': { swingLookback: 3, prominenceWindow: 12, minProminenceATR: 0.95 },
}

export function swingParamsFor(tf: Timeframe): SwingParams {
  return SWING_PRESETS[tf] ?? {
    swingLookback: DEFAULT_SR_CONFIG.swingLookback,
    prominenceWindow: DEFAULT_SR_CONFIG.prominenceWindow,
    minProminenceATR: DEFAULT_SR_CONFIG.minProminenceATR,
  }
}

export const PROFILES: Record<string, TimeframeProfile> = {
  scalp: {
    id: 'scalp', label: 'Intraday scalp (1m exec)',
    executionTF: '1m', anchorTFs: ['5m', '15m'], primaryAnchor: '15m',
    lookbackBars: { '1m': 400, '5m': 500, '15m': 500 },
  },
  intraday: {
    id: 'intraday', label: 'Intraday swing (5m exec)',
    executionTF: '5m', anchorTFs: ['15m', '1h'], primaryAnchor: '1h',
    lookbackBars: { '5m': 500, '15m': 500, '1h': 400 },
  },
  swing: {
    id: 'swing', label: 'Multi-day swing (1h exec)',
    executionTF: '1h', anchorTFs: ['4h', '1D'], primaryAnchor: '1D',
    lookbackBars: { '1h': 500, '4h': 400, '1D': 400 },
  },
  position: {
    id: 'position', label: 'Position (1D exec)',
    executionTF: '1D', anchorTFs: ['1D', '1W'], primaryAnchor: '1W',
    lookbackBars: { '1D': 750, '1W': 300 },
  },
}

export const DEFAULT_PROFILE = 'swing'

/** Stable hash of config + profile — busts the analysis cache on any tuning change. */
export function configHash(config: SRConfig, profileId: string, session: string): string {
  const payload = JSON.stringify({ config, profileId, session })
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16)
}
