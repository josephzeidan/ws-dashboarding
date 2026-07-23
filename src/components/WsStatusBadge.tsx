'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const DOT: Record<string, string> = {
  connected: '#10b981',
  expired: '#f59e0b',
  error: '#ef4444',
  disconnected: '#9ca3af',
}

const LABEL: Record<string, string> = {
  connected: 'Wealthsimple: live',
  expired: 'WS session expired',
  error: 'WS sync error',
  disconnected: 'WS not connected',
}

export default function WsStatusBadge() {
  const [status, setStatus] = useState<string>('disconnected')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        const res = await fetch('/api/ws/status')
        const data = await res.json()
        if (alive && data.status) {
          setStatus(data.status)
          setLastSyncAt(data.lastSyncAt ?? null)
        }
      } catch {
        // keep last known state
      }
    }
    poll()
    const timer = setInterval(poll, 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return (
    <Link href="/settings" style={{ textDecoration: 'none' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888', cursor: 'pointer' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOT[status] ?? DOT.disconnected, display: 'inline-block' }} />
        {LABEL[status] ?? LABEL.disconnected}
        {status === 'connected' && lastSyncAt && (
          <span style={{ color: '#bbb' }}>
            · {new Date(lastSyncAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </span>
    </Link>
  )
}
