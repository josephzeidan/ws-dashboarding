// Regime classification (spec §10), computed on the primary anchor timeframe.
// Zone quality and setup timing are kept separate: the multiplier gates setup
// confidence, never the zone's structural strength score.

import type { NormBar } from '@/lib/market-data/provider'
import type { RegimeResult, SRConfig, Timeframe } from './types'
import { clamp01, linreg } from './indicators'

export function classifyRegime(bars: NormBar[], atr: number[], tf: Timeframe, cfg: SRConfig): RegimeResult {
  const W = Math.min(cfg.regimeWindow, bars.length)
  const closes = bars.map((b) => b.c)
  const atrLast = atr[atr.length - 1] || 1e-9
  const { normSlope, r2 } = linreg(closes, W, atrLast)

  const seg = bars.slice(bars.length - W)
  const hi = Math.max(...seg.map((b) => b.h))
  const lo = Math.min(...seg.map((b) => b.l))
  const rangeATR = (hi - lo) / atrLast

  let type: RegimeResult['type']
  let strength: number
  if (Math.abs(normSlope) >= cfg.trendSlopeATR && r2 >= cfg.trendR2) {
    type = normSlope > 0 ? 'UPTREND' : 'DOWNTREND'
    strength = clamp01((Math.abs(normSlope) - cfg.trendSlopeATR) / 5) * 100
  } else if (rangeATR <= cfg.rangeATRCap && Math.abs(normSlope) < 1.5) {
    type = 'RANGE'
    strength = clamp01((cfg.rangeATRCap - rangeATR) / 5) * 100
  } else {
    type = 'TRANSITIONAL'
    strength = 40
  }

  const desc =
    type === 'UPTREND' ? `Uptrend (${normSlope.toFixed(1)} ATR drift, r²=${r2.toFixed(2)}) — pullbacks into support favoured over shorts at resistance`
    : type === 'DOWNTREND' ? `Downtrend (${normSlope.toFixed(1)} ATR drift, r²=${r2.toFixed(2)}) — bounces into resistance favoured over longs at support`
    : type === 'RANGE' ? `Range-bound (${rangeATR.toFixed(1)} ATR span) — reversals at the extremes are favoured`
    : `Transitional — no clean trend or range; treat setups cautiously`

  return { type, strength: Math.round(strength), timeframe: tf, description: desc, normSlope, r2 }
}

/** Setup-confidence multiplier (spec §10 gating table). Applied to setup
 *  confidence only. */
export function setupConfidenceMultiplier(regime: RegimeResult['type'], direction: 'LONG' | 'SHORT'): number {
  switch (regime) {
    case 'RANGE':
      return 1.0 // reversals at extremes favoured
    case 'UPTREND':
      return direction === 'LONG' ? 1.0 : 0.55 // shorting resistance fights the trend
    case 'DOWNTREND':
      return direction === 'SHORT' ? 1.0 : 0.55
    default:
      return 0.8 // TRANSITIONAL
  }
}
