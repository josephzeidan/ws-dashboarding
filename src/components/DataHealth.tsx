'use client'
import { useEffect, useState } from 'react'

interface Source {
  key: string
  label: string
  ok: boolean
  detail: string
  ageMin: number | null
}

// Compact per-source freshness strip — makes silent data staleness visible.
export default function DataHealth() {
  const [sources, setSources] = useState<Source[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/health')
        const d = await res.json()
        if (alive && d.sources) setSources(d.sources)
      } catch {
        // keep last
      }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (sources.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 11, color: '#999', marginBottom: 12 }}>
      {sources.map((s) => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} title={s.detail}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.ok ? '#10b981' : '#f59e0b', display: 'inline-block' }} />
          {s.label}
          {s.ageMin != null && <span style={{ color: '#c5c5c5' }}>{s.ageMin < 1 ? 'now' : s.ageMin < 60 ? `${s.ageMin}m` : `${Math.round(s.ageMin / 60)}h`}</span>}
        </span>
      ))}
    </div>
  )
}
