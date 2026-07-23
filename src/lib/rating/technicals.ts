// Technical sub-score from Yahoo's keyless chart endpoint: trend (vs 50/200-day
// moving averages), momentum (1-month return), and where price sits in its
// 52-week range. Returns a 1–10 score plus the raw signals for display.

export interface TechnicalSignals {
  price: number
  ma50: number | null
  ma200: number | null
  aboveMa50: boolean | null
  aboveMa200: boolean | null
  momentum1mPct: number | null
  rangePctile: number | null // 0–100, position in 52-week range
  high52: number | null
  low52: number | null
}

export interface TechnicalResult {
  score: number | null // 1–10
  signals: TechnicalSignals | null
}

function yahooSymbol(ticker: string, exchange?: string): string {
  if (ticker.includes('.') || ticker.includes('=')) return ticker
  const ex = (exchange ?? '').toUpperCase()
  if (ex.includes('TSXV') || ex.includes('VENTURE')) return `${ticker}.V`
  if (ex.includes('TSX') || ex.includes('TORONTO') || ex.includes('NEO')) return `${ticker}.TO`
  return ticker
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

export async function getTechnicals(ticker: string, exchange?: string): Promise<TechnicalResult> {
  const symbol = yahooSymbol(ticker, exchange)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!res.ok) return { score: null, signals: null }
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    const closesRaw: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? []
    const closes = closesRaw.filter((c): c is number => typeof c === 'number')
    if (closes.length < 30) return { score: null, signals: null }

    const price = closes[closes.length - 1]
    const ma50 = closes.length >= 50 ? mean(closes.slice(-50)) : null
    const ma200 = closes.length >= 200 ? mean(closes.slice(-200)) : null
    const monthAgo = closes[Math.max(0, closes.length - 22)]
    const momentum1mPct = monthAgo ? ((price - monthAgo) / monthAgo) * 100 : null
    const high52 = Math.max(...closes)
    const low52 = Math.min(...closes)
    const rangePctile = high52 > low52 ? ((price - low52) / (high52 - low52)) * 100 : null

    // Build a 1–10 score. Start neutral at 5.5, nudge by signals.
    let score = 5.5
    if (ma50 != null) score += price > ma50 ? 1.0 : -1.0
    if (ma200 != null) score += price > ma200 ? 1.2 : -1.2
    if (momentum1mPct != null) score += Math.max(-1.5, Math.min(1.5, momentum1mPct / 8))
    if (rangePctile != null) {
      if (rangePctile > 92) score -= 0.6 // extended / overbought
      else if (rangePctile < 15) score -= 0.4 // deep downtrend
      else if (rangePctile >= 45 && rangePctile <= 80) score += 0.4 // healthy uptrend zone
    }
    score = Math.max(1, Math.min(10, Math.round(score * 10) / 10))

    return {
      score,
      signals: {
        price: Math.round(price * 100) / 100,
        ma50: ma50 != null ? Math.round(ma50 * 100) / 100 : null,
        ma200: ma200 != null ? Math.round(ma200 * 100) / 100 : null,
        aboveMa50: ma50 != null ? price > ma50 : null,
        aboveMa200: ma200 != null ? price > ma200 : null,
        momentum1mPct: momentum1mPct != null ? Math.round(momentum1mPct * 10) / 10 : null,
        rangePctile: rangePctile != null ? Math.round(rangePctile) : null,
        high52: Math.round(high52 * 100) / 100,
        low52: Math.round(low52 * 100) / 100,
      },
    }
  } catch {
    return { score: null, signals: null }
  }
}
