// Event detection & zone lifecycle (spec §9): decisive break (retires a zone),
// break & retest (flips polarity instead of dying), failed breakout (a trap —
// one of the highest-value signals), and approach-leg classification.

import type { NormBar } from '@/lib/market-data/provider'
import type { ApproachKind, SRConfig, Zone } from './types'
import { efficiencyRatio } from './indicators'

/** A single wick beyond the far edge is never a break — needs close-through,
 *  confirmation closes, and follow-through (spec §9.1). */
function decisiveBreakAt(zone: Zone, bars: NormBar[], atr: number[], i: number, cfg: SRConfig): boolean {
  const isRes = zone.polarity === 'RESISTANCE' || (zone.polarity === 'FLIP' && zone.upper < bars[i].c)
  const farEdge = isRes ? zone.upper : zone.lower
  const atrI = atr[i] || 1e-9
  const beyond = isRes ? bars[i].c - farEdge : farEdge - bars[i].c
  if (beyond < cfg.breakCloseATR * atrI) return false

  // cond2: breakConfirmBars consecutive closes beyond
  for (let k = 0; k < cfg.breakConfirmBars; k++) {
    const j = i + k
    if (j >= bars.length) return false
    const b = isRes ? bars[j].c - farEdge : farEdge - bars[j].c
    if (b < cfg.breakCloseATR * (atr[j] || 1e-9)) return false
  }
  // cond3: within breakFollowWindow, price extends breakContinueATR further
  const end = Math.min(bars.length - 1, i + cfg.breakFollowWindow)
  let extended = false
  for (let j = i; j <= end; j++) {
    const ext = isRes ? bars[j].h - farEdge : farEdge - bars[j].l
    if (ext >= cfg.breakContinueATR * atrI) { extended = true; break }
  }
  return extended
}

function findDecisiveBreak(zone: Zone, bars: NormBar[], atr: number[], cfg: SRConfig): number {
  // Only look after the zone's first touch formed it.
  const start = Math.max(zone.anchorIndex, 1)
  for (let i = start; i < bars.length - cfg.breakConfirmBars; i++) {
    if (decisiveBreakAt(zone, bars, atr, i, cfg)) return i
  }
  return -1
}

/** Break & retest → polarity flip (spec §9.2). Mutates the zone. */
function tryFlip(zone: Zone, breakIndex: number, bars: NormBar[], atr: number[], cfg: SRConfig): boolean {
  const brokeUp = bars[breakIndex].c > zone.upper // resistance broken upward
  const end = Math.min(bars.length - 1, breakIndex + cfg.retestWindow)
  const atrRef = zone.atrRef || 1e-9

  for (let i = breakIndex + 1; i <= end; i++) {
    const reEntered = bars[i].h >= zone.lower && bars[i].l <= zone.upper
    if (!reEntered) continue
    // measure reaction AWAY in the NEW direction over a short window
    const wEnd = Math.min(bars.length - 1, i + cfg.reactionWindowBars)
    let disp = 0
    for (let j = i; j <= wEnd; j++) {
      const away = brokeUp ? (bars[j].h - zone.upper) / atrRef : (zone.lower - bars[j].l) / atrRef
      if (away > disp) disp = away
    }
    if (disp >= cfg.flipConfirmATR) {
      zone.polarity = 'FLIP'
      zone.flipped = true
      zone.status = 'ACTIVE'
      zone.events.push({ type: 'BREAK_AND_RETEST', index: breakIndex, t: bars[breakIndex].t, resolvedIndex: i, detail: `Broke ${brokeUp ? 'up' : 'down'} then held as ${brokeUp ? 'support' : 'resistance'}` })
      return true
    }
  }
  return false
}

/** Failed breakout detection (spec §9.3). Adds events; does not retire the zone. */
function detectFailedBreakouts(zone: Zone, bars: NormBar[], cfg: SRConfig): void {
  const isRes = zone.polarity === 'RESISTANCE'
  for (const touch of zone.touches) {
    if (touch.penetrationATR <= 0) continue
    if (touch.penetrationATR > cfg.maxFailedBreakoutPenetrationATR) continue
    const i = touch.index
    const end = Math.min(bars.length - 1, i + cfg.failedBreakoutWindow)
    for (let j = i + 1; j <= end; j++) {
      const backInside = isRes ? bars[j].c < zone.lower : bars[j].c > zone.upper
      if (backInside) {
        zone.events.push({
          type: 'FAILED_BREAKOUT',
          index: i,
          t: bars[i].t,
          resolvedIndex: j,
          penetrationATR: touch.penetrationATR,
          trapStrength: touch.penetrationATR * touch.reaction.displacementATR,
          detail: `Poked ${touch.penetrationATR.toFixed(2)} ATR beyond then reversed`,
        })
        break
      }
    }
  }
}

/** Approach-leg character (spec §9.4). */
export function classifyApproach(bars: NormBar[], atr: number[], endIndex: number, cfg: SRConfig): ApproachKind {
  const W = cfg.approachWindow
  const start = Math.max(0, endIndex - W)
  if (endIndex - start < 3) return 'CHOPPY'
  const atrRef = atr[endIndex] || 1e-9
  const disp = Math.abs(bars[endIndex].c - bars[start].c) / atrRef
  const closes = bars.map((b) => b.c)
  const eff = efficiencyRatio(closes, start, endIndex)
  if (disp >= 3.0 && eff >= 0.65) return 'EXHAUSTIVE'
  if (disp >= 1.5 && eff >= 0.45) return 'HEALTHY'
  return 'CHOPPY'
}

/** Run the full lifecycle on a zone: detect break → flip or retire; detect
 *  failed breakouts. Returns whether the zone should be retired (BROKEN). */
export function processZoneLifecycle(zone: Zone, bars: NormBar[], atr: number[], cfg: SRConfig): void {
  detectFailedBreakouts(zone, bars, cfg)

  const breakIndex = findDecisiveBreak(zone, bars, atr, cfg)
  if (breakIndex === -1) return // no decisive break; zone lives

  const flipped = tryFlip(zone, breakIndex, bars, atr, cfg)
  if (!flipped) {
    zone.status = 'BROKEN'
    zone.events.push({ type: 'BREAK', index: breakIndex, t: bars[breakIndex].t, detail: 'Decisive break with no valid retest — level retired' })
  }
}
