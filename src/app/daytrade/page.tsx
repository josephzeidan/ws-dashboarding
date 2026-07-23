'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface Vote { key: string; label: string; weight: number; vote: number; note: string }
interface Analysis {
  state: 'RANGE_FORMING' | 'ACTIVE' | 'CLOSED'
  sessionDate: string
  price: number
  openingRange: { high: number; low: number; widthPct: number } | null
  vwap: number | null
  priorClose: number | null
  gapPct: number | null
  votes: Vote[]
  aggregate: number
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: number
  chopPenalty: number
  series: { minutes: number; close: number; vwap: number }[]
}
interface Trade {
  kind: string
  reason?: string
  expiry?: string
  dte?: number
  longStrike?: number
  shortStrike?: number
  netDebit?: number
  maxRiskPerContract?: number
  maxProfitPerContract?: number
  breakeven?: number
  riskReward?: number
  note?: string
}
interface SystemStats { label: string; trades: number; wins: number; winRate: number; avgPct: number; cumPct: number; bestPct: number; worstPct: number; records: any[] }
interface Backtest { sessions: number; from: string; to: string; ensemble: SystemStats; originalRule: SystemStats }
interface CalibBucket { label: string; signals: number; wins: number; hitRate: number | null; avgPct: number | null }
interface Calibration { sessions: number; from: string; to: string; buckets: CalibBucket[]; neutralDays: number }

const DIR_COLOR = { BULLISH: '#10b981', BEARISH: '#ef4444', NEUTRAL: '#9ca3af' }

function minutesToLabel(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(mm).padStart(2, '0')}`
}

export default function DayTradePage() {
  const [data, setData] = useState<{ analysis: Analysis; trade: Trade; avgDailyRangePct: number; history: any[] } | null>(null)
  const [backtest, setBacktest] = useState<Backtest | null>(null)
  const [calib, setCalib] = useState<Calibration | null>(null)
  const [loading, setLoading] = useState(true)
  const [btLoading, setBtLoading] = useState(false)
  const [calLoading, setCalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/daytrade')
      const d = await res.json()
      if (d.error) setError(d.error)
      else { setData(d); setError(null) }
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, 60_000) // refresh every minute while open
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [load])

  async function runBacktest() {
    setBtLoading(true)
    try {
      const res = await fetch('/api/daytrade/backtest')
      const d = await res.json()
      if (!d.error) setBacktest(d)
    } finally {
      setBtLoading(false)
    }
  }

  async function runCalibration() {
    setCalLoading(true)
    try {
      const res = await fetch('/api/daytrade/calibration')
      const d = await res.json()
      if (!d.error) setCalib(d)
    } finally {
      setCalLoading(false)
    }
  }

  const a = data?.analysis
  const trade = data?.trade
  const isSpread = trade && trade.kind !== 'NO_TRADE'

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>SPY Day Trade</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          Live opening-range ensemble → direction, confidence, and the safest defined-risk expression of the view
        </p>
      </div>

      {/* Risk / tax banner */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#78350f', marginBottom: 16, lineHeight: 1.5 }}>
        <strong>Decision support, not advice — and not for your TFSA.</strong> Frequent day trading inside a TFSA can be taxed by the CRA as business income.
        Execute day trades (if at all) in a non-registered account, size so a full loss of the debit is acceptable, and expect most days to be NO TRADE.
      </div>

      {loading && <div style={{ padding: 40, color: '#888', fontSize: 14 }}>Analyzing today's session…</div>}
      {error && <div className="card" style={{ padding: 16, background: '#fdeaea', color: '#8b2020', fontSize: 13 }}>{error}</div>}

      {a && (
        <>
          {/* Verdict row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                {a.sessionDate} · {a.state === 'RANGE_FORMING' ? 'opening range forming (before 10:00 ET)' : a.state === 'ACTIVE' ? 'live session' : 'session closed'}
              </div>
              <span style={{ display: 'inline-block', fontSize: 17, fontWeight: 800, color: '#fff', background: DIR_COLOR[a.direction], borderRadius: 10, padding: '7px 22px' }}>
                {a.direction}
              </span>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 34, fontWeight: 800, color: DIR_COLOR[a.direction] }}>{a.confidence}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>confidence / 100{a.chopPenalty > 0 ? ` (chop penalty −${a.chopPenalty})` : ''}</div>
              </div>
              <div style={{ fontSize: 13, color: '#555', marginTop: 10 }}>
                SPY <strong>${a.price}</strong>
                {a.vwap != null && <> · VWAP ${a.vwap}</>}
                {a.gapPct != null && <> · gap {a.gapPct > 0 ? '+' : ''}{a.gapPct}%</>}
              </div>
            </div>

            {/* Intraday chart */}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>
                Intraday — price vs VWAP{a.openingRange ? ` · opening range ${a.openingRange.low}–${a.openingRange.high} (${a.openingRange.widthPct}%)` : ''}
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={a.series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="minutes" tick={{ fontSize: 10, fill: '#aaa' }} tickFormatter={minutesToLabel} minTickGap={50} axisLine={false} tickLine={false} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#aaa' }} width={52} axisLine={false} tickLine={false} />
                  <Tooltip labelFormatter={(m) => `${minutesToLabel(Number(m))} ET`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  {a.openingRange && <ReferenceLine y={a.openingRange.high} stroke="#10b981" strokeDasharray="4 3" label={{ value: 'OR high', fontSize: 10, fill: '#10b981', position: 'insideTopRight' }} />}
                  {a.openingRange && <ReferenceLine y={a.openingRange.low} stroke="#ef4444" strokeDasharray="4 3" label={{ value: 'OR low', fontSize: 10, fill: '#ef4444', position: 'insideBottomRight' }} />}
                  {a.priorClose != null && <ReferenceLine y={a.priorClose} stroke="#bbb" strokeDasharray="2 4" label={{ value: 'prior close', fontSize: 10, fill: '#999', position: 'insideLeft' }} />}
                  <Line type="monotone" dataKey="close" stroke="#2d5cbe" strokeWidth={1.8} dot={false} name="SPY" />
                  <Line type="monotone" dataKey="vwap" stroke="#f59e0b" strokeWidth={1.4} strokeDasharray="5 3" dot={false} name="VWAP" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Signal votes */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 10 }}>Signal votes (weighted ensemble)</div>
            {a.votes.length === 0 ? (
              <div style={{ fontSize: 13, color: '#999' }}>Votes appear once the opening range completes at 10:00 ET.</div>
            ) : (
              a.votes.map((v) => (
                <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ width: 220, fontSize: 12.5, color: '#444' }}>{v.label}</span>
                  <div style={{ flex: 1, height: 10, background: '#f0f0f0', borderRadius: 5, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#ddd' }} />
                    <div
                      style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: v.vote >= 0 ? '50%' : `${50 + v.vote * 50}%`,
                        width: `${Math.abs(v.vote) * 50}%`,
                        background: v.vote >= 0 ? '#10b981' : '#ef4444',
                      }}
                    />
                  </div>
                  <span style={{ width: 46, textAlign: 'right', fontSize: 12, fontWeight: 700, color: v.vote > 0.05 ? '#10b981' : v.vote < -0.05 ? '#ef4444' : '#999' }}>
                    {v.vote > 0 ? '+' : ''}{v.vote}
                  </span>
                  <span style={{ width: 40, fontSize: 11, color: '#aaa', textAlign: 'right' }}>w {Math.round(v.weight * 100)}%</span>
                </div>
              ))
            )}
            {a.votes.length > 0 && (
              <div style={{ fontSize: 11.5, color: '#888', marginTop: 10, lineHeight: 1.6 }}>
                {a.votes.map((v) => <div key={v.key}>• <strong>{v.label}:</strong> {v.note}</div>)}
              </div>
            )}
          </div>

          {/* Trade card */}
          <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${isSpread ? DIR_COLOR[a.direction] : '#9ca3af'}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {isSpread ? '🎯 Safest trade for the view' : '🛑 No trade today'}
            </div>
            {isSpread ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                  {trade!.kind === 'BULL_CALL_SPREAD' ? 'Bull call spread' : 'Bear put spread'} — SPY {trade!.expiry} ({trade!.dte} DTE):{' '}
                  {trade!.kind === 'BULL_CALL_SPREAD'
                    ? <>buy {trade!.longStrike} call / sell {trade!.shortStrike} call</>
                    : <>buy {trade!.longStrike} put / sell {trade!.shortStrike} put</>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 10 }}>
                  <Metric label="Net debit" value={`$${trade!.netDebit}`} />
                  <Metric label="Max risk / contract" value={`$${trade!.maxRiskPerContract}`} />
                  <Metric label="Max profit / contract" value={`$${trade!.maxProfitPerContract}`} />
                  <Metric label="Breakeven" value={`$${trade!.breakeven}`} />
                  <Metric label="Reward : risk" value={`${trade!.riskReward} : 1`} />
                </div>
                <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{trade!.note} Priced off mid quotes — confirm live fills before entering.</div>
              </>
            ) : (
              <div style={{ fontSize: 13.5, color: '#444', lineHeight: 1.6 }}>{trade?.reason}</div>
            )}
          </div>

          {/* Backtest */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>Evidence — 60-session backtest (5-min bars)</div>
              <button className="btn btn-sm" onClick={runBacktest} disabled={btLoading}>{btLoading ? 'Running…' : backtest ? '↻ Re-run' : 'Run backtest'}</button>
            </div>
            {!backtest ? (
              <div style={{ fontSize: 12.5, color: '#999' }}>Runs both the ensemble and your original 10am rule on the same 60 sessions so you can compare them with data, not opinions.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{backtest.sessions} sessions · {backtest.from} → {backtest.to} · SPY shares, no costs</div>
                <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#888', textAlign: 'right' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0' }}>System</th>
                      <th>Trades</th><th>Win rate</th><th>Avg / trade</th><th>Cumulative</th><th>Best</th><th>Worst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[backtest.ensemble, backtest.originalRule].map((s) => (
                      <tr key={s.label} style={{ borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '8px 0', color: '#333' }}>{s.label}</td>
                        <td>{s.trades}</td>
                        <td style={{ fontWeight: 700 }}>{s.winRate}%</td>
                        <td style={{ color: s.avgPct >= 0 ? '#10b981' : '#ef4444' }}>{s.avgPct > 0 ? '+' : ''}{s.avgPct}%</td>
                        <td style={{ color: s.cumPct >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{s.cumPct > 0 ? '+' : ''}{s.cumPct}%</td>
                        <td>+{s.bestPct}%</td>
                        <td style={{ color: '#ef4444' }}>{s.worstPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11.5, color: '#888', marginTop: 10, lineHeight: 1.5 }}>
                  Read this honestly: intraday edges on SPY are thin. The ensemble's value is selectivity (fewer, filtered trades) and a hard stop capping the worst day.
                  Sub-55-confidence days are deliberately NO TRADE.
                </div>
              </>
            )}
          </div>

          {/* Calibration */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>Calibration — what does the confidence number actually mean?</div>
              <button className="btn btn-sm" onClick={runCalibration} disabled={calLoading}>{calLoading ? 'Running…' : calib ? '↻ Re-run' : 'Run calibration'}</button>
            </div>
            {!calib ? (
              <div style={{ fontSize: 12.5, color: '#999' }}>
                Replays the ensemble at 10:35 ET on the last ~60 sessions and checks each call against that day's close — so you know the real hit rate behind each confidence level before trusting it.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
                  {calib.sessions} sessions · {calib.from} → {calib.to} · {calib.neutralDays} days the model stood aside (NEUTRAL)
                </div>
                {calib.buckets.map((b) => (
                  <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12.5 }}>
                    <span style={{ width: 210, color: '#444' }}>{b.label}</span>
                    <div style={{ flex: 1, height: 9, background: '#f0f0f0', borderRadius: 5, overflow: 'hidden' }}>
                      {b.hitRate != null && <div style={{ width: `${b.hitRate}%`, height: '100%', background: b.hitRate >= 55 ? '#10b981' : b.hitRate >= 45 ? '#f59e0b' : '#ef4444' }} />}
                    </div>
                    <span style={{ width: 120, textAlign: 'right', fontWeight: 700, color: '#333' }}>
                      {b.hitRate != null ? `${b.hitRate}% (${b.wins}/${b.signals})` : 'no samples'}
                    </span>
                    <span style={{ width: 90, textAlign: 'right', color: b.avgPct != null && b.avgPct >= 0 ? '#10b981' : '#ef4444' }}>
                      {b.avgPct != null ? `${b.avgPct > 0 ? '+' : ''}${b.avgPct}%/trade` : '—'}
                    </span>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: '#888', marginTop: 8 }}>
                  If higher buckets don't show higher hit rates, treat the confidence number skeptically — that's the whole point of showing this.
                </div>
              </>
            )}
          </div>

          {/* Signal history */}
          {data!.history.length > 0 && (
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>Signal log — graded against the close</div>
              {data!.history.map((h) => (
                <div key={h.session} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12.5 }}>
                  <span style={{ width: 90, color: '#888' }}>{h.session}</span>
                  <span style={{ fontWeight: 700, color: DIR_COLOR[h.direction as keyof typeof DIR_COLOR] ?? '#999', width: 70 }}>{h.direction}</span>
                  <span style={{ color: '#555', width: 100 }}>confidence {h.confidence}</span>
                  {h.outcome && h.outcome !== '' && (
                    <span style={{ fontWeight: 700, fontSize: 11, borderRadius: 4, padding: '2px 8px', color: '#fff', background: h.outcome === 'WIN' ? '#10b981' : h.outcome === 'LOSS' ? '#ef4444' : '#9ca3af' }}>
                      {h.outcome}{h.outcomePct != null ? ` ${h.outcomePct > 0 ? '+' : ''}${h.outcomePct}%` : ''}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', color: '#888' }}>SPY ${h.price}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#fafafa', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10.5, color: '#999', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  )
}
