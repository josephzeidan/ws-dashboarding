'use client'
import type { Zone } from '@/lib/sr/types'

const GRADE_COLOR: Record<string, string> = { 'A+': '#059669', A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#9ca3af' }
const POLARITY_COLOR: Record<string, string> = { RESISTANCE: '#ef4444', SUPPORT: '#10b981', FLIP: '#f59e0b' }

const COMP_LABEL: Record<string, string> = { touch: 'Touches', velocity: 'Velocity', extremity: 'Extremity', htf: 'HTF', round: 'Round #', freshness: 'Fresh' }

export default function ZoneCard({ zone }: { zone: Zone }) {
  const g = GRADE_COLOR[zone.grade]
  const dist = zone.distanceFromPrice
  return (
    <div className="card" style={{ marginBottom: 10, opacity: zone.filtered ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: g, borderRadius: 6, padding: '2px 9px', minWidth: 30, textAlign: 'center' }}>{zone.grade}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: POLARITY_COLOR[zone.polarity], border: `1px solid ${POLARITY_COLOR[zone.polarity]}`, borderRadius: 4, padding: '1px 6px' }}>{zone.polarity}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>${zone.lower.toFixed(2)} – ${zone.upper.toFixed(2)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: dist >= 0 ? '#1a6645' : '#b23' }}>
          {dist >= 0 ? '+' : ''}{dist.toFixed(2)} ({zone.distanceATR >= 0 ? '+' : ''}{zone.distanceATR.toFixed(1)} ATR)
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888', marginBottom: 8 }}>
        <span>strength <strong style={{ color: '#333' }}>{Math.round(zone.strength)}</strong></span>
        <span>{zone.timeframe}{zone.confluenceTFs.length ? ` +${zone.confluenceTFs.join(',')}` : ''}</span>
        {zone.roundNumber != null && <span>round {zone.roundNumber}</span>}
        {zone.flipped && <span style={{ color: '#f59e0b' }}>flipped</span>}
      </div>

      {/* component bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 10 }}>
        {(Object.keys(zone.components) as (keyof typeof zone.components)[]).map((k) => (
          <div key={k}>
            <div style={{ fontSize: 9, color: '#aaa', marginBottom: 2 }}>{COMP_LABEL[k]}</div>
            <div style={{ height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${zone.components[k]}%`, height: '100%', background: g }} />
            </div>
          </div>
        ))}
      </div>

      {zone.reasons.length > 0 && (
        <ul style={{ margin: '0 0 6px 0', padding: '0 0 0 16px' }}>
          {zone.reasons.map((r, i) => <li key={i} style={{ fontSize: 12, color: '#444', lineHeight: 1.5 }}>{r}</li>)}
        </ul>
      )}
      {zone.warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', borderRadius: 6, padding: '4px 8px', marginTop: 4 }}>⚠ {w}</div>
      ))}
    </div>
  )
}
