'use client'
import { useEffect, useState } from 'react'
import { useLiveStatus } from './LiveProvider'

// Small "● Live · updated Ns ago" indicator driven by the SSE connection.
export default function LiveStatus() {
  const { connected, lastEventAt } = useLiveStatus()
  const [, tick] = useState(0)

  // re-render every 5s so the "Ns ago" stays current
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5_000)
    return () => clearInterval(t)
  }, [])

  const lastPrice = lastEventAt['prices-updated']
  const ago = lastPrice ? Math.round((Date.now() - lastPrice) / 1000) : null
  const agoLabel =
    ago == null ? 'waiting for first update' : ago < 60 ? `updated ${ago}s ago` : `updated ${Math.round(ago / 60)}m ago`

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: connected ? '#1a6645' : '#aaa' }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: connected ? '#10b981' : '#ccc',
          display: 'inline-block',
          boxShadow: connected ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
        }}
      />
      {connected ? `Live · ${agoLabel}` : 'Reconnecting…'}
    </span>
  )
}
