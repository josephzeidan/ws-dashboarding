'use client'
import { useCallback, useEffect, useState } from 'react'

interface Headline {
  id: string
  tickers: string[]
  title: string
  link: string
  source: string
  publishedAt: string
}

// Minimal markdown → HTML for the AI brief (bold, bullets, headings).
function renderBrief(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  for (let raw of lines) {
    let line = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
    const trimmed = line.trim()
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) { out.push('<ul style="margin:6px 0 6px 18px;padding:0">'); inList = true }
      out.push(`<li style="margin:4px 0">${trimmed.replace(/^[-*]\s+/, '')}</li>`)
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      if (/^#{1,3}\s+/.test(trimmed)) out.push(`<div style="font-weight:700;margin:10px 0 4px">${trimmed.replace(/^#{1,3}\s+/, '')}</div>`)
      else if (trimmed) out.push(`<p style="margin:6px 0;line-height:1.6">${trimmed}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600_000)
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NewsPage() {
  const [headlines, setHeadlines] = useState<Headline[]>([])
  const [brief, setBrief] = useState<{ body: string; generatedAt: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<string>('')

  const load = useCallback(async () => {
    const res = await fetch('/api/news')
    const data = await res.json()
    setHeadlines(data.headlines ?? [])
    setBrief(data.brief ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/news', { method: 'POST' })
      const data = await res.json()
      setHeadlines(data.headlines ?? [])
      setBrief(data.brief ?? null)
    } finally {
      setRefreshing(false)
    }
  }

  const tickers = Array.from(new Set(headlines.flatMap((h) => h.tickers))).sort()
  const shown = filter ? headlines.filter((h) => h.tickers.includes(filter)) : headlines

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>News</h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Headlines and an AI daily brief for the stocks you own</p>
        </div>
        <button className="btn btn-primary" disabled={refreshing} onClick={refresh}>
          {refreshing ? 'Refreshing…' : '↻ Refresh & rebrief'}
        </button>
      </div>

      {/* AI daily brief */}
      <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #2d5cbe' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>📈 What matters today</span>
          {brief && <span style={{ fontSize: 11, color: '#aaa' }}>generated {timeAgo(brief.generatedAt)}</span>}
        </div>
        {brief?.body ? (
          <div style={{ fontSize: 13.5, color: '#333' }} dangerouslySetInnerHTML={{ __html: renderBrief(brief.body) }} />
        ) : (
          <p style={{ fontSize: 13, color: '#888', lineHeight: 1.6 }}>
            No brief yet. Click <strong>Refresh &amp; rebrief</strong> to pull the latest headlines for your holdings and generate a prioritized summary.
          </p>
        )}
      </div>

      {/* Ticker filter */}
      {tickers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          <button onClick={() => setFilter('')} className="btn btn-sm" style={{ background: filter === '' ? '#2d5cbe' : '#f2f2f2', color: filter === '' ? '#fff' : '#555', border: 'none' }}>All</button>
          {tickers.map((t) => (
            <button key={t} onClick={() => setFilter(t)} className="btn btn-sm" style={{ background: filter === t ? '#2d5cbe' : '#f2f2f2', color: filter === t ? '#fff' : '#555', border: 'none' }}>{t}</button>
          ))}
        </div>
      )}

      {/* Headlines */}
      {loading ? (
        <div style={{ padding: 40, color: '#888', fontSize: 14 }}>Loading news…</div>
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 14 }}>
          No headlines yet. Hit <strong>Refresh &amp; rebrief</strong> above.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {shown.map((h, i) => (
            <a
              key={h.id}
              href={h.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', padding: '14px 16px', borderBottom: i < shown.length - 1 ? '1px solid #f0f0f0' : 'none', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                {h.tickers.slice(0, 4).map((t) => (
                  <span key={t} style={{ fontSize: 10, fontWeight: 700, color: '#2d5cbe', background: '#e8f0ff', borderRadius: 4, padding: '2px 6px' }}>{t}</span>
                ))}
                <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>{h.source} · {timeAgo(h.publishedAt)}</span>
              </div>
              <div style={{ fontSize: 14, color: '#1a1a1a', lineHeight: 1.4 }}>{h.title}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
