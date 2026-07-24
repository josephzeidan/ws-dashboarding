// Cluster swings that occurred at effectively the same price into raw zone
// candidates (spec §7). Single-link agglomerative pass with an ATR/percent
// tolerance floor so it works on both $3 and $900 names.

import type { Swing, SRConfig, Cluster } from './types'

function clusterSet(swings: Swing[], atrSeries: number[], cfg: SRConfig): Swing[][] {
  if (swings.length === 0) return []
  const sorted = [...swings].sort((a, b) => a.price - b.price)
  const tol = (s: Swing) => Math.max(cfg.clusterTolATR * (atrSeries[s.index] || 0), cfg.clusterTolPct * s.price)

  const clusters: Swing[][] = []
  let current: Swing[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    const gap = cur.price - prev.price
    const allowed = (tol(cur) + tol(prev)) / 2
    if (gap > allowed) {
      clusters.push(current)
      current = [cur]
    } else {
      current.push(cur)
    }
  }
  clusters.push(current)
  return clusters
}

export interface ClusterResult {
  resistance: Cluster[]
  support: Cluster[]
}

export function clusterSwings(swings: Swing[], atrSeries: number[], cfg: SRConfig): ClusterResult {
  const highs = swings.filter((s) => s.kind === 'HIGH')
  const lows = swings.filter((s) => s.kind === 'LOW')

  const resistance: Cluster[] = clusterSet(highs, atrSeries, cfg).map((swings) => ({ polarity: 'RESISTANCE', swings }))
  const support: Cluster[] = clusterSet(lows, atrSeries, cfg).map((swings) => ({ polarity: 'SUPPORT', swings }))
  return { resistance, support }
}
