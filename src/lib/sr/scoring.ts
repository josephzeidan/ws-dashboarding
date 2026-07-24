// Composite zone scoring, HTF confluence merge, grades, and human-readable
// reasons/warnings (spec §12). The reasons array is not garnish — a score with
// no explanation is unusable.

import type { SRConfig, Grade, Timeframe, Zone } from './types'
import { clamp, clamp01 } from './indicators'
import { roundLevelsNear, roundNumberScore } from './roundNumbers'

function overlapRatio(a: Zone, b: Zone): number {
  const overlap = Math.max(0, Math.min(a.upper, b.upper) - Math.max(a.lower, b.lower))
  const narrower = Math.min(a.upper - a.lower, b.upper - b.lower)
  return narrower <= 0 ? 0 : overlap / narrower
}

/** Merge zones across anchor timeframes: a zone found on both anchors is stronger
 *  (spec §12.2). `orderedTFs` is low→high; the highest anchor is the base set. */
export function mergeAcrossTimeframes(zonesByTF: Map<Timeframe, Zone[]>, orderedTFs: Timeframe[], cfg: SRConfig): Zone[] {
  const highest = orderedTFs[orderedTFs.length - 1]
  const base: Zone[] = [...(zonesByTF.get(highest) ?? [])]
  const lowers = orderedTFs.slice(0, -1)

  for (const tf of lowers) {
    for (const z of zonesByTF.get(tf) ?? []) {
      // only merge same polarity family (treat FLIP as compatible with both)
      const match = base.find(
        (b) => (b.polarity === z.polarity || b.polarity === 'FLIP' || z.polarity === 'FLIP') && overlapRatio(b, z) > 0.4
      )
      if (match) {
        if (!match.confluenceTFs.includes(tf)) match.confluenceTFs.push(tf)
        // gently widen toward the union, respecting the maxW clamp
        const maxW = cfg.zoneMaxWidthATR * match.atrRef
        const newLower = Math.min(match.lower, z.lower)
        const newUpper = Math.max(match.upper, z.upper)
        if (newUpper - newLower <= maxW) {
          match.lower = newLower
          match.upper = newUpper
          match.midpoint = (newLower + newUpper) / 2
        }
        // merge touches, de-dup by time proximity
        for (const t of z.touches) {
          if (!match.touches.some((mt) => Math.abs(mt.t - t.t) < 1)) match.touches.push(t)
        }
        match.touchCount = match.touches.filter((t) => !t.provisional).length
      } else {
        base.push(z)
      }
    }
  }

  // htf score
  for (const z of base) {
    const isHighest = z.timeframe === highest
    const frac = clamp01(z.confluenceTFs.length / Math.max(1, orderedTFs.length - 1))
    z.components.htf = 100 * (isHighest ? frac * 0.3 + 0.7 : frac * 0.7)
  }
  return base
}

function freshnessScore(zone: Zone, lastBarIndex: number, cfg: SRConfig): number {
  const lastTouch = zone.touches.filter((t) => !t.provisional).slice(-1)[0] ?? zone.touches.slice(-1)[0]
  if (!lastTouch) return 0
  const barsSince = lastBarIndex - lastTouch.index
  return 100 * Math.exp(-barsSince / (cfg.lookbackBars * 0.4))
}

function breakPenalty(zone: Zone, cfg: SRConfig): number {
  let penalty = 0
  const unrecoveredBreaks = zone.events.filter((e) => e.type === 'BREAK').length
  penalty += unrecoveredBreaks * -35
  penalty += Math.max(0, zone.extensions - 2) * -8
  return Math.max(-60, penalty)
}

function gradeOf(strength: number, zone: Zone): Grade {
  let g: Grade
  if (strength >= 82 && zone.touchCount >= 2 && zone.components.extremity >= 70 && zone.status === 'ACTIVE') g = 'A+'
  else if (strength >= 72 && zone.touchCount >= 2) g = 'A'
  else if (strength >= 58) g = 'B'
  else if (strength >= 42) g = 'C'
  else g = 'D'
  // Key #3 hard gate: touchCount < 2 caps at B
  if (zone.touchCount < 2 && (g === 'A+' || g === 'A')) g = 'B'
  return g
}

function buildReasons(zone: Zone, cfg: SRConfig, lastBarIndex: number): { reasons: string[]; warnings: string[] } {
  const reasons: string[] = []
  const warnings: string[] = []

  if (zone.touchCount >= 2) {
    reasons.push(`${zone.touchCount} confirmed touches — the tradable ${zone.touchCount + 1}${ordinalSuffix(zone.touchCount + 1)} arrival is next`)
  }
  if (zone.components.extremity >= 70) {
    reasons.push(`In the extreme ${zone.polarity === 'RESISTANCE' ? 'top' : 'bottom'} of the ${cfg.extremityWindow}-bar range (overextended)`)
  }
  if (zone.confluenceTFs.length > 0) {
    reasons.push(`Confirmed on ${[zone.timeframe, ...zone.confluenceTFs].join(' + ')} — higher-timeframe zone`)
  }
  if (zone.components.velocity >= 60) {
    const resolved = zone.touches.filter((t) => !t.provisional)
    const avgDisp = resolved.length ? resolved.reduce((s, t) => s + t.reaction.displacementATR, 0) / resolved.length : 0
    const avgBars = resolved.length ? resolved.reduce((s, t) => s + t.reaction.barsToExtreme, 0) / resolved.length : 0
    reasons.push(`Fast prior rejections — avg ${avgDisp.toFixed(1)} ATR in ${Math.round(avgBars)} bars`)
  }
  if (zone.roundNumber != null) {
    reasons.push(`Contains the ${zone.roundNumber} round number`)
  }
  const fb = zone.events.filter((e) => e.type === 'FAILED_BREAKOUT')
  if (fb.length > 0) {
    reasons.push(`Produced a failed breakout on ${new Date(fb[0].t).toISOString().slice(0, 10)} — the pattern has precedent here`)
  }
  if (zone.flipped) {
    reasons.push('Broke and flipped polarity — has proven significant from both sides')
  }

  // warnings
  if (zone.extensions > 2) warnings.push(`Zone extended ${zone.extensions} times — boundaries are getting imprecise`)
  const lastTouch = zone.touches.filter((t) => !t.provisional).slice(-1)[0]
  if (lastTouch) {
    const barsSince = lastBarIndex - lastTouch.index
    if (barsSince > cfg.lookbackBars * 0.4) warnings.push(`Last touch was ${barsSince} bars ago — the level is stale`)
  }
  if (zone.touchCount < 2) warnings.push('Only one clean swing — unconfirmed, cannot grade above B')

  return { reasons, warnings }
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}

/** Final scoring pass on a merged zone. Fills components, bonuses, penalties,
 *  strength, grade, reasons, warnings, roundNumber, filtered. */
export function scoreZone(zone: Zone, cfg: SRConfig, lastBarIndex: number): void {
  // round number
  const rl = roundLevelsNear(zone.midpoint, zone.lower, zone.upper)
  zone.roundNumber = rl ? rl.level : null
  const round = roundNumberScore(rl)

  const touch = Math.min(100, 100 * (zone.touchCount / cfg.idealTouches))
  const velocity = zone.components.velocity
  const extremity = zone.components.extremity
  const htf = zone.components.htf
  const freshness = freshnessScore(zone, lastBarIndex, cfg)

  zone.components = { touch, velocity, extremity, htf, round, freshness }

  const w = cfg.weights
  const raw =
    w.touch * touch + w.velocity * velocity + w.extremity * extremity + w.htf * htf + w.round * round + w.freshness * freshness

  const flipBonus = zone.flipped ? 8 : 0
  const fbBonus = Math.min(12, zone.events.filter((e) => e.type === 'FAILED_BREAKOUT').length * 6)
  const bonuses = flipBonus + fbBonus
  const penalties = breakPenalty(zone, cfg)

  zone.bonuses = bonuses
  zone.penalties = penalties
  zone.strength = clamp(raw + bonuses + penalties, 0, 100)
  zone.grade = gradeOf(zone.strength, zone)
  zone.filtered = extremity < cfg.extremityFloor

  const { reasons, warnings } = buildReasons(zone, cfg, lastBarIndex)
  zone.reasons = reasons
  zone.warnings = warnings
}
