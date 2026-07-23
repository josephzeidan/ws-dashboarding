'use client'
import { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface Projection {
  targetAmount: number
  targetDate: string
  monthlyContribution: number
  assumedCagrPct: number
  currentValue: number
  monthsRemaining: number
  projectedValue: number
  onTrack: boolean
  shortfall: number
  requiredCagrPct: number
  requiredMonthly: number
  curve: { month: number; projected: number; contributions: number }[]
}

const fmt = (v: number) => v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })

export default function GoalTracker() {
  const [p, setP] = useState<Projection | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ targetAmount: '', targetDate: '', monthlyContribution: '', assumedCagrPct: '' })

  const load = useCallback(async () => {
    const res = await fetch('/api/goal')
    const d = await res.json()
    if (!d.error) {
      setP(d)
      setForm({
        targetAmount: String(d.targetAmount),
        targetDate: d.targetDate,
        monthlyContribution: String(d.monthlyContribution),
        assumedCagrPct: String(d.assumedCagrPct),
      })
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    const res = await fetch('/api/goal', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetAmount: Number(form.targetAmount),
        targetDate: form.targetDate,
        monthlyContribution: Number(form.monthlyContribution),
        assumedCagrPct: Number(form.assumedCagrPct),
      }),
    })
    const d = await res.json()
    if (!d.error) setP(d)
    setEditing(false)
  }

  if (!p) return null

  const years = Math.round((p.monthsRemaining / 12) * 10) / 10
  const pct = Math.min(100, Math.round((p.currentValue / p.targetAmount) * 100))
  const chartData = p.curve.map((c) => ({ year: Math.round((c.month / 12) * 10) / 10, projected: c.projected, contributions: c.contributions }))
  const input: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #ddd', fontSize: 13, marginTop: 4 }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>🎯 Goal — {fmt(p.targetAmount)} by {p.targetDate.slice(0, 4)}</div>
        <button className="btn btn-sm" onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Edit goal'}</button>
      </div>

      {editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: '#888' }}>Target ($)<input style={input} value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: '#888' }}>Target date<input type="date" style={input} value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: '#888' }}>Monthly ($)<input style={input} value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} /></label>
          <label style={{ fontSize: 11, color: '#888' }}>Assumed CAGR (%)<input style={input} value={form.assumedCagrPct} onChange={(e) => setForm({ ...form, assumedCagrPct: e.target.value })} /></label>
          <button className="btn btn-primary btn-sm" style={{ gridColumn: '1 / -1' }} onClick={save}>Save</button>
        </div>
      ) : (
        <>
          {/* Status line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: p.onTrack ? '#10b981' : '#f59e0b', borderRadius: 6, padding: '3px 12px' }}>
              {p.onTrack ? 'ON TRACK' : 'BEHIND PLAN'}
            </span>
            <span style={{ fontSize: 12.5, color: '#555' }}>
              Now {fmt(p.currentValue)} · projected {fmt(p.projectedValue)} in {years}y at {p.assumedCagrPct}% + {fmt(p.monthlyContribution)}/mo
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: p.onTrack ? '#10b981' : '#f59e0b' }} />
          </div>

          {/* Projection chart */}
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="goalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b6fd4" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#3b6fd4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}y`} />
              <YAxis tick={{ fontSize: 10, fill: '#aaa' }} width={52} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v: number, n) => [fmt(v), n === 'projected' ? 'Projected (compounding)' : 'Contributions only']} labelFormatter={(y) => `Year ${y}`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine y={p.targetAmount} stroke="#10b981" strokeDasharray="4 3" label={{ value: 'target', fontSize: 10, fill: '#10b981', position: 'insideTopRight' }} />
              <Area type="monotone" dataKey="projected" stroke="#3b6fd4" strokeWidth={2} fill="url(#goalFill)" />
              <Line type="monotone" dataKey="contributions" stroke="#bbb" strokeWidth={1.2} strokeDasharray="4 3" dot={false} />
            </AreaChart>
          </ResponsiveContainer>

          {/* Guidance */}
          <div style={{ background: p.onTrack ? '#e8f7f0' : '#fffbeb', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: p.onTrack ? '#1a6645' : '#78350f', lineHeight: 1.55, marginTop: 6 }}>
            {p.onTrack ? (
              <>You're on pace to reach {fmt(p.targetAmount)} — projected {fmt(p.shortfall)} <strong>ahead</strong> of target. Keep contributing {fmt(p.monthlyContribution)}/mo.</>
            ) : (
              <>At the current plan you'd finish {fmt(-p.shortfall)} <strong>short</strong>. To close the gap: contribute <strong>{fmt(p.requiredMonthly)}/mo</strong> at {p.assumedCagrPct}%, or you'd need a <strong>{p.requiredCagrPct}%</strong> return at {fmt(p.monthlyContribution)}/mo.</>
            )}
          </div>
        </>
      )}
    </div>
  )
}
