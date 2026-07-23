'use client'
import { useEffect, useState } from 'react'
import type { PortfolioAnalytics } from '@/lib/types'
import AllocationChart from '@/components/AllocationChart'
import PriceRefresher from '@/components/PriceRefresher'
import LiveStatus from '@/components/LiveStatus'
import CashAndActivity from '@/components/CashAndActivity'
import PortfolioValueChart from '@/components/PortfolioValueChart'
import QualityBreakdown from '@/components/QualityBreakdown'
import MorningBrief from '@/components/MorningBrief'
import DataHealth from '@/components/DataHealth'
import GoalTracker from '@/components/GoalTracker'
import { useLive } from '@/components/LiveProvider'

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true)
    try {
      const res = await fetch('/api/analytics')
      const data = await res.json()
      setAnalytics(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(true) }, [])

  // Live: silently refresh when the poller reports new prices/holdings.
  useLive('prices-updated', () => load(false))
  useLive('holdings-updated', () => load(false))

  if (loading) return <div style={{ padding: 40, color: '#888', fontSize: 14 }}>Loading portfolio…</div>
  if (!analytics) return <div style={{ padding: 40, color: '#dc2626' }}>Failed to load data.</div>

  const a = analytics
  const fmtCAD = (v: number) => v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
  const fmtPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'

  const topHoldings = [...a.holdings].sort((x, y) => y.weightPct - x.weightPct).slice(0, 6)

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
              TFSA — {a.holdings.length} holdings
            </p>
            <LiveStatus />
          </div>
        </div>
        <PriceRefresher onRefresh={() => load(false)} />
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <div className="metric-card">
          <div className="metric-label">Portfolio Value</div>
          <div className="metric-value">{fmtCAD(a.totalValueCAD)}</div>
          <div className={`metric-sub ${a.totalReturnCAD >= 0 ? 'up' : 'down'}`}>
            {fmtCAD(Math.abs(a.totalReturnCAD))} ({fmtPct(a.totalReturnPct)}) total
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Book Cost</div>
          <div className="metric-value">{fmtCAD(a.totalCostCAD)}</div>
          <div className="metric-sub flat">Total invested (CAD)</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Quality Score</div>
          <div className="metric-value">{a.qualityScore}<span style={{ fontSize: 14, color: '#888', fontWeight: 400 }}> / 100</span></div>
          <div className="metric-sub flat">Diversification: {a.diversificationScore}/10</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg Conviction</div>
          <div className="metric-value">{a.avgConviction.toFixed(1)}<span style={{ fontSize: 14, color: '#888', fontWeight: 400 }}> / 10</span></div>
          <div className="metric-sub flat">HHI: {a.hhi.toFixed(3)}</div>
        </div>
      </div>

      {/* Data-source freshness */}
      <DataHealth />

      {/* Morning brief — the analyst layer */}
      <MorningBrief />

      {/* Wealth goal tracker */}
      <GoalTracker />

      {/* Portfolio value over time */}
      <PortfolioValueChart />

      {/* Cash + recent activity */}
      <CashAndActivity />

      {/* Quality score breakdown */}
      {a.qualityBreakdown && <QualityBreakdown data={a.qualityBreakdown} />}

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 16 }}>Allocation by bucket</div>
          <AllocationChart data={a.bucketAllocation} colors={['#3b6fd4', '#60a5fa', '#93c5fd']} />
        </div>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 16 }}>Allocation by theme</div>
          <AllocationChart data={a.themeAllocation} colors={['#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899']} />
        </div>
      </div>

      {/* Top holdings */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 16 }}>Top holdings by weight</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticker</th><th>Name</th><th>Weight</th><th>Target</th><th>G / L</th><th>Conviction</th><th>Bucket</th>
            </tr>
          </thead>
          <tbody>
            {topHoldings.map((h) => {
              const delta = h.weightPct - h.targetPct
              const bucketColor = h.bucket === 'Core' ? 'badge-blue' : h.bucket === 'Tactical' ? 'badge-amber' : 'badge-purple'
              return (
                <tr key={h.ticker}>
                  <td><span className="ticker-chip">{h.ticker}</span></td>
                  <td style={{ color: '#555' }}>{h.name.length > 28 ? h.name.slice(0, 28) + '…' : h.name}</td>
                  <td style={{ fontWeight: 600 }}>{h.weightPct.toFixed(1)}%</td>
                  <td style={{ color: '#888' }}>{h.targetPct}%</td>
                  <td className={h.glPct >= 0 ? 'up' : 'down'} style={{ fontWeight: 500 }}>
                    {h.glPct >= 0 ? '+' : ''}{h.glPct.toFixed(1)}%
                  </td>
                  <td>{h.conviction}/10</td>
                  <td><span className={`badge ${bucketColor}`}>{h.bucket}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <a href="/holdings" className="btn btn-sm">View all {a.holdings.length} holdings →</a>
        </div>
      </div>

      {/* Quality metrics */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 16 }}>Portfolio quality metrics</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            {[
              { label: 'Concentration (HHI)', value: a.hhi > 0.15 ? '⚠ ' + a.hhi.toFixed(3) + ' — High' : a.hhi.toFixed(3) + ' — Moderate', bad: a.hhi > 0.15 },
              { label: 'Diversification score', value: a.diversificationScore + ' / 10', bad: false },
              { label: 'Avg conviction', value: a.avgConviction.toFixed(1) + ' / 10', bad: false },
              { label: 'Holdings above target weight', value: a.holdings.filter(h => h.weightPct > h.targetPct).length + ' of ' + a.holdings.length, bad: false },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                <span style={{ color: '#666' }}>{row.label}</span>
                <span style={{ fontWeight: 600, color: row.bad ? '#dc2626' : '#1a1a1a' }}>{row.value}</span>
              </div>
            ))}
          </div>
          <div>
            {[
              { label: 'Total unrealized G/L', value: fmtCAD(a.totalReturnCAD), good: a.totalReturnCAD >= 0 },
              { label: 'Total return %', value: fmtPct(a.totalReturnPct), good: a.totalReturnPct >= 0 },
              { label: 'Largest position', value: [...a.holdings].sort((x,y)=>y.weightPct-x.weightPct)[0]?.ticker ?? '—', good: true },
              { label: 'Portfolio quality score', value: a.qualityScore + ' / 100', good: a.qualityScore >= 70 },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                <span style={{ color: '#666' }}>{row.label}</span>
                <span style={{ fontWeight: 600, color: row.good ? '#1a1a1a' : '#dc2626' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
