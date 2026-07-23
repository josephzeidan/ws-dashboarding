'use client'
import { useState } from 'react'

export default function PriceRefresher({ onRefresh }: { onRefresh: () => void }) {
  const [loading, setLoading] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/prices', { method: 'POST' })
      const data = await res.json()
      setLast(new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }))
      setToast(`✓ ${data.updated} prices updated`)
      setTimeout(() => setToast(null), 3000)
      onRefresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {last && <span style={{ fontSize: 12, color: '#aaa' }}>Prices as of {last}</span>}
        <button className="btn btn-sm" disabled={loading} onClick={refresh}>
          {loading ? '↻ Refreshing…' : '↻ Refresh prices'}
        </button>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
