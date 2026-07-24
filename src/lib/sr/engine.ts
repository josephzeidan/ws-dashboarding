// Orchestrator (spec §2 data-flow, §13 live setup). runAnalysis fetches bars for
// every anchor + execution timeframe, runs the full pipeline, merges across
// timeframes, scores, classifies regime + structure, and detects the live setup.

import type { NormBar, Timeframe } from '@/lib/market-data/provider'
import { getBarsCached, providerName, ANALYSIS_TTL_MS } from '@/lib/market-data/cache'
import { normalizeBars } from '@/lib/market-data/normalize'
import { prisma } from '@/lib/prisma'
import { atr as computeAtr } from './indicators'
import { swingParamsFor, DEFAULT_SR_CONFIG, PROFILES, configHash } from './config'
import { detectSwings } from './swings'
import { clusterSwings } from './clustering'
import { assembleZone, buildZoneGeometry, zoneId } from './zones'
import { processZoneLifecycle, classifyApproach } from './events'
import { mergeAcrossTimeframes, scoreZone } from './scoring'
import { classifyRegime, setupConfidenceMultiplier } from './regime'
import { trackStructure } from './structure'
import { buildVolumeProfile, applyVolumeWeighting } from './volumeProfile'
import type { ChecklistItem, SRAnalysis, SRConfig, SetupSignal, Zone } from './types'
import { clamp } from './indicators'

export interface RunOptions {
  profileId: string
  session: 'regular' | 'extended' | 'all'
  refresh: boolean
  config?: SRConfig
}

/** Merge overlapping opposite-polarity zones within one TF into a FLIP zone
 *  (spec §7 cross-polarity merge). */
function crossPolarityMerge(zones: Zone[], cfg: SRConfig): Zone[] {
  const res = zones.filter((z) => z.polarity === 'RESISTANCE')
  const sup = zones.filter((z) => z.polarity === 'SUPPORT')
  const consumed = new Set<string>()
  const flips: Zone[] = []

  for (const r of res) {
    for (const s of sup) {
      if (consumed.has(s.id)) continue
      const overlap = Math.max(0, Math.min(r.upper, s.upper) - Math.max(r.lower, s.lower))
      const narrower = Math.min(r.upper - r.lower, s.upper - s.lower)
      if (narrower > 0 && overlap / narrower > cfg.crossPolarityMergeRatio) {
        const lower = Math.min(r.lower, s.lower)
        const upper = Math.max(r.upper, s.upper)
        const merged: Zone = {
          ...r,
          id: zoneId(r.symbol, r.timeframe, r.anchor, 'FLIP'),
          polarity: 'FLIP',
          lower, upper, midpoint: (lower + upper) / 2,
          touches: [...r.touches, ...s.touches].sort((a, b) => a.index - b.index),
        }
        merged.touchCount = merged.touches.filter((t) => !t.provisional).length
        consumed.add(r.id)
        consumed.add(s.id)
        flips.push(merged)
        break
      }
    }
  }
  return [...zones.filter((z) => !consumed.has(z.id)), ...flips]
}

export async function runAnalysis(symbol: string, opts: RunOptions): Promise<SRAnalysis> {
  const t0 = Date.now()
  const sym = symbol.trim().toUpperCase()
  const cfg = opts.config ?? DEFAULT_SR_CONFIG
  const profile = PROFILES[opts.profileId] ?? PROFILES.swing
  const hash = configHash(cfg, profile.id, opts.session)

  // cache check
  if (!opts.refresh) {
    const cached = await prisma.srAnalysisCache.findUnique({ where: { symbol_configHash: { symbol: sym, configHash: hash } } })
    if (cached) {
      const ttl = ANALYSIS_TTL_MS[profile.primaryAnchor]
      if (Date.now() - cached.createdAt.getTime() < ttl) {
        const payload = JSON.parse(cached.payload) as SRAnalysis
        payload.meta.cached = true
        return payload
      }
    }
  }

  const warnings: string[] = []
  const allTFs = Array.from(new Set<Timeframe>([...profile.anchorTFs, profile.executionTF]))

  // fetch + normalize every TF
  const barsByTF = new Map<Timeframe, NormBar[]>()
  const atrByTF = new Map<Timeframe, number[]>()
  const barsAnalyzed: Partial<Record<Timeframe, number>> = {}

  for (const tf of allTFs) {
    const limit = profile.lookbackBars[tf] ?? cfg.lookbackBars
    try {
      const raw = await getBarsCached({ symbol: sym, timeframe: tf, limit, adjusted: true, session: opts.session })
      const minBars = tf === profile.primaryAnchor ? cfg.minBars : Math.min(cfg.minBars, 60)
      const norm = normalizeBars(raw, tf, minBars)
      barsByTF.set(tf, norm)
      atrByTF.set(tf, computeAtr(norm, 14))
      barsAnalyzed[tf] = norm.length
    } catch (err) {
      if (tf === profile.primaryAnchor) throw err // primary anchor is non-negotiable
      warnings.push(`${tf}: ${err instanceof Error ? err.message : 'unavailable'} — skipped`)
    }
  }

  const primaryBars = barsByTF.get(profile.primaryAnchor)!
  const primaryAtr = atrByTF.get(profile.primaryAnchor)!
  const execTF = profile.executionTF
  const execBars = barsByTF.get(execTF) ?? primaryBars
  const execAtr = atrByTF.get(execTF) ?? primaryAtr
  const lastPrice = execBars[execBars.length - 1].c

  // extremity range from primary anchor
  const extWin = primaryBars.slice(-cfg.extremityWindow)
  const range = { hi: Math.max(...extWin.map((b) => b.h)), lo: Math.min(...extWin.map((b) => b.l)) }

  // detect + assemble zones per anchor TF
  const zonesByTF = new Map<Timeframe, Zone[]>()
  for (const tf of profile.anchorTFs) {
    const bars = barsByTF.get(tf)
    const atrS = atrByTF.get(tf)
    if (!bars || !atrS) continue
    const swings = detectSwings(bars, atrS, swingParamsFor(tf))
    const clusters = clusterSwings(swings, atrS, cfg)
    let zones: Zone[] = []
    for (const cluster of [...clusters.resistance, ...clusters.support]) {
      if (cluster.swings.length === 0) continue
      const geom = buildZoneGeometry(cluster, atrS, cfg)
      const zone = assembleZone(geom, bars, atrS, cfg, swingParamsFor(tf).swingLookback, sym, tf, range, lastPrice)
      processZoneLifecycle(zone, bars, atrS, cfg)
      zones.push(zone)
    }
    zones = crossPolarityMerge(zones, cfg)
    // volume-at-price weighting (Phase 5)
    const vp = buildVolumeProfile(bars)
    for (const z of zones) applyVolumeWeighting(z, vp)
    zonesByTF.set(tf, zones)
  }

  // merge across anchor TFs, then score
  const merged = mergeAcrossTimeframes(zonesByTF, profile.anchorTFs, cfg)
  for (const z of merged) scoreZone(z, cfg, (barsByTF.get(z.timeframe)?.length ?? primaryBars.length) - 1)

  const active = merged.filter((z) => z.status !== 'BROKEN').sort((a, b) => b.strength - a.strength)
  const retired = merged.filter((z) => z.status === 'BROKEN').sort((a, b) => b.strength - a.strength)

  // regime + structure
  const regime = classifyRegime(primaryBars, primaryAtr, profile.primaryAnchor, cfg)
  const structure = trackStructure(execBars, execAtr, execTF, cfg)

  // live setup detection
  const { setups, watching } = detectSetup(active, structure, regime, barsByTF, atrByTF, cfg, lastPrice)

  const oldest = new Date(Math.min(...allTFs.map((tf) => barsByTF.get(tf)?.[0]?.t ?? Infinity).filter((x) => isFinite(x))))
  const newest = new Date(Math.max(...allTFs.map((tf) => barsByTF.get(tf)?.slice(-1)[0]?.t ?? 0)))

  const analysis: SRAnalysis = {
    symbol: sym,
    generatedAt: new Date().toISOString(),
    profile,
    lastPrice: Math.round(lastPrice * 100) / 100,
    atr: Object.fromEntries(allTFs.map((tf) => [tf, Math.round((atrByTF.get(tf)?.slice(-1)[0] ?? 0) * 100) / 100])) as any,
    regime: { type: regime.type, strength: regime.strength, timeframe: regime.timeframe, description: regime.description },
    zones: active,
    retiredZones: retired,
    setups,
    watching,
    structure: { state: structure.state, sequence: structure.sequence },
    meta: {
      barsAnalyzed,
      dataProvider: providerName(),
      oldestBar: isFinite(oldest.getTime()) ? oldest.toISOString() : '',
      newestBar: isFinite(newest.getTime()) ? newest.toISOString() : '',
      warnings,
      cached: false,
      computeMs: Date.now() - t0,
    },
  }

  // cache
  try {
    await prisma.srAnalysisCache.upsert({
      where: { symbol_configHash: { symbol: sym, configHash: hash } },
      update: { payload: JSON.stringify(analysis), createdAt: new Date() },
      create: { symbol: sym, configHash: hash, payload: JSON.stringify(analysis) },
    })
  } catch {
    // caching is best-effort
  }

  return analysis
}

function detectSetup(
  active: Zone[],
  structure: ReturnType<typeof trackStructure>,
  regime: ReturnType<typeof classifyRegime>,
  barsByTF: Map<Timeframe, NormBar[]>,
  atrByTF: Map<Timeframe, number[]>,
  cfg: SRConfig,
  lastPrice: number
): { setups: SetupSignal[]; watching: SetupSignal | null } {
  // Candidate = a confirmed zone price is currently inside; else the nearest.
  const withActive = active.filter((z) => z.activeTouch !== null && z.touchCount >= 2)
  const candidate =
    withActive.sort((a, b) => b.strength - a.strength)[0] ??
    active.filter((z) => z.touchCount >= 2).sort((a, b) => Math.abs(a.distanceATR) - Math.abs(b.distanceATR))[0]
  if (!candidate) return { setups: [], watching: null }

  const inZone = candidate.activeTouch !== null
  const direction: 'LONG' | 'SHORT' =
    candidate.polarity === 'RESISTANCE' ? 'SHORT'
    : candidate.polarity === 'SUPPORT' ? 'LONG'
    : lastPrice >= candidate.midpoint ? 'LONG' : 'SHORT'

  const touchT = candidate.activeTouch?.t ?? candidate.touches.slice(-1)[0]?.t ?? 0
  const needBreak: 'BULLISH' | 'BEARISH' = direction === 'LONG' ? 'BULLISH' : 'BEARISH'
  const structureBroken = structure.breaks.some((b) => b.to === needBreak && b.t > touchT)

  const srcBars = barsByTF.get(candidate.timeframe) ?? []
  const srcAtr = atrByTF.get(candidate.timeframe) ?? []
  const approachIdx = candidate.activeTouch?.index ?? candidate.touches.slice(-1)[0]?.index ?? srcBars.length - 1
  const approach = srcBars.length ? classifyApproach(srcBars, srcAtr, Math.min(approachIdx, srcBars.length - 1), cfg) : 'CHOPPY'

  const failedBreakoutCount = candidate.events.filter((e) => e.type === 'FAILED_BREAKOUT').length
  const regimeMult = setupConfidenceMultiplier(regime.type, direction)

  const checklist: ChecklistItem[] = [
    { key: 'inZone', label: 'Price is at an anchor-TF zone', required: true, passed: inZone, detail: inZone ? 'Price is currently inside the zone band' : `Price is ${Math.abs(candidate.distanceATR).toFixed(1)} ATR from the zone` },
    { key: 'confirmed', label: 'Zone is confirmed (≥2 touches)', required: true, passed: candidate.touchCount >= 2, detail: `${candidate.touchCount} confirmed touches` },
    { key: 'extreme', label: 'Zone is at a market extreme', required: true, passed: candidate.components.extremity >= cfg.extremityFloor, detail: `Extremity ${Math.round(candidate.components.extremity)} / floor ${cfg.extremityFloor}` },
    { key: 'htf', label: 'Zone sourced from a higher timeframe', required: true, passed: true, detail: `Detected on ${[candidate.timeframe, ...candidate.confluenceTFs].join(' + ')}` },
    { key: 'structure', label: `Execution-TF structure broke ${needBreak.toLowerCase()}`, required: true, passed: structureBroken, detail: structureBroken ? 'Break of structure confirmed by a close after the touch' : 'Waiting for a confirmed break of structure in the reversal direction' },
    { key: 'approach', label: 'Approach leg is exhaustive', required: false, passed: approach === 'EXHAUSTIVE', detail: `Approach classified ${approach}` },
    { key: 'regime', label: 'Regime supports the direction', required: false, passed: regimeMult >= 1, detail: `${regime.type} → ×${regimeMult.toFixed(2)} confidence` },
    { key: 'failedBreakout', label: 'Failed-breakout precedent here', required: false, passed: failedBreakoutCount > 0, detail: failedBreakoutCount > 0 ? `${failedBreakoutCount} prior failed breakout(s)` : 'None on record' },
    { key: 'round', label: 'Round-number confluence', required: false, passed: candidate.roundNumber != null, detail: candidate.roundNumber != null ? `At ${candidate.roundNumber}` : 'None' },
    { key: 'fastRejections', label: 'Prior rejections were fast', required: false, passed: candidate.components.velocity >= 60, detail: `Velocity score ${Math.round(candidate.components.velocity)}` },
  ]

  const requiredGates = checklist.filter((c) => c.required)
  const requiredPassed = requiredGates.filter((c) => c.passed).length
  const optionalBonuses =
    (approach === 'EXHAUSTIVE' ? 15 : 0) +
    (failedBreakoutCount > 0 ? 8 : 0) +
    (candidate.roundNumber != null ? 5 : 0) +
    (candidate.components.velocity >= 60 ? 7 : 0)

  const confidence = clamp(
    (0.6 * candidate.strength + 40 * (requiredPassed / requiredGates.length)) * regimeMult + optionalBonuses,
    0,
    100
  )

  const pattern: SetupSignal['pattern'] = candidate.flipped ? 'BREAK_AND_RETEST' : failedBreakoutCount > 0 ? 'FAILED_BREAKOUT' : 'REVERSAL'
  const buffer = cfg.invalidationBufferATR * candidate.atrRef
  const invalidationPrice =
    direction === 'SHORT' ? candidate.upper + buffer : candidate.lower - buffer

  const notes: string[] = [regime.description]
  if (regimeMult < 1) notes.push(`Regime is ${regime.type} — this ${direction.toLowerCase()} fights the dominant bias (confidence ×${regimeMult.toFixed(2)})`)
  if (approach === 'EXHAUSTIVE') notes.push('Approach was near-vertical — exhaustion favours a sharp reversal')
  if (approach === 'HEALTHY') notes.push('Approach was methodical — a reversal here is lower-probability than continuation')

  const signal: SetupSignal = {
    zoneId: candidate.id,
    direction,
    pattern,
    confidence: Math.round(confidence),
    checklist,
    invalidationPrice: Math.round(invalidationPrice * 100) / 100,
    approach,
    notes,
  }

  const allRequiredPass = requiredPassed === requiredGates.length
  return allRequiredPass ? { setups: [signal], watching: null } : { setups: [], watching: signal }
}
