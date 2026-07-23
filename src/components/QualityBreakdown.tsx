'use client'
import type { QualityBreakdown as QB } from '@/lib/types'

const COLORS: Record<string, string> = {
  base: '#cbd5e1',
  conviction: '#3b6fd4',
  diversification: '#10b981',
  concentration: '#ef4444',
}

// Shows what builds up the Quality Score, how much headroom each driver has,
// and the single biggest lever to raise it.
export default function QualityBreakdown({ data }: { data: QB }) {
  const positives = data.components.filter((c) => c.points > 0)
  const totalPositive = positives.reduce((s, c) => s + c.points, 0)

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>Quality score breakdown</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{data.score}<span style={{ fontSize: 13, color: '#aaa', fontWeight: 400 }}> / 100</span></div>
      </div>

      {/* Stacked contribution bar */}
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 6 }}>
        {positives.map((c) => (
          <div key={c.key} title={`${c.label}: ${c.points} pts`} style={{ width: `${(c.points / totalPositive) * 100}%`, background: COLORS[c.key] }} />
        ))}
      </div>

      {/* Component rows */}
      <div style={{ marginBottom: 14 }}>
        {data.components.map((c) => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: COLORS[c.key], display: 'inline-block' }} />
            <span style={{ flex: 1, color: '#444' }}>{c.label}</span>
            <span style={{ fontWeight: 600, color: c.points < 0 ? '#ef4444' : '#1a1a1a', minWidth: 52, textAlign: 'right' }}>
              {c.points > 0 ? '+' : ''}{c.points} pts
            </span>
            <span style={{ color: '#aaa', minWidth: 96, textAlign: 'right' }}>
              {c.headroom > 0 ? `+${c.headroom} available` : c.key === 'base' ? 'fixed' : 'maxed'}
            </span>
          </div>
        ))}
      </div>

      {/* Biggest lever */}
      <div style={{ background: '#f0f6ff', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#2d5cbe', marginBottom: 4 }}>
          🔑 Biggest lever: {data.biggestLever}
        </div>
        <div style={{ fontSize: 12.5, color: '#334', lineHeight: 1.55 }}>{data.advice}</div>
      </div>
    </div>
  )
}
