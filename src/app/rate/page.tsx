'use client'
import { useEffect, useState } from 'react'

interface ScoreRow {
  ticker: string
  score: number
  verdict: string
  ratedAt: string
  priceAtRating: number | null
  priceNow: number | null
  sincePct: number | null
  grade: 'RIGHT' | 'WRONG' | 'OPEN'
}

interface RatingResult {
  ticker: string
  score: number
  verdict: 'BUY' | 'HOLD' | 'SELL'
  subScores: { technicals: number | null; fundamentals: number | null; analyst: number | null; social: number | null }
  weights: Record<string, number>
  signals: any
  rationale: string
  aiAvailable: boolean
  ratedAt: string
}

const VERDICT_COLOR = { BUY: '#10b981', HOLD: '#f59e0b', SELL: '#ef4444' }
const SUB_LABEL: Record<string, string> = { technicals: 'Technicals', fundamentals: 'Fundamentals', analyst: 'Analyst consensus', social: 'Reddit sentiment' }

function scoreColor(v: number) {
  if (v >= 6.5) return '#10b981'
  if (v <= 4) return '#ef4444'
  return '#f59e0b'
}

function SubScoreBar({ k, v }: { k: string; v: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
      <span style={{ width: 130, fontSize: 12.5, color: '#555' }}>{SUB_LABEL[k]}</span>
      <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
        {v != null && <div style={{ width: `${(v / 10) * 100}%`, height: '100%', background: scoreColor(v) }} />}
      </div>
      <span style={{ width: 60, textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: v != null ? '#1a1a1a' : '#bbb' }}>
        {v != null ? `${v}/10` : 'n/a'}
      </span>
    </div>
  )
}

export default function RatePage() {
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RatingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scoreboard, setScoreboard] = useState<ScoreRow[]>([])

  useEffect(() => {
    fetch('/api/rate').then((r) => r.json()).then((d) => setScoreboard(d.scoreboard ?? [])).catch(() => {})
  }, [result]) // refresh after each new rating

  async function rate(e?: React.FormEvent) {
    e?.preventDefault()
    if (!ticker.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim() }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setResult(data)
    } catch {
      setError('Network error — is the app still running?')
    }
    setLoading(false)
  }

  const t = result?.signals?.technicals
  const a = result?.signals?.analyst
  const f = result?.signals?.fundamentals
  const s = result?.signals?.social

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Rate a Stock</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          A 1–10 buy/sell/hold read blending technicals, analyst consensus, fundamentals, and Reddit sentiment
        </p>
      </div>

      <form onSubmit={rate} className="card" style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Enter a ticker, e.g. NVDA"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, letterSpacing: '0.03em' }}
          autoFocus
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Analyzing…' : 'Rate it'}
        </button>
      </form>

      {loading && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>
          Pulling price history, analyst data, fundamentals, and Reddit chatter…
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: 16, background: '#fdeaea', color: '#8b2020', fontSize: 13 }}>{error}</div>
      )}

      {result && (
        <>
          {/* Verdict header */}
          <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ textAlign: 'center', minWidth: 110 }}>
              <div style={{ fontSize: 44, fontWeight: 800, color: scoreColor(result.score), lineHeight: 1 }}>{result.score}</div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>/ 10</div>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ display: 'inline-block', fontSize: 15, fontWeight: 700, color: '#fff', background: VERDICT_COLOR[result.verdict], borderRadius: 8, padding: '5px 16px', marginBottom: 8 }}>
                {result.verdict}
              </span>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{result.ticker}{f?.name ? <span style={{ fontSize: 13, color: '#888', fontWeight: 400 }}> · {f.name}</span> : null}</div>
            </div>
          </div>

          {/* Sub-scores */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>Signal breakdown</div>
            {(['technicals', 'analyst', 'fundamentals', 'social'] as const).map((k) => (
              <SubScoreBar key={k} k={k} v={result.subScores[k]} />
            ))}
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
              Composite weights available signals: {Object.entries(result.weights).map(([k, w]) => `${SUB_LABEL[k]} ${Math.round(w * 100)}%`).join(' · ') || 'none'}
            </div>
          </div>

          {/* Rationale */}
          <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${scoreColor(result.score)}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              {result.aiAvailable && result.rationale && !result.rationale.startsWith(result.ticker + ' scores') ? '🤖 AI analysis' : '📋 Signal summary'}
            </div>
            <div style={{ fontSize: 13.5, color: '#333', lineHeight: 1.6 }}>{result.rationale}</div>
            {!result.aiAvailable && (
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>Add Anthropic API credits to get a written AI verdict on top of the numeric signals.</div>
            )}
          </div>

          {/* Detail grids */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {t && (
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 10 }}>Technicals</div>
                <Row label="Price" value={`$${t.price}`} />
                <Row label="vs 50-day MA" value={t.ma50 != null ? `${t.aboveMa50 ? 'above' : 'below'} ($${t.ma50})` : 'n/a'} good={t.aboveMa50} />
                <Row label="vs 200-day MA" value={t.ma200 != null ? `${t.aboveMa200 ? 'above' : 'below'} ($${t.ma200})` : 'n/a'} good={t.aboveMa200} />
                <Row label="1-month momentum" value={t.momentum1mPct != null ? `${t.momentum1mPct > 0 ? '+' : ''}${t.momentum1mPct}%` : 'n/a'} good={t.momentum1mPct != null ? t.momentum1mPct > 0 : null} />
                <Row label="52-week range" value={t.rangePctile != null ? `${t.rangePctile}% up ($${t.low52}–$${t.high52})` : 'n/a'} />
              </div>
            )}
            {a && result.subScores.analyst != null && (
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 10 }}>Analyst consensus</div>
                <Row label="Recommendation" value={a.recommendationKey ?? 'n/a'} />
                <Row label="Mean rating" value={a.recommendationMean != null ? `${a.recommendationMean} (1=buy, 5=sell)` : 'n/a'} />
                <Row label="Mean target" value={a.targetMean != null ? `$${a.targetMean}` : 'n/a'} />
                <Row label="Implied upside" value={a.upsidePct != null ? `${a.upsidePct > 0 ? '+' : ''}${a.upsidePct}%` : 'n/a'} good={a.upsidePct != null ? a.upsidePct > 0 : null} />
                <Row label="Analysts" value={a.numberOfAnalysts ?? 'n/a'} />
              </div>
            )}
            {f && result.subScores.fundamentals != null && (
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 10 }}>Fundamentals</div>
                <Row label="Revenue growth" value={f.revenueGrowth != null ? `${Math.round(f.revenueGrowth * 100)}%` : 'n/a'} good={f.revenueGrowth != null ? f.revenueGrowth > 0 : null} />
                <Row label="Profit margin" value={f.profitMargin != null ? `${Math.round(f.profitMargin * 100)}%` : 'n/a'} good={f.profitMargin != null ? f.profitMargin > 0 : null} />
                <Row label="Return on equity" value={f.returnOnEquity != null ? `${Math.round(f.returnOnEquity * 100)}%` : 'n/a'} />
                <Row label="P/E (fwd)" value={f.peForward != null ? `${Math.round(f.peForward)}` : f.peTrailing != null ? `${Math.round(f.peTrailing)} (ttm)` : 'n/a'} />
              </div>
            )}
            {s && result.subScores.social != null && (
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 10 }}>Reddit sentiment</div>
                <Row label="Posts (last month)" value={s.postCount} />
                <Row label="Avg sentiment" value={s.avgSentiment != null ? `${s.avgSentiment > 0 ? '+' : ''}${s.avgSentiment}` : 'n/a'} good={s.avgSentiment != null ? s.avgSentiment > 0 : null} />
                <Row label="Bullish / bearish" value={`${s.bullish} / ${s.bearish}`} />
                {s.topPosts?.slice(0, 3).map((p: any, i: number) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 11.5, color: '#2d5cbe', marginTop: 6, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ↗ {p.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Ratings scoreboard — grades past calls against live prices */}
      {scoreboard.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 4 }}>Scoreboard — how past ratings have aged</div>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            Every rating is graded against the live price so you can judge whether to trust the tool. Moves under ±1% stay OPEN.
          </div>
          {scoreboard.map((r) => (
            <div key={r.ticker} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12.5 }}>
              <span style={{ width: 60, fontWeight: 700 }}>{r.ticker}</span>
              <span style={{ width: 70, fontWeight: 700, color: r.verdict === 'BUY' ? '#10b981' : r.verdict === 'SELL' ? '#ef4444' : '#f59e0b' }}>
                {r.verdict} {r.score}
              </span>
              <span style={{ width: 100, color: '#888' }}>{new Date(r.ratedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</span>
              <span style={{ color: '#666' }}>
                {r.priceAtRating != null ? `$${r.priceAtRating}` : '—'} → {r.priceNow != null ? `$${r.priceNow}` : '—'}
              </span>
              <span style={{ marginLeft: 'auto', fontWeight: 600, color: r.sincePct != null && r.sincePct >= 0 ? '#10b981' : '#ef4444', width: 70, textAlign: 'right' }}>
                {r.sincePct != null ? `${r.sincePct > 0 ? '+' : ''}${r.sincePct}%` : '—'}
              </span>
              <span style={{ width: 62, textAlign: 'center', fontSize: 10.5, fontWeight: 700, borderRadius: 4, padding: '2px 0', color: '#fff', background: r.grade === 'RIGHT' ? '#10b981' : r.grade === 'WRONG' ? '#ef4444' : '#9ca3af' }}>
                {r.grade}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, good }: { label: string; value: React.ReactNode; good?: boolean | null }) {
  const color = good == null ? '#333' : good ? '#1a6645' : '#b23'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}
