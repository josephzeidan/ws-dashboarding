'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLive } from './LiveProvider'

interface Alert {
  id: string
  type: string
  ticker: string
  title: string
  body: string
  href: string
  severity: string
  createdAt: string
  readAt: string | null
}

const SEV_DOT: Record<string, string> = { action: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }

function timeAgo(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  if (m < 24 * 60) return `${Math.round(m / 60)}h`
  return `${Math.round(m / 1440)}d`
}

export default function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts')
      const d = await res.json()
      setAlerts(d.alerts ?? [])
      setUnread(d.unread ?? 0)
    } catch {
      // keep last state
    }
  }, [])

  useEffect(() => { load() }, [load])
  useLive('alert', () => load())

  async function markAllRead() {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    load()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(!open); if (!open && unread > 0) markAllRead() }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#888', padding: 0 }}
      >
        <span style={{ fontSize: 13 }}>🔔</span>
        Alerts
        {unread > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9, padding: '1px 6px' }}>{unread}</span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', bottom: 24, left: 0, width: 300, maxHeight: 360, overflowY: 'auto',
            background: '#fff', border: '1px solid #e5e5e5', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 200, padding: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, padding: '6px 8px', color: '#555' }}>Alerts</div>
          {alerts.length === 0 ? (
            <div style={{ fontSize: 12, color: '#999', padding: '8px' }}>No alerts yet. Big holding moves, watchlist crossings, and SPY signals will land here.</div>
          ) : (
            alerts.map((a) => (
              <Link key={a.id} href={a.href || '/'} style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setOpen(false)}>
                <div style={{ display: 'flex', gap: 8, padding: '8px', borderRadius: 8, background: a.readAt ? 'transparent' : '#f0f6ff', marginBottom: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_DOT[a.severity] ?? SEV_DOT.info, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>{a.title}</div>
                    {a.body && <div style={{ fontSize: 11.5, color: '#777', marginTop: 2, lineHeight: 1.4 }}>{a.body}</div>}
                  </div>
                  <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>{timeAgo(a.createdAt)}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
