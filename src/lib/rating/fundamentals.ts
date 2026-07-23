// Fundamentals + analyst sub-scores from Yahoo's quoteSummary endpoint.
// Yahoo now gates this behind a cookie+crumb, so we fetch those first and
// degrade gracefully (null scores) if anything is unavailable.

export interface FundamentalSignals {
  peTrailing: number | null
  peForward: number | null
  profitMargin: number | null // fraction
  revenueGrowth: number | null // fraction
  returnOnEquity: number | null // fraction
  name: string | null
}

export interface AnalystSignals {
  recommendationKey: string | null
  recommendationMean: number | null // 1 (strong buy) – 5 (sell)
  targetMean: number | null
  currentPrice: number | null
  upsidePct: number | null
  numberOfAnalysts: number | null
}

export interface FundamentalResult {
  fundamentalScore: number | null
  analystScore: number | null
  fundamentals: FundamentalSignals | null
  analyst: AnalystSignals | null
}

let cachedCrumb: { crumb: string; cookie: string; at: number } | null = null

/** Yahoo cookie+crumb pair for gated endpoints (quoteSummary, options chain). */
export async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (cachedCrumb && Date.now() - cachedCrumb.at < 30 * 60_000) return cachedCrumb
  try {
    const seed = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    const setCookie: string[] =
      typeof (seed.headers as any).getSetCookie === 'function'
        ? (seed.headers as any).getSetCookie()
        : [seed.headers.get('set-cookie') ?? '']
    const cookie = setCookie.map((c) => c.split(';')[0]).filter(Boolean).join('; ')
    if (!cookie) return null
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookie },
      cache: 'no-store',
    })
    const crumb = (await crumbRes.text()).trim()
    if (!crumb || crumb.includes('<')) return null
    cachedCrumb = { crumb, cookie, at: Date.now() }
    return cachedCrumb
  } catch {
    return null
  }
}

function num(v: any): number | null {
  const n = typeof v === 'object' && v !== null ? v.raw : v
  return typeof n === 'number' && isFinite(n) ? n : null
}

export async function getFundamentals(ticker: string): Promise<FundamentalResult> {
  const empty: FundamentalResult = { fundamentalScore: null, analystScore: null, fundamentals: null, analyst: null }
  const cr = await getCrumb()
  if (!cr) return empty

  const modules = 'financialData,defaultKeyStatistics,summaryDetail,price,quoteType'
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    ticker
  )}?modules=${modules}&crumb=${encodeURIComponent(cr.crumb)}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cr.cookie }, cache: 'no-store' })
    if (!res.ok) return empty
    const data = await res.json()
    const r = data?.quoteSummary?.result?.[0]
    if (!r) return empty

    const fd = r.financialData ?? {}
    const ks = r.defaultKeyStatistics ?? {}
    const sd = r.summaryDetail ?? {}
    const price = r.price ?? {}

    const fundamentals: FundamentalSignals = {
      peTrailing: num(sd.trailingPE),
      peForward: num(sd.forwardPE) ?? num(ks.forwardPE),
      profitMargin: num(fd.profitMargins),
      revenueGrowth: num(fd.revenueGrowth),
      returnOnEquity: num(fd.returnOnEquity),
      name: price.shortName ?? price.longName ?? null,
    }

    const currentPrice = num(fd.currentPrice) ?? num(price.regularMarketPrice)
    const targetMean = num(fd.targetMeanPrice)
    const analyst: AnalystSignals = {
      recommendationKey: fd.recommendationKey ?? null,
      recommendationMean: num(fd.recommendationMean),
      targetMean,
      currentPrice,
      upsidePct: targetMean && currentPrice ? Math.round(((targetMean - currentPrice) / currentPrice) * 1000) / 10 : null,
      numberOfAnalysts: num(fd.numberOfAnalystOpinions),
    }

    return {
      fundamentals,
      analyst,
      fundamentalScore: scoreFundamentals(fundamentals),
      analystScore: scoreAnalyst(analyst),
    }
  } catch {
    return empty
  }
}

function scoreFundamentals(f: FundamentalSignals): number | null {
  let score = 5.5
  let used = false
  if (f.profitMargin != null) {
    used = true
    score += f.profitMargin > 0.2 ? 1.2 : f.profitMargin > 0.08 ? 0.5 : f.profitMargin > 0 ? 0 : -1.2
  }
  if (f.revenueGrowth != null) {
    used = true
    score += f.revenueGrowth > 0.25 ? 1.3 : f.revenueGrowth > 0.1 ? 0.7 : f.revenueGrowth > 0 ? 0.2 : -1.0
  }
  if (f.returnOnEquity != null) {
    used = true
    score += f.returnOnEquity > 0.2 ? 0.8 : f.returnOnEquity > 0.1 ? 0.3 : f.returnOnEquity < 0 ? -0.8 : 0
  }
  const pe = f.peForward ?? f.peTrailing
  if (pe != null && pe > 0) {
    used = true
    score += pe < 15 ? 0.8 : pe < 30 ? 0.2 : pe < 60 ? -0.4 : -1.0
  }
  if (!used) return null
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10))
}

function scoreAnalyst(a: AnalystSignals): number | null {
  let score: number | null = null
  // recommendationMean: 1 strong buy … 5 sell → map to 10 … 2
  if (a.recommendationMean != null) {
    score = 12 - a.recommendationMean * 2 // 1→10, 3→6, 5→2
  }
  if (a.upsidePct != null) {
    const upsideScore = 5.5 + Math.max(-3, Math.min(3, a.upsidePct / 12))
    score = score == null ? upsideScore : (score + upsideScore) / 2
  }
  if (score == null) return null
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10))
}
