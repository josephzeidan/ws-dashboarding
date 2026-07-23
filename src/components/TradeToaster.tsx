'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useLive } from './LiveProvider'

interface ActivityLike {
  id: string
  type: string
  ticker: string
  description: string
}

interface Toast {
  id: string
  type: string
  ticker: string
  text: string
}

// Global listener: pops a toast for each new BUY/SELL fill the poller reports,
// and for actionable alerts (watchlist crossings, SPY signals, big movers).
export default function TradeToaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useLive('alert', (payload) => {
    const a = payload as { id?: string; title?: string; severity?: string }
    if (!a?.id || !a.title) return
    const id = `alert-${a.id}`
    setToasts((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, type: a.severity === 'action' ? 'BUY' : 'SELL', ticker: '', text: `🔔 ${a.title}` }]))
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 7_000)
  })

  useLive('activity', (payload) => {
    const items = Array.isArray(payload) ? (payload as ActivityLike[]) : []
    const fills = items.filter((a) => a.type === 'BUY' || a.type === 'SELL')
    if (fills.length === 0) return

    setToasts((prev) => {
      const existing = new Set(prev.map((t) => t.id))
      const additions = fills
        .filter((f) => !existing.has(f.id))
        .map((f) => ({ id: f.id, type: f.type, ticker: f.ticker, text: `✓ ${f.description}` }))
      return [...prev, ...additions]
    })

    // Mark them seen so they don't re-toast on reconnect / next tick.
    fetch('/api/activities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: fills.map((f) => f.id) }),
    }).catch(() => {})

    // Auto-dismiss after 6s.
    const ids = fills.map((f) => f.id)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => !ids.includes(t.id)))
    }, 6_000)
  })

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 1000 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: '#fff',
            border: `1px solid ${t.type === 'BUY' ? '#10b981' : '#ef4444'}`,
            borderLeft: `4px solid ${t.type === 'BUY' ? '#10b981' : '#ef4444'}`,
            borderRadius: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            padding: '12px 16px',
            minWidth: 260,
            maxWidth: 340,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', marginBottom: 6 }}>{t.text}</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link
              href={`/journal?ticker=${encodeURIComponent(t.ticker)}`}
              style={{ fontSize: 12, color: '#2d5cbe', textDecoration: 'none' }}
              onClick={() => dismiss(t.id)}
            >
              Add note
            </Link>
            <button
              onClick={() => dismiss(t.id)}
              style={{ fontSize: 12, color: '#999', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
