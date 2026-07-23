'use client'
import { useEffect, useState } from 'react'
import type { HoldingWithWeight } from '@/lib/types'

const USD_CAD = 1.39

export default function RebalancingPage() {
  const [holdings, setHoldings] = useState<HoldingWithWeight[]>([])
  const [loading, setLoading] = useState(true)
  const [cash, setCash] = useState(5000)
  const [model, setModel] = useState('buy-only')

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((data) => { setHoldings(data.holdings ?? []); setLoading(false) })
  }, [])

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading portfolio…</div>

  const totalValueCAD = holdings.reduce((s, h) => s + h.marketValue * (h.marketValueCurrency === 'USD' ? USD_CAD : 1), 0)
  const newTotal = totalValueCAD + cash

  // Compute trades
  const trades: { ticker: string; action: string; amount: number; reason: string }[] = []

  for (const h of holdings) {
    const valueCAD = h.marketValue * (h.marketValueCurrency === 'USD' ? USD_CAD : 1)
    const curWeight = (valueCAD / totalValueCAD) * 100
    const targetWeight = h.targetPct
    if (targetWeight === 0) continue

    if (model === 'full-rebalance' || model === 'trim-only') {
      if (curWeight - targetWeight > 3) {
        const trimCAD = ((curWeight - targetWeight) / 100) * totalValueCAD
        trades.push({ ticker: h.ticker, action: 'SELL', amount: trimCAD, reason: `${(curWeight - targetWeight).toFixed(1)}% overweight` })
      }
    }
    if (model === 'buy-only' || model === 'full-rebalance') {
      if (targetWeight - curWeight > 1.5) {
        const targetValCAD = (targetWeight / 100) * newTotal
        const currentValCAD = valueCAD
        const buyCAD = Math.min(targetValCAD - currentValCAD, cash * (targetWeight / 100))
        if (buyCAD > 50) {
          trades.push({ ticker: h.ticker, action: 'BUY', amount: buyCAD, reason: `${(targetWeight - curWeight).toFixed(1)}% underweight` })
        }
      }
    }
  }

  const totalBuy = trades.filter(t => t.action === 'BUY').reduce((s, t) => s + t.amount, 0)
  const totalSell = trades.filter(t => t.action === 'SELL').reduce((s, t) => s + t.amount, 0)

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Rebalancing Simulator</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Model scenario trades before executing in Wealthsimple</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, marginBottom: 16 }}>
        {/* Inputs */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 16 }}>Scenario inputs</div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>New cash to deploy (CAD $)</label>
            <input type="number" style={{ width: '100%' }} value={cash} onChange={(e) => setCash(Number(e.target.value))} min={0} step={500} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Rebalance model</label>
            <select style={{ width: '100%' }} value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="buy-only">Buy-only (add cash to underweight)</option>
              <option value="full-rebalance">Full rebalance (buy + trim)</option>
              <option value="trim-only">Trim overweight only</option>
            </select>
          </div>
          <div style={{ background: '#f8f9ff', borderRadius: 8, padding: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#888' }}>Current value</span>
              <span style={{ fontWeight: 600 }}>C${totalValueCAD.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: '#888' }}>New cash</span>
              <span style={{ fontWeight: 600, color: '#16a34a' }}>+C${cash.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e0e7ff', paddingTop: 6 }}>
              <span style={{ color: '#888' }}>New total</span>
              <span style={{ fontWeight: 700 }}>C${newTotal.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
            </div>
          </div>
        </div>

        {/* Suggested trades */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 16 }}>Suggested trades</div>
          {trades.length === 0 ? (
            <div style={{ color: '#888', fontSize: 13, padding: '20px 0' }}>No trades required — portfolio is within target weights.</div>
          ) : (
            <>
              {trades.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                  <span className={`badge ${t.action === 'BUY' ? 'badge-green' : 'badge-red'}`}>{t.action}</span>
                  <span className="ticker-chip">{t.ticker}</span>
                  <span style={{ color: '#555' }}>{t.reason}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600 }}>C${t.amount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '10px 0', borderTop: '1px solid #e5e5e5', display: 'flex', gap: 20, fontSize: 13 }}>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>Total buys: C${totalBuy.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
                <span style={{ color: '#dc2626', fontWeight: 600 }}>Total sells: C${totalSell.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Before vs after table */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 16 }}>Current vs target allocation</div>
        <table className="data-table">
          <thead><tr><th>Ticker</th><th>Name</th><th>Current weight</th><th>Target weight</th><th>Delta</th><th>Status</th></tr></thead>
          <tbody>
            {[...holdings].sort((a, b) => b.weightPct - a.weightPct).filter(h => h.targetPct > 0).map((h) => {
              const delta = h.weightPct - h.targetPct
              const status = Math.abs(delta) < 1.5 ? 'ON TARGET' : delta > 0 ? 'OVERWEIGHT' : 'UNDERWEIGHT'
              const statusClass = status === 'ON TARGET' ? 'badge-green' : status === 'OVERWEIGHT' ? 'badge-amber' : 'badge-blue'
              return (
                <tr key={h.ticker}>
                  <td><span className="ticker-chip">{h.ticker}</span></td>
                  <td style={{ color: '#555' }}>{h.name.length > 24 ? h.name.slice(0,24)+'…' : h.name}</td>
                  <td style={{ fontWeight: 600 }}>{h.weightPct.toFixed(1)}%</td>
                  <td style={{ color: '#888' }}>{h.targetPct}%</td>
                  <td className={delta > 1.5 ? 'down' : delta < -1.5 ? 'up' : 'flat'} style={{ fontWeight: 500 }}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                  </td>
                  <td><span className={`badge ${statusClass}`}>{status}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
