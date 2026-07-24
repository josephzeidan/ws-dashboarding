'use client'
import type { SetupSignal } from '@/lib/sr/types'

const DIR_COLOR = { LONG: '#10b981', SHORT: '#ef4444' }

// Shows the live setup when one is valid; otherwise shows the near-miss
// checklist with the failing required gate highlighted (spec §14.2).
export default function SetupAlert({ setup, watching }: { setup: SetupSignal | null; watching: SetupSignal | null }) {
  const active = setup
  const s = setup ?? watching
  if (!s) {
    return (
      <div className="card" style={{ borderLeft: '4px solid #9ca3af' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>No zone contact</div>
        <div style={{ fontSize: 12.5, color: '#666' }}>Price isn't at a confirmed zone right now. Waiting for price to reach one of the levels above.</div>
      </div>
    )
  }

  const color = DIR_COLOR[s.direction]
  const failingRequired = s.checklist.find((c) => c.required && !c.passed)

  return (
    <div className="card" style={{ borderLeft: `4px solid ${active ? color : '#f59e0b'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{active ? '✅ Live setup' : '👀 Watching'}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: color, borderRadius: 5, padding: '2px 10px' }}>{s.direction}</span>
        <span style={{ fontSize: 11, color: '#888' }}>{s.pattern.replace(/_/g, ' ').toLowerCase()} · {s.approach.toLowerCase()} approach</span>
        <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color }}>{s.confidence}<span style={{ fontSize: 11, color: '#aaa', fontWeight: 400 }}>/100</span></span>
      </div>

      {!active && failingRequired && (
        <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
          Waiting on: <strong>{failingRequired.label}</strong> — {failingRequired.detail}
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        {s.checklist.map((c) => (
          <div key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 12 }}>
            <span style={{ color: c.passed ? '#10b981' : c.required ? '#ef4444' : '#cbd5e1', fontWeight: 700, width: 14 }}>{c.passed ? '✓' : c.required ? '✕' : '○'}</span>
            <span style={{ color: c.required ? '#333' : '#888', fontWeight: c.required ? 600 : 400 }}>{c.label}</span>
            <span style={{ marginLeft: 'auto', color: '#aaa', fontSize: 11 }}>{c.detail}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: '#555' }}>Invalidation: <strong>${s.invalidationPrice}</strong> <span style={{ color: '#aaa' }}>(the level at which this read is wrong — a reference, not a position size)</span></div>
      {s.notes.map((n, i) => <div key={i} style={{ fontSize: 11.5, color: '#777', marginTop: 4 }}>· {n}</div>)}
    </div>
  )
}
