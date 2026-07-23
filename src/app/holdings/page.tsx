'use client'
import { useEffect, useState } from 'react'
import type { Holding } from '@/lib/types'
import { useLive } from '@/components/LiveProvider'

export default function HoldingsPage() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Holding>>({})
  const [saving, setSaving] = useState(false)
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'ticker', dir: 1 })

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true)
    const res = await fetch('/api/holdings')
    setHoldings(await res.json())
    setLoading(false)
  }

  useEffect(() => { load(true) }, [])

  // Live: refresh quantities/prices when the poller reports changes,
  // but not while the user is mid-edit on a row.
  useLive('prices-updated', () => { if (!editing) load(false) })
  useLive('holdings-updated', () => { if (!editing) load(false) })

  async function saveEdit(ticker: string) {
    setSaving(true)
    await fetch('/api/holdings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, ...editData }),
    })
    setEditing(null)
    setEditData({})
    setSaving(false)
    load()
  }

  function sortedHoldings() {
    return [...holdings].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sort.key]
      const bv = (b as Record<string, unknown>)[sort.key]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
      return String(av).localeCompare(String(bv)) * sort.dir
    })
  }

  function toggleSort(key: string) {
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))
  }

  const SortTh = ({ k, label }: { k: string; label: string }) => (
    <th onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label} {sort.key === k ? (sort.dir === 1 ? '↑' : '↓') : ''}
    </th>
  )

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading holdings…</div>

  const totalValueCAD = holdings.reduce((s, h) => {
    const toCAD = h.marketValueCurrency === 'USD' ? 1.39 : 1
    return s + h.marketValue * toCAD
  }, 0)

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Holdings</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>{holdings.length} positions · Click a row to edit metadata (thesis, conviction, target)</p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <SortTh k="ticker" label="Ticker" />
              <SortTh k="name" label="Name" />
              <SortTh k="quantity" label="Qty" />
              <SortTh k="marketPrice" label="Price" />
              <SortTh k="marketValue" label="Mkt Value" />
              <th>Weight</th>
              <SortTh k="unrealizedReturn" label="Unrealized G/L" />
              <SortTh k="conviction" label="Conv." />
              <SortTh k="targetPct" label="Target" />
              <th>Bucket</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings().map((h) => {
              const valueCAD = h.marketValue * (h.marketValueCurrency === 'USD' ? 1.39 : 1)
              const weight = (valueCAD / totalValueCAD) * 100
              const glPct = h.bookValueMkt ? ((h.marketValue - h.bookValueMkt) / h.bookValueMkt) * 100 : 0
              const bucketColor = h.bucket === 'Core' ? 'badge-blue' : h.bucket === 'Tactical' ? 'badge-amber' : 'badge-purple'
              const isEditing = editing === h.ticker

              return (
                <>
                  <tr key={h.ticker} style={{ cursor: 'pointer' }} onClick={() => {
                    if (!isEditing) { setEditing(h.ticker); setEditData({ conviction: h.conviction, targetPct: h.targetPct, bucket: h.bucket, theme: h.theme, horizon: h.horizon, thesis: h.thesis }) }
                  }}>
                    <td><span className="ticker-chip">{h.ticker}</span></td>
                    <td style={{ color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name.length > 22 ? h.name.slice(0,22)+'…' : h.name}</td>
                    <td style={{ color: '#888' }}>{h.quantity.toFixed(4)}</td>
                    <td style={{ fontWeight: 500 }}>{h.marketPriceCurrency === 'CAD' ? 'C$' : '$'}{h.marketPrice.toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>{h.marketValueCurrency === 'CAD' ? 'C$' : '$'}{h.marketValue.toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="progress" style={{ width: 48 }}>
                          <div className="progress-fill" style={{ width: `${Math.min(100, weight * 5)}%`, background: '#3b6fd4' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{weight.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className={glPct >= 0 ? 'up' : 'down'} style={{ fontWeight: 500 }}>
                      {glPct >= 0 ? '+' : ''}{glPct.toFixed(1)}%
                    </td>
                    <td style={{ fontWeight: 600 }}>{h.conviction}/10</td>
                    <td style={{ color: '#888' }}>{h.targetPct}%</td>
                    <td><span className={`badge ${bucketColor}`}>{h.bucket}</span></td>
                    <td>
                      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEditing(h.ticker); setEditData({ conviction: h.conviction, targetPct: h.targetPct, bucket: h.bucket, theme: h.theme, horizon: h.horizon, thesis: h.thesis }) }}>Edit</button>
                    </td>
                  </tr>
                  {isEditing && (
                    <tr key={h.ticker + '-edit'}>
                      <td colSpan={11} style={{ background: '#f8f9ff', padding: '16px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                          <div>
                            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Bucket</label>
                            <select style={{ width: '100%' }} value={editData.bucket ?? h.bucket} onChange={(e) => setEditData({ ...editData, bucket: e.target.value })}>
                              <option>Core</option><option>Tactical</option><option>Speculative</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Conviction (1-10)</label>
                            <input type="number" min={1} max={10} style={{ width: '100%' }} value={editData.conviction ?? h.conviction} onChange={(e) => setEditData({ ...editData, conviction: parseInt(e.target.value) })} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Target weight (%)</label>
                            <input type="number" min={0} max={50} step={0.5} style={{ width: '100%' }} value={editData.targetPct ?? h.targetPct} onChange={(e) => setEditData({ ...editData, targetPct: parseFloat(e.target.value) })} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Horizon</label>
                            <select style={{ width: '100%' }} value={editData.horizon ?? h.horizon} onChange={(e) => setEditData({ ...editData, horizon: e.target.value })}>
                              <option>SHORT</option><option>MEDIUM</option><option>LONG</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Theme</label>
                          <input style={{ width: '100%' }} value={editData.theme ?? h.theme} onChange={(e) => setEditData({ ...editData, theme: e.target.value })} />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Thesis</label>
                          <textarea rows={3} style={{ width: '100%', resize: 'vertical' }} value={editData.thesis ?? h.thesis} onChange={(e) => setEditData({ ...editData, thesis: e.target.value })} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveEdit(h.ticker)}>{saving ? 'Saving…' : 'Save changes'}</button>
                          <button className="btn btn-sm" onClick={() => { setEditing(null); setEditData({}) }}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
