'use client'
import { useEffect, useState } from 'react'
import type { WatchlistItem } from '@/lib/types'

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ ticker: '', name: '', theme: '', notes: '', alertPrice: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch('/api/watchlist')
    setItems(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add() {
    setSaving(true)
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, alertPrice: form.alertPrice ? Number(form.alertPrice) : null }),
    })
    setForm({ ticker: '', name: '', theme: '', notes: '', alertPrice: '' })
    setAdding(false)
    setSaving(false)
    load()
  }

  async function remove(ticker: string) {
    await fetch('/api/watchlist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) })
    load()
  }

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading watchlist…</div>

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Watchlist</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Candidates and opportunities to monitor before adding to TFSA</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(!adding)}>+ Add ticker</button>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16, background: '#f8f9ff' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Add to watchlist</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Ticker *</label>
              <input style={{ width: '100%', textTransform: 'uppercase' }} placeholder="e.g. ARM" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Company name *</label>
              <input style={{ width: '100%' }} placeholder="e.g. Arm Holdings" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Theme</label>
              <input style={{ width: '100%' }} placeholder="e.g. Semi / AI" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Notes / thesis</label>
            <textarea rows={2} style={{ width: '100%', resize: 'vertical' }} placeholder="Why are you watching this?" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={saving || !form.ticker || !form.name} onClick={add}>{saving ? 'Saving…' : 'Add'}</button>
            <button className="btn btn-sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        {items.length === 0 && <div style={{ color: '#888', fontSize: 13, padding: '20px 0' }}>No watchlist items yet. Add tickers above.</div>}
        {items.map((item, i) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 0', borderBottom: i < items.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
            <div style={{ width: 64, flexShrink: 0 }}>
              <span className="ticker-chip" style={{ fontSize: 13 }}>{item.ticker}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{item.notes}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {item.theme && <span className="badge badge-purple">{item.theme}</span>}
                {item.alertPrice && <span className="badge badge-amber">Alert at ${item.alertPrice}</span>}
              </div>
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => remove(item.ticker)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
}
