'use client'
import { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLive } from './LiveProvider'

interface Snapshot {
  totalCAD: number
  bookCostCAD: number
  takenAt: string
}

const RANGES = ['1D', '1W', '1M', '3M', 'ALL'] as const
type Range = (typeof RANGES)[number]

export default function PortfolioValueChart() {
  const [range, setRange] = useState<Range>('1M')
  const [data, setData] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/snapshots?range=${range}`)
    const json = await res.json()
    setData(json.snapshots ?? [])
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])
  useLive('snapshot', () => load())

  const fmtCAD = (v: number) => v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 })
  const chartData = data.map((s) => ({
    t: new Date(s.takenAt).getTime(),
    value: s.totalCAD,
    label:
      range === '1D'
        ? new Date(s.takenAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
        : new Date(s.takenAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
  }))

  const first = chartData[0]?.value
  const last = chartData[chartData.length - 1]?.value
  const delta = first != null && last != null ? last - first : 0
  const deltaPct = first ? (delta / first) * 100 : 0
  const up = delta >= 0
  const stroke = up ? '#10b981' : '#ef4444'

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>Portfolio value</div>
          {last != null && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{fmtCAD(last)}</span>
              {chartData.length > 1 && (
                <span style={{ fontSize: 13, color: stroke, fontWeight: 600 }}>
                  {up ? '+' : ''}{fmtCAD(delta)} ({up ? '+' : ''}{deltaPct.toFixed(2)}%) this {range === 'ALL' ? 'period' : range}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 9px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                background: range === r ? '#2d5cbe' : '#f2f2f2',
                color: range === r ? '#fff' : '#666',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13 }}>
          Loading…
        </div>
      ) : chartData.length < 2 ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
          Not enough history yet.<br />The value chart fills in as the app runs — snapshots are taken every ~15 minutes.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#aaa' }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: '#aaa' }}
              axisLine={false}
              tickLine={false}
              width={54}
              tickFormatter={(v) => fmtCAD(Number(v))}
            />
            <Tooltip
              formatter={(v: number) => [fmtCAD(v), 'Value']}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #eee' }}
            />
            <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill="url(#pvFill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
