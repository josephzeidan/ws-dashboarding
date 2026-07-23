'use client'
import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PortfolioAnalytics } from '@/lib/types'
import { useLive } from '@/components/LiveProvider'

interface Mover { ticker: string; changePct: number; price: number; currency: string }

const UP = '#10b981'
const DOWN = '#ef4444'

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2, marginBottom: 6 }}>{subtitle}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  )
}

export default function InsightsPage() {
  const [a, setA] = useState<PortfolioAnalytics | null>(null)
  const [movers, setMovers] = useState<Mover[]>([])

  const loadAnalytics = useCallback(async () => {
    const res = await fetch('/api/analytics')
    setA(await res.json())
  }, [])
  const loadMovers = useCallback(async () => {
    const res = await fetch('/api/movers')
    const d = await res.json()
    setMovers(d.movers ?? [])
  }, [])

  useEffect(() => { loadAnalytics(); loadMovers() }, [loadAnalytics, loadMovers])
  useLive('prices-updated', () => { loadAnalytics(); loadMovers() })
  useLive('holdings-updated', () => loadAnalytics())

  if (!a) return <div style={{ padding: 40, color: '#888', fontSize: 14 }}>Loading insights…</div>

  const fmtCAD = (v: number) => v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

  // Winners & losers by unrealized return %
  const gl = [...a.holdings].sort((x, y) => y.glPct - x.glPct).map((h) => ({ ticker: h.ticker, glPct: Math.round(h.glPct * 10) / 10 }))

  // Weight vs target (over/underweight)
  const drift = [...a.holdings]
    .map((h) => ({ ticker: h.ticker, drift: Math.round((h.weightPct - h.targetPct) * 10) / 10 }))
    .filter((h) => Math.abs(h.drift) >= 0.1)
    .sort((x, y) => y.drift - x.drift)

  // Contribution to P&L (unrealized return converted at the live FX rate)
  const usdCad = (a as any).usdCadRate ?? 1.39
  const pnl = [...a.holdings]
    .map((h) => ({ ticker: h.ticker, pnl: Math.round((h.unrealizedReturnCurrency === 'CAD' ? h.unrealizedReturn : h.unrealizedReturn * usdCad)) }))
    .sort((x, y) => y.pnl - x.pnl)

  const moverData = movers.map((m) => ({ ticker: m.ticker, changePct: m.changePct }))

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Insights</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Deeper views of your portfolio — performance, drift, and today's action</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartCard title="Today's movers" subtitle="Live day change % (Yahoo)">
          <ResponsiveContainer width="100%" height={Math.max(160, moverData.length * 22)}>
            <BarChart layout="vertical" data={moverData} margin={{ left: 8, right: 24 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="ticker" width={52} tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Day change']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="changePct" radius={3}>
                {moverData.map((d, i) => <Cell key={i} fill={d.changePct >= 0 ? UP : DOWN} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Winners & losers" subtitle="Unrealized return % since purchase">
          <ResponsiveContainer width="100%" height={Math.max(160, gl.length * 22)}>
            <BarChart layout="vertical" data={gl} margin={{ left: 8, right: 24 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="ticker" width={52} tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Return']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="glPct" radius={3}>
                {gl.map((d, i) => <Cell key={i} fill={d.glPct >= 0 ? UP : DOWN} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weight vs target" subtitle="Over / underweight vs your targets">
          {drift.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
              No target weights set yet.<br />Set targets on the Holdings page to see drift.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, drift.length * 22)}>
              <BarChart layout="vertical" data={drift} margin={{ left: 8, right: 24 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="ticker" width={52} tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}%`, 'Drift']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="drift" radius={3}>
                  {drift.map((d, i) => <Cell key={i} fill={d.drift > 0 ? '#f59e0b' : '#3b6fd4'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="P&L contribution" subtitle="Unrealized gain/loss by holding (CAD)">
          <ResponsiveContainer width="100%" height={Math.max(160, pnl.length * 22)}>
            <BarChart layout="vertical" data={pnl} margin={{ left: 8, right: 24 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCAD(Number(v))} />
              <YAxis type="category" dataKey="ticker" width={52} tick={{ fontSize: 11, fill: '#555' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [fmtCAD(Number(v)), 'P&L']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="pnl" radius={3}>
                {pnl.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? UP : DOWN} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
