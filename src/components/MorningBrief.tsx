'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

interface BriefCard {
  priority: number
  tag: string
  title: string
  body: string
  href: string
}
interface Brief {
  session: string
  generatedAt: string
  aiComposed: boolean
  cards: BriefCard[]
}

const TAG_STYLE: Record<string, { bg: string; fg: string }> = {
  MOVER: { bg: '#fff1e6', fg: '#c2540a' },
  NEWS: { bg: '#e8f0ff', fg: '#2d5cbe' },
  SIGNAL: { bg: '#f3e8ff', fg: '#7c3aed' },
  QUALITY: { bg: '#e8f7f0', fg: '#1a6645' },
  REBALANCE: { bg: '#fef9c3', fg: '#854d0e' },
  JOURNAL: { bg: '#fce7f3', fg: '#9d174d' },
  INFO: { bg: '#f1f5f9', fg: '#475569' },
}

export default function MorningBrief() {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      const res = await fetch(`/api/brief${refresh ? '?refresh=1' : ''}`)
      const data = await res.json()
      if (data.brief) setBrief(data.brief)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #2d5cbe', color: '#888', fontSize: 13 }}>
        ☕ Preparing your brief — scanning movers, news, and signals…
      </div>
    )
  }
  if (!brief || brief.cards.length === 0) return null

  const timeAgo = Math.round((Date.now() - new Date(brief.generatedAt).getTime()) / 60000)

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid #2d5cbe' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>☕ Your brief</span>
        <span style={{ fontSize: 11, color: '#aaa' }}>
          {brief.aiComposed ? 'AI-composed' : 'signal-composed'} · {timeAgo < 1 ? 'just now' : `${timeAgo}m ago`}
        </span>
        <button
          className="btn btn-sm"
          style={{ marginLeft: 'auto' }}
          disabled={refreshing}
          onClick={() => load(true)}
        >
          {refreshing ? '…' : '↻'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {brief.cards.map((c) => {
          const tag = TAG_STYLE[c.tag] ?? TAG_STYLE.INFO
          return (
            <Link key={c.priority} href={c.href} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: '#fafafa', cursor: 'pointer', border: '1px solid #f0f0f0' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f4ff')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fafafa')}
              >
                <span style={{ fontSize: 15, fontWeight: 800, color: '#cbd5e1', minWidth: 18 }}>{c.priority}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, background: tag.bg, color: tag.fg, borderRadius: 4, padding: '2px 6px' }}>{c.tag}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1a1a1a' }}>{c.title}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.5 }}>{c.body}</div>
                </div>
                <span style={{ color: '#bbb', fontSize: 13, alignSelf: 'center' }}>→</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
