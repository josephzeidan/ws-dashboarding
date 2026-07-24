// Multi-ticker S/R scanning (spec §17 Phase 5) + A-grade zone entry alerts.
// Scans a set of symbols and surfaces which ones have price sitting at a strong
// zone right now — the moments worth a human look.

import { runAnalysis } from './engine'
import type { Grade } from './types'

export interface ScanRow {
  symbol: string
  lastPrice: number
  regime: string
  atZone: { grade: Grade; polarity: string; lower: number; upper: number; strength: number } | null
  topZone: { grade: Grade; polarity: string; lower: number; upper: number; distanceATR: number } | null
  setup: { direction: string; confidence: number } | null
  error?: string
}

const STRONG: Grade[] = ['A+', 'A']

export async function scanTickers(symbols: string[], profileId = 'swing'): Promise<ScanRow[]> {
  const rows: ScanRow[] = []
  for (const symbol of symbols) {
    try {
      const a = await runAnalysis(symbol, { profileId, session: 'regular', refresh: false })
      const atZoneZone = a.zones.find((z) => z.activeTouch !== null && z.touchCount >= 2)
      const top = a.zones.filter((z) => !z.filtered && z.grade !== 'D').sort((x, y) => y.strength - x.strength)[0]
      rows.push({
        symbol: a.symbol,
        lastPrice: a.lastPrice,
        regime: a.regime.type,
        atZone: atZoneZone ? { grade: atZoneZone.grade, polarity: atZoneZone.polarity, lower: atZoneZone.lower, upper: atZoneZone.upper, strength: Math.round(atZoneZone.strength) } : null,
        topZone: top ? { grade: top.grade, polarity: top.polarity, lower: top.lower, upper: top.upper, distanceATR: Math.round(top.distanceATR * 10) / 10 } : null,
        setup: a.setups[0] ? { direction: a.setups[0].direction, confidence: a.setups[0].confidence } : null,
      })
    } catch (err) {
      rows.push({ symbol: symbol.toUpperCase(), lastPrice: 0, regime: '—', atZone: null, topZone: null, setup: null, error: err instanceof Error ? err.message : 'failed' })
    }
  }
  return rows
}

/** Returns symbols where price is currently inside an A/A+ grade zone —
 *  the trigger for zone-entry alerts. */
export async function findAGradeZoneEntries(symbols: string[], profileId = 'swing'): Promise<
  { symbol: string; grade: Grade; polarity: string; lower: number; upper: number; setupConfidence: number | null }[]
> {
  const hits: { symbol: string; grade: Grade; polarity: string; lower: number; upper: number; setupConfidence: number | null }[] = []
  for (const symbol of symbols) {
    try {
      const a = await runAnalysis(symbol, { profileId, session: 'regular', refresh: false })
      const z = a.zones.find((x) => x.activeTouch !== null && x.touchCount >= 2 && STRONG.includes(x.grade))
      if (z) hits.push({ symbol: a.symbol, grade: z.grade, polarity: z.polarity, lower: z.lower, upper: z.upper, setupConfidence: a.setups[0]?.confidence ?? a.watching?.confidence ?? null })
    } catch {
      // skip failures in the scan
    }
  }
  return hits
}
