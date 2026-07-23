'use client'
import { useEffect, useState } from 'react'
import type { JournalEntry } from '@/lib/types'

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [writing, setWriting] = useState(false)
  const [form, setForm] = useState({ ticker: '', title: '', body: '', tags: '' })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')

  async function load() {
    const res = await fetch('/api/journal')
    setEntries(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function submit() {
    setSaving(true)
    await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) }),
    })
    setForm({ ticker: '', title: '', body: '', tags: '' })
    setWriting(false)
    setSaving(false)
    load()
  }

  async function del(id: string) {
    if (!confirm('Delete this entry?')) return
    await fetch('/api/journal', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  const filtered = entries.filter((e) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q) || (e.ticker ?? '').toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q))
  })

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading journal…</div>

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Investment Journal</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Thesis notes, trade rationale, and portfolio decisions</p>
        </div>
        <button className="btn btn-primary" onClick={() => setWriting(!writing)}>+ New entry</button>
      </div>

      {writing && (
        <div className="card" style={{ marginBottom: 16, background: '#f8f9ff' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>New journal entry</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 200px', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Ticker (optional)</label>
              <input style={{ width: '100%', textTransform: 'uppercase' }} placeholder="NVDA" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Title *</label>
              <input style={{ width: '100%' }} placeholder="Entry title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Tags (comma separated)</label>
              <input style={{ width: '100%' }} placeholder="review, AI, thesis" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Notes *</label>
            <textarea rows={5} style={{ width: '100%', resize: 'vertical' }} placeholder="What are you thinking about this position or the portfolio?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={saving || !form.title || !form.body} onClick={submit}>{saving ? 'Saving…' : 'Save entry'}</button>
            <button className="btn btn-sm" onClick={() => setWriting(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input style={{ width: 300 }} placeholder="Search entries…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      {filtered.length === 0 && <div className="card" style={{ color: '#888', fontSize: 13, padding: 32, textAlign: 'center' }}>No entries found.</div>}

      {filtered.map((entry) => (
        <div key={entry.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {entry.ticker && <span className="ticker-chip">{entry.ticker}</span>}
              <span style={{ fontWeight: 600, fontSize: 14 }}>{entry.title}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#aaa' }}>{new Date(entry.date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              <button className="btn btn-sm btn-danger" onClick={() => del(entry.id)}>Delete</button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: '#444', whiteSpace: 'pre-wrap' }}>{entry.body}</p>
          {entry.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {entry.tags.map((tag) => <span key={tag} className="badge badge-gray">{tag}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
