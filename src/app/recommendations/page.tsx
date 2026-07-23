'use client'
import { useEffect, useState } from 'react'
import type { Recommendation } from '@/lib/types'

const ACTION_COLORS: Record<string, string> = {
  ADD: '#16a34a', TRIM: '#f59e0b', SELL: '#dc2626', REPLACE: '#dc2626', HOLD: '#3b82f6', WATCH: '#7c3aed',
}
const ACTION_BADGE: Record<string, string> = {
  ADD: 'badge-green', TRIM: 'badge-amber', SELL: 'badge-red', REPLACE: 'badge-red', HOLD: 'badge-blue', WATCH: 'badge-purple',
}
const PRIORITY_BADGE: Record<string, string> = { HIGH: 'badge-red', MEDIUM: 'badge-amber', LOW: 'badge-gray' }

export default function RecommendationsPage() {
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/recommendations')
      .then((r) => r.json())
      .then((data) => {
        setRecs(data.recommendations ?? [])
        setGeneratedAt(data.generatedAt ?? null)
        setLoading(false)
      })
  }, [])

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Generating recommendations…</div>

  const high = recs.filter((r) => r.priority === 'HIGH')
  const medium = recs.filter((r) => r.priority === 'MEDIUM')
  const low = recs.filter((r) => r.priority === 'LOW')

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Recommendations</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          {recs.length} automated actions · rule-based engine
          {generatedAt && ` · Generated ${new Date(generatedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}`}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <div className="metric-card"><div className="metric-label">High priority</div><div className="metric-value" style={{ color: '#dc2626' }}>{high.length}</div></div>
        <div className="metric-card"><div className="metric-label">Medium priority</div><div className="metric-value" style={{ color: '#f59e0b' }}>{medium.length}</div></div>
        <div className="metric-card"><div className="metric-label">Low priority</div><div className="metric-value" style={{ color: '#888' }}>{low.length}</div></div>
        <div className="metric-card">
          <div className="metric-label">Avg confidence</div>
          <div className="metric-value">
            {recs.length ? Math.round(recs.reduce((s, r) => s + r.confidence, 0) / recs.length) : 0}%
          </div>
        </div>
      </div>

      {/* Rec cards */}
      {recs.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#888' }}>
          No recommendations — portfolio looks well balanced.
        </div>
      )}
      {recs.map((rec, i) => (
        <div key={i} className="card" style={{ marginBottom: 12, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 4, borderRadius: 2, alignSelf: 'stretch', flexShrink: 0, background: ACTION_COLORS[rec.action] ?? '#888' }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className={`badge ${ACTION_BADGE[rec.action] ?? 'badge-gray'}`} style={{ fontSize: 12 }}>{rec.action}</span>
              <span className="ticker-chip">{rec.ticker}</span>
              <span className={`badge ${PRIORITY_BADGE[rec.priority] ?? 'badge-gray'}`} style={{ marginLeft: 'auto' }}>{rec.priority} PRIORITY</span>
              <span className="badge badge-gray">{rec.confidence}% confidence</span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: '#333' }}>{rec.reason}</p>
            <div style={{ marginTop: 8, fontSize: 12, color: '#888', fontStyle: 'italic' }}>Rule: {rec.rule}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
