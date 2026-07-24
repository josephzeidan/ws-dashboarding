// Volume-at-price touch weighting (spec §17 Phase 5). Zones that sit at a
// high-volume price node have absorbed more order flow — the methodology's core
// mechanism — so we compute a volume-at-price histogram and boost a zone's
// velocity component when its band overlaps a high-volume node (HVN).

import type { NormBar } from '@/lib/market-data/provider'
import type { Zone } from './types'

export interface VolumeProfile {
  bins: { priceLow: number; priceHigh: number; volume: number }[]
  maxVolume: number
  binSize: number
}

/** Build a volume-at-price histogram over the analysed bars. */
export function buildVolumeProfile(bars: NormBar[], binCount = 50): VolumeProfile {
  if (bars.length === 0) return { bins: [], maxVolume: 0, binSize: 0 }
  const hi = Math.max(...bars.map((b) => b.h))
  const lo = Math.min(...bars.map((b) => b.l))
  const binSize = (hi - lo) / binCount || 1
  const bins = Array.from({ length: binCount }, (_, i) => ({
    priceLow: lo + i * binSize,
    priceHigh: lo + (i + 1) * binSize,
    volume: 0,
  }))
  for (const b of bars) {
    // distribute a bar's volume across the bins its range spans
    const startBin = Math.max(0, Math.floor((b.l - lo) / binSize))
    const endBin = Math.min(binCount - 1, Math.floor((b.h - lo) / binSize))
    const span = endBin - startBin + 1
    const per = b.v / span
    for (let k = startBin; k <= endBin; k++) bins[k].volume += per
  }
  const maxVolume = Math.max(...bins.map((b) => b.volume), 1)
  return { bins, maxVolume, binSize }
}

/** Fraction (0..1) of max volume at the zone's price band — a HVN score. */
export function volumeAtZone(zone: Zone, profile: VolumeProfile): number {
  if (profile.bins.length === 0) return 0
  let vol = 0
  for (const bin of profile.bins) {
    if (bin.priceHigh >= zone.lower && bin.priceLow <= zone.upper) vol += bin.volume
  }
  // normalise by the volume a single max bin would hold, times the band's bin span
  const bandBins = Math.max(1, (zone.upper - zone.lower) / (profile.binSize || 1))
  const norm = vol / (profile.maxVolume * bandBins)
  return Math.max(0, Math.min(1, norm))
}

/** Apply a volume boost to a zone's velocity component (up to +12). */
export function applyVolumeWeighting(zone: Zone, profile: VolumeProfile): void {
  const hvn = volumeAtZone(zone, profile)
  if (hvn > 0.4) {
    const boost = Math.min(12, (hvn - 0.4) * 40)
    zone.components.velocity = Math.min(100, zone.components.velocity + boost)
    if (hvn > 0.6) zone.reasons.push(`High-volume node here — heavy prior order absorption (${Math.round(hvn * 100)}% of peak volume)`)
  }
}
