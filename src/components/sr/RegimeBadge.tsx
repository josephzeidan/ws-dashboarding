'use client'
import type { SRAnalysis } from '@/lib/sr/types'

const STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  UPTREND: { bg: '#e8f7f0', fg: '#1a6645', icon: '↗' },
  DOWNTREND: { bg: '#fdeaea', fg: '#8b2020', icon: '↘' },
  RANGE: { bg: '#eef2ff', fg: '#3730a3', icon: '↔' },
  TRANSITIONAL: { bg: '#fffbeb', fg: '#854d0e', icon: '↯' },
}

export default function RegimeBadge({ regime, structure }: { regime: SRAnalysis['regime']; structure: SRAnalysis['structure'] }) {
  const s = STYLE[regime.type] ?? STYLE.TRANSITIONAL
  return (
    <div style={{ background: s.bg, borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 15, color: s.fg }}>{s.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: s.fg }}>{regime.type}</span>
        <span style={{ fontSize: 11, color: s.fg, opacity: 0.7 }}>strength {regime.strength} · {regime.timeframe}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: s.fg, opacity: 0.8 }}>
          structure: <strong>{structure.state}</strong> {structure.sequence.join(' ')}
        </span>
      </div>
      <div style={{ fontSize: 12, color: s.fg, opacity: 0.9, lineHeight: 1.4 }}>{regime.description}</div>
    </div>
  )
}
