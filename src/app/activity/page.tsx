'use client'
import { useCallback, useEffect, useState } from 'react'
import { useLive } from '@/components/LiveProvider'

interface Activity {
  id: string
  type: string
  ticker: string
  description: string
  quantity: number | null
  price: number | null
  amount: number | null
  currency: string
  occurredAt: string
}

const FILTERS: { label: string; types: string[] }[] = [
  { label: 'All', types: [] },
  { label: 'Trades', types: ['BUY', 'SELL'] },
  { label: 'Dividends', types: ['DIVIDEND'] },
  { label: 'Cash', types: ['DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'FEE'] },
]

const TYPE_COLOR: Record<string, string> = {
  BUY: '#10b981',
  SELL: '#ef4444',
  DIVIDEND: '#7c3aed',
  DEPOSIT: '#3b82f6',
  WITHDRAWAL: '#f59e0b',
  INTEREST: '#3b82f6',
  FEE: '#9ca3af',
  OTHER: '#9ca3af',
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [filter, setFilter] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const types = FILTERS[filter].types
    const qs = types.length ? `?type=${types.join(',')}&limit=200` : '?limit=200'
    const res = await fetch(`/api/activities${qs}`)
    const data = await res.json()
    setActivities(data.activities ?? [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])
  useLive('activity', () => load())

  const fmtMoney = (v: number, ccy: string) =>
    v.toLocaleString('en-CA', { style: 'currency', currency: ccy === 'USD' ? 'USD' : 'CAD' })

  // group by calendar day
  const groups: { day: string; items: Activity[] }[] = []
  for (const a of activities) {
    const day = new Date(a.occurredAt).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(a)
    else groups.push({ day, items: [a] })
  }

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Activity</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Live feed of fills, dividends, and cash movements from Wealthsimple</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            onClick={() => setFilter(i)}
            className="btn btn-sm"
            style={{
              background: filter === i ? '#2d5cbe' : '#f2f2f2',
              color: filter === i ? '#fff' : '#555',
              border: 'none',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, color: '#888', fontSize: 14 }}>Loading activity…</div>
      ) : activities.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 14 }}>
          No activity yet. Connect Wealthsimple in <a href="/settings" style={{ color: '#2d5cbe' }}>Settings</a> to sync your trade history.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.day} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              {g.day}
            </div>
            <div className="card" style={{ padding: 0 }}>
              {g.items.map((a, idx) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 16px',
                    borderBottom: idx < g.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#fff',
                      background: TYPE_COLOR[a.type] ?? TYPE_COLOR.OTHER,
                      borderRadius: 5,
                      padding: '3px 7px',
                      minWidth: 54,
                      textAlign: 'center',
                    }}
                  >
                    {a.type}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: '#333' }}>{a.description}</span>
                  {a.amount != null && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: a.type === 'SELL' || a.type === 'DEPOSIT' || a.type === 'DIVIDEND' ? '#1a6645' : '#333' }}>
                      {fmtMoney(a.amount, a.currency)}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#aaa', minWidth: 62, textAlign: 'right' }}>
                    {new Date(a.occurredAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
