'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLive } from './LiveProvider'

interface Activity {
  id: string
  type: string
  ticker: string
  description: string
  occurredAt: string
}

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

// Dashboard widget: live TFSA cash balance + the 5 most recent activities.
export default function CashAndActivity() {
  const [cash, setCash] = useState<{ cashCAD: number; connected: boolean } | null>(null)
  const [recent, setRecent] = useState<Activity[]>([])

  const load = useCallback(async () => {
    try {
      const [statusRes, actRes] = await Promise.all([
        fetch('/api/ws/status'),
        fetch('/api/activities?limit=5'),
      ])
      const status = await statusRes.json()
      const act = await actRes.json()
      setCash({ cashCAD: status.account?.cashCAD ?? 0, connected: status.status === 'connected' })
      setRecent(act.activities ?? [])
    } catch {
      // keep last state
    }
  }, [])

  useEffect(() => { load() }, [load])
  useLive('activity', () => load())
  useLive('holdings-updated', () => load())

  const fmtCAD = (v: number) => v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 12 }}>Cash balance</div>
        {cash?.connected ? (
          <>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a1a' }}>{fmtCAD(cash.cashCAD)}</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>Available in TFSA</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.6 }}>
            <Link href="/settings" style={{ color: '#2d5cbe', textDecoration: 'none' }}>Connect Wealthsimple</Link> to see live cash.
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>Recent activity</div>
          <Link href="/activity" style={{ fontSize: 12, color: '#2d5cbe', textDecoration: 'none' }}>View all →</Link>
        </div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: '#aaa' }}>No activity yet.</div>
        ) : (
          recent.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < recent.length - 1 ? '1px solid #f2f2f2' : 'none' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: TYPE_COLOR[a.type] ?? TYPE_COLOR.OTHER, borderRadius: 4, padding: '2px 6px', minWidth: 48, textAlign: 'center' }}>
                {a.type}
              </span>
              <span style={{ flex: 1, fontSize: 12.5, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</span>
              <span style={{ fontSize: 11, color: '#aaa' }}>
                {new Date(a.occurredAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
