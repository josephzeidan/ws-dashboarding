// Zone construction (spec §8): band boundaries (Key #1), touch detection with
// chop de-duplication (Key #3), reaction/velocity metrics (Key #4), extremity
// (Key #2). The extreme edge is sacred — widening/trimming only move the interior.

import crypto from 'crypto'
import type { NormBar } from '@/lib/market-data/provider'
import type { Cluster, ReactionMetrics, SRConfig, Touch, Zone } from './types'
import { clamp01, efficiencyRatio, median } from './indicators'

interface ZoneGeom {
  lower: number
  upper: number
  anchor: number
  atrRef: number
  anchorIndex: number
  polarity: 'SUPPORT' | 'RESISTANCE'
  startIndex: number
}

export function buildZoneGeometry(cluster: Cluster, atrSeries: number[], cfg: SRConfig): ZoneGeom {
  const isRes = cluster.polarity === 'RESISTANCE'
  const atrRef = median(cluster.swings.map((s) => atrSeries[s.index] || 0)) || 1e-9

  let rawUpper: number, rawLower: number, anchor: number, anchorIndex: number
  if (isRes) {
    const extremeSwing = cluster.swings.reduce((a, b) => (b.price > a.price ? b : a))
    rawUpper = extremeSwing.price // extreme wick high
    rawLower = Math.min(...cluster.swings.map((s) => s.bodyEdge)) // shallowest body top = the "meat"
    anchor = rawUpper
    anchorIndex = extremeSwing.index
  } else {
    const extremeSwing = cluster.swings.reduce((a, b) => (b.price < a.price ? b : a))
    rawLower = extremeSwing.price
    rawUpper = Math.max(...cluster.swings.map((s) => s.bodyEdge))
    anchor = rawLower
    anchorIndex = extremeSwing.index
  }

  const width = rawUpper - rawLower
  const minW = cfg.zoneMinWidthATR * atrRef
  const maxW = cfg.zoneMaxWidthATR * atrRef

  if (width < minW) {
    if (isRes) rawLower = rawUpper - minW
    else rawUpper = rawLower + minW
  } else if (width > maxW) {
    if (isRes) rawLower = rawUpper - maxW
    else rawUpper = rawLower + maxW
  }

  const startIndex = Math.min(...cluster.swings.map((s) => s.index))
  return { lower: rawLower, upper: rawUpper, anchor, atrRef, anchorIndex, polarity: cluster.polarity, startIndex }
}

/** Grow a zone to encompass a new extreme without moving past the maxW clamp. */
export function extendZone(geom: ZoneGeom, newExtreme: number, cfg: SRConfig): number {
  const maxW = cfg.zoneMaxWidthATR * geom.atrRef
  if (geom.polarity === 'RESISTANCE' && newExtreme > geom.upper) {
    geom.upper = newExtreme
    geom.anchor = newExtreme
    if (geom.upper - geom.lower > maxW) geom.lower = geom.upper - maxW
    return 1
  }
  if (geom.polarity === 'SUPPORT' && newExtreme < geom.lower) {
    geom.lower = newExtreme
    geom.anchor = newExtreme
    if (geom.upper - geom.lower > maxW) geom.upper = geom.lower + maxW
    return 1
  }
  return 0
}

function measureReaction(geom: ZoneGeom, entryIndex: number, bars: NormBar[], atr: number[], cfg: SRConfig): ReactionMetrics {
  const isRes = geom.polarity === 'RESISTANCE'
  const end = Math.min(bars.length - 1, entryIndex + cfg.reactionWindowBars)
  const atrRef = atr[entryIndex] || 1e-9

  let extreme = isRes ? Infinity : -Infinity
  let extremeOffset = 0
  let crossedGap = false
  for (let j = entryIndex; j <= end; j++) {
    if (j > entryIndex && bars[j].isSessionOpen) crossedGap = true
    if (isRes) {
      if (bars[j].l < extreme) { extreme = bars[j].l; extremeOffset = j - entryIndex }
    } else {
      if (bars[j].h > extreme) { extreme = bars[j].h; extremeOffset = j - entryIndex }
    }
  }

  let disp = isRes ? (geom.lower - extreme) / atrRef : (extreme - geom.upper) / atrRef
  disp = Math.max(0, disp)
  if (crossedGap) disp = Math.min(disp, 1.5) // gap guard: an overnight gap is not velocity

  const barsToExtreme = Math.max(1, extremeOffset)
  const velocity = disp / barsToExtreme
  const closes = bars.map((b) => b.c)
  const efficiency = efficiencyRatio(closes, entryIndex, entryIndex + barsToExtreme)
  let bodySum = 0
  for (let j = entryIndex; j <= entryIndex + barsToExtreme && j < bars.length; j++) {
    const range = Math.max(bars[j].h - bars[j].l, 1e-9)
    bodySum += Math.abs(bars[j].c - bars[j].o) / range
  }
  const bodyRatio = bodySum / (barsToExtreme + 1)

  const nDisp = clamp01(disp / cfg.strongReactionATR)
  const nVel = clamp01(velocity / cfg.strongVelocityATR)
  const nEff = clamp01(efficiency / 0.7)
  const nBody = clamp01(bodyRatio / 0.6)
  const score = 100 * (0.35 * nDisp + 0.3 * nVel + 0.25 * nEff + 0.1 * nBody)

  return {
    displacementATR: disp, barsToExtreme, velocityATRPerBar: velocity,
    efficiency, bodyRatio, score,
  }
}

export interface TouchResult {
  touches: Touch[]
  activeTouch: Touch | null
}

export function detectTouches(geom: ZoneGeom, bars: NormBar[], atr: number[], cfg: SRConfig, swingLookback: number): TouchResult {
  const isRes = geom.polarity === 'RESISTANCE'
  const touches: Touch[] = []
  let state: 'OUTSIDE' | 'INSIDE' = 'OUTSIDE'
  let lastTouchIndex = -Infinity
  let entryIndex = -1
  let extremeInTouch = 0
  let activeTouch: Touch | null = null

  for (let i = geom.startIndex; i < bars.length; i++) {
    const inZone = bars[i].h >= geom.lower && bars[i].l <= geom.upper

    if (state === 'OUTSIDE') {
      if (inZone) {
        if (i - lastTouchIndex < cfg.touchSeparationBars) continue // gate 1: min separation
        state = 'INSIDE'
        entryIndex = i
        extremeInTouch = isRes ? bars[i].h : bars[i].l
      }
    } else {
      if (inZone) {
        extremeInTouch = isRes ? Math.max(extremeInTouch, bars[i].h) : Math.min(extremeInTouch, bars[i].l)
      } else {
        // gate 2: price must leave by a real distance to close the touch
        const atrI = atr[i] || 1e-9
        const dist = isRes ? (geom.lower - bars[i].l) / atrI : (bars[i].h - geom.upper) / atrI
        if (dist >= cfg.touchExitATR) {
          const atrEntry = atr[entryIndex] || 1e-9
          touches.push({
            index: entryIndex,
            t: bars[entryIndex].t,
            penetrationATR: isRes
              ? Math.max(0, extremeInTouch - geom.upper) / atrEntry
              : Math.max(0, geom.lower - extremeInTouch) / atrEntry,
            reaction: measureReaction(geom, entryIndex, bars, atr, cfg),
            provisional: bars.length - 1 - i < swingLookback,
          })
          lastTouchIndex = i
          state = 'OUTSIDE'
        }
      }
    }
  }

  // Unresolved touch (still inside at series end) → activeTouch, not counted.
  if (state === 'INSIDE' && entryIndex >= 0) {
    activeTouch = {
      index: entryIndex,
      t: bars[entryIndex].t,
      penetrationATR: isRes
        ? Math.max(0, extremeInTouch - geom.upper) / (atr[entryIndex] || 1e-9)
        : Math.max(0, geom.lower - extremeInTouch) / (atr[entryIndex] || 1e-9),
      reaction: measureReaction(geom, entryIndex, bars, atr, cfg),
      provisional: true,
    }
  }

  return { touches, activeTouch }
}

/** Recency-weighted mean of touch reaction scores (spec §8.3). */
export function velocityScoreOf(touches: Touch[], lastBarIndex: number, cfg: SRConfig): number {
  const resolved = touches.filter((t) => !t.provisional)
  if (resolved.length === 0) return 0
  let num = 0, den = 0
  for (const t of resolved) {
    const w = Math.exp((-cfg.velocityDecay * (lastBarIndex - t.index)) / cfg.lookbackBars)
    num += w * t.reaction.score
    den += w
  }
  return den === 0 ? 0 : num / den
}

/** Extremity score (spec §8.4) — computed against the primary-anchor range. */
export function computeExtremity(zoneMid: number, rangeHi: number, rangeLo: number, polarity: 'SUPPORT' | 'RESISTANCE'): number {
  const pos = (zoneMid - rangeLo) / Math.max(rangeHi - rangeLo, 1e-9) // 0..1
  if (polarity === 'RESISTANCE') return clamp01((pos - 0.5) / 0.5) * 100
  return clamp01((0.5 - pos) / 0.5) * 100
}

export function zoneId(symbol: string, tf: string, anchor: number, polarity: string): string {
  const key = `${symbol}|${tf}|${anchor.toFixed(4)}|${polarity}`
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)
}

/** Assemble geometry + touches + reaction into a Zone draft. Scoring/events/grade
 *  are filled by later stages. */
export function assembleZone(
  geom: ZoneGeom,
  bars: NormBar[],
  atr: number[],
  cfg: SRConfig,
  swingLookback: number,
  symbol: string,
  tf: Zone['timeframe'],
  range: { hi: number; lo: number },
  lastPrice: number
): Zone {
  const { touches, activeTouch } = detectTouches(geom, bars, atr, cfg, swingLookback)
  const resolved = touches.filter((t) => !t.provisional)
  const touchCount = resolved.length
  const lastBarIndex = bars.length - 1
  const mid = (geom.lower + geom.upper) / 2
  const velScore = velocityScoreOf(touches, lastBarIndex, cfg)
  const extremity = computeExtremity(mid, range.hi, range.lo, geom.polarity)
  const atrRef = geom.atrRef

  const firstTouch = resolved[0] ?? touches[0]
  const lastTouch = resolved[resolved.length - 1] ?? touches[touches.length - 1]

  return {
    id: zoneId(symbol, tf, geom.anchor, geom.polarity),
    symbol,
    timeframe: tf,
    polarity: geom.polarity,
    status: touchCount >= 2 ? 'ACTIVE' : 'UNCONFIRMED',
    lower: geom.lower,
    upper: geom.upper,
    anchor: geom.anchor,
    midpoint: mid,
    widthATR: (geom.upper - geom.lower) / (atrRef || 1e-9),
    atrRef,
    touchCount,
    touches,
    activeTouch,
    firstTouchAt: firstTouch ? new Date(firstTouch.t).toISOString() : '',
    lastTouchAt: lastTouch ? new Date(lastTouch.t).toISOString() : '',
    strength: 0,
    grade: 'D',
    components: { touch: 0, velocity: velScore, extremity, htf: 0, round: 0, freshness: 0 },
    bonuses: 0,
    penalties: 0,
    confluenceTFs: [],
    roundNumber: null,
    events: [],
    flipped: false,
    extensions: 0,
    filtered: false,
    distanceFromPrice: mid - lastPrice,
    distanceATR: (mid - lastPrice) / (atrRef || 1e-9),
    reasons: [],
    warnings: [],
    anchorIndex: geom.anchorIndex,
  }
}
