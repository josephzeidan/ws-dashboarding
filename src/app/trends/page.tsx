'use client'
import { useEffect, useState } from 'react'
import type { MacroTrend } from '@/lib/types'

const SIGNAL_BADGE: Record<string, string> = { BULLISH: 'badge-green', BEARISH: 'badge-red', NEUTRAL: 'badge-amber' }
const SIGNAL_DOT: Record<string, string> = { BULLISH: '#16a34a', BEARISH: '#dc2626', NEUTRAL: '#f59e0b' }

export default function TrendsPage() {
  const [trends, setTrends] = useState<MacroTrend[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/trends').then((r) => r.json()).then((data) => { setTrends(data); setLoading(false) })
  }, [])

  async function updateSignal(id: string, signal: string) {
    await fetch('/api/trends', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, signal }) })
    setTrends((prev) => prev.map((t) => (t.id === id ? { ...t, signal: signal as MacroTrend['signal'] } : t)))
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading trends…</div>

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Macro Trends</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Theme signals and portfolio exposure mapping · update signals as macro evolves</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {trends.map((t) => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: SIGNAL_DOT[t.signal] ?? '#888', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{t.name}</span>
              <select
                className="badge"
                style={{ border: 'none', cursor: 'pointer', fontWeight: 600 }}
                value={t.signal}
                onChange={(e) => updateSignal(t.id, e.target.value)}
              >
                <option value="BULLISH">BULLISH</option>
                <option value="NEUTRAL">NEUTRAL</option>
                <option value="BEARISH">BEARISH</option>
              </select>
            </div>

            {/* Holdings */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {t.tickers.map((tick) => (
                <span key={tick} className="ticker-chip">{tick}</span>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {t.drivers.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Drivers</div>
                  {t.drivers.map((d, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#555', padding: '2px 0', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#16a34a', flexShrink: 0 }}>+</span>{d}
                    </div>
                  ))}
                </div>
              )}
              {t.risks.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Risks</div>
                  {t.risks.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#555', padding: '2px 0', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#dc2626', flexShrink: 0 }}>−</span>{r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
