'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SRAnalysis } from '@/lib/sr/types'
import { PROFILES } from '@/lib/sr/config'
import SRChart from './SRChart'
import ZoneList from './ZoneList'
import RegimeBadge from './RegimeBadge'
import SetupAlert from './SetupAlert'

interface ChartBar { time: number; open: number; high: number; low: number; close: number; volume: number }

const PROFILE_IDS = Object.keys(PROFILES)

export default function SRDashboard() {
  const [ticker, setTicker] = useState('')
  const [profile, setProfile] = useState('swing')
  const [session, setSession] = useState<'regular' | 'extended' | 'all'>('regular')
  const [analysis, setAnalysis] = useState<SRAnalysis | null>(null)
  const [bars, setBars] = useState<ChartBar[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMinor, setShowMinor] = useState(false)
  const [showRetired, setShowRetired] = useState(false)
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([])
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const acRef = useRef<AbortController | null>(null)

  // symbol autocomplete (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (ticker.trim().length < 1) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sr/search?q=${encodeURIComponent(ticker)}`)
        const d = await res.json()
        setSuggestions(d.matches ?? [])
      } catch { /* ignore */ }
    }, 300)
  }, [ticker])

  const analyze = useCallback(async (sym: string) => {
    const t = sym.trim().toUpperCase()
    if (!t) return
    setLoading(true); setError(null); setSuggestions([])
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac
    try {
      const [aRes, bRes] = await Promise.all([
        fetch(`/api/sr/${encodeURIComponent(t)}?profile=${profile}&session=${session}`, { signal: ac.signal }),
        fetch(`/api/sr/${encodeURIComponent(t)}/bars?profile=${profile}&session=${session}`, { signal: ac.signal }),
      ])
      const aData = await aRes.json()
      if (!aRes.ok) { setError(aData.error + (aData.required ? ` (found ${aData.found}, need ${aData.required})` : '')); setAnalysis(null); setBars([]); return }
      const bData = await bRes.json()
      setAnalysis(aData)
      setBars(bData.bars ?? [])
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [profile, session])

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Support &amp; Resistance</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          Ranked S/R zones with strength, grade, and the reasoning behind each — a description of where price has reacted before, not a prediction.
        </p>
      </div>

      {/* controls */}
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') analyze(ticker) }}
            placeholder="Ticker — AAPL, SPY, NVDA…"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
            autoFocus
          />
          {suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: 40, left: 0, right: 0, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.1)', zIndex: 50 }}>
              {suggestions.slice(0, 6).map((s) => (
                <div key={s.symbol} onClick={() => { setTicker(s.symbol); analyze(s.symbol) }}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f4ff')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <strong>{s.symbol}</strong><span style={{ color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <select value={profile} onChange={(e) => setProfile(e.target.value)} style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}>
          {PROFILE_IDS.map((id) => <option key={id} value={id}>{PROFILES[id].label}</option>)}
        </select>
        <select value={session} onChange={(e) => setSession(e.target.value as any)} style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}>
          <option value="regular">Regular hours</option>
          <option value="all">Include extended</option>
        </select>
        <button className="btn btn-primary" onClick={() => analyze(ticker)} disabled={loading}>{loading ? 'Analyzing…' : 'Analyze'}</button>
      </div>

      {error && <div className="card" style={{ padding: 16, background: '#fdeaea', color: '#8b2020', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {analysis && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{analysis.symbol} <span style={{ fontSize: 14, color: '#888', fontWeight: 400 }}>${analysis.lastPrice}</span></div>
            <div style={{ fontSize: 11, color: '#aaa' }}>
              {analysis.meta.cached ? 'cached' : `computed in ${analysis.meta.computeMs}ms`} · {analysis.profile.executionTF} exec · zones from {analysis.profile.anchorTFs.join('/')}
            </div>
            <label style={{ marginLeft: 'auto', fontSize: 12, color: '#666', display: 'flex', gap: 5, alignItems: 'center' }}>
              <input type="checkbox" checked={showMinor} onChange={(e) => setShowMinor(e.target.checked)} /> minor levels
            </label>
            <label style={{ fontSize: 12, color: '#666', display: 'flex', gap: 5, alignItems: 'center' }}>
              <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> retired levels
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <RegimeBadge regime={analysis.regime} structure={analysis.structure} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
            <div>
              <div className="card" style={{ marginBottom: 12, padding: 8 }}>
                <SRChart bars={bars} zones={analysis.zones} retiredZones={analysis.retiredZones} showMinor={showMinor} showRetired={showRetired} lastPrice={analysis.lastPrice} />
              </div>
              <SetupAlert setup={analysis.setups[0] ?? null} watching={analysis.watching} />
            </div>
            <div>
              <ZoneList zones={analysis.zones} maxVisible={6} />
            </div>
          </div>

          {analysis.meta.warnings.length > 0 && (
            <div style={{ fontSize: 11.5, color: '#92400e', marginTop: 12 }}>
              {analysis.meta.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#bbb', marginTop: 16, lineHeight: 1.5 }}>
            Informational only — every score describes past price behaviour, not a forecast or recommendation. Read the reasons and form your own judgement.
          </div>
        </>
      )}

      {!analysis && !loading && !error && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>
          Enter a ticker to map its support &amp; resistance zones.
        </div>
      )}
    </div>
  )
}
