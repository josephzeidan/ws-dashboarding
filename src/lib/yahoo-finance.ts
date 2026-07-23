export interface YahooPrice {
  ticker: string
  price: number
  currency: string
  name: string
  change: number
  changePct: number
  timestamp: string
}

export interface FetchOptions {
  /** Bypass the 5-min Next.js cache — used by the live poller. */
  noStore?: boolean
  /** Yahoo exchange suffix hint (e.g. "TSX" -> ".TO"), from Holding.exchange. */
  exchange?: string
}

// Yahoo Finance v8 API — no key required
const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const BASE2 = 'https://query2.finance.yahoo.com/v8/finance/chart'

// Map a WS/plain ticker + optional exchange to a Yahoo symbol.
// Canadian listings need a .TO (TSX) or .V (TSXV) suffix on Yahoo.
function toYahooSymbol(ticker: string, exchange?: string): string {
  if (ticker.includes('.') || ticker.includes('=')) return ticker // already qualified / FX pair
  const ex = (exchange ?? '').toUpperCase()
  if (ex.includes('TSXV') || ex.includes('VENTURE')) return `${ticker}.V`
  if (ex.includes('TSX') || ex.includes('TORONTO') || ex.includes('NEO') || ex.includes('AEQUITAS')) return `${ticker}.TO`
  if (!exchange && ticker === 'VFV') return 'VFV.TO' // legacy fallback
  return ticker
}

async function fetchSingle(ticker: string, opts: FetchOptions = {}, base = BASE): Promise<YahooPrice | null> {
  const symbol = toYahooSymbol(ticker, opts.exchange)
  const url = `${base}/${symbol}?interval=1d&range=1d`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      ...(opts.noStore ? { cache: 'no-store' as const } : { next: { revalidate: 300 } }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null
    const meta = result.meta
    const price = meta.regularMarketPrice ?? meta.previousClose ?? 0
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price
    const change = price - prevClose
    const changePct = prevClose ? (change / prevClose) * 100 : 0
    return {
      ticker,
      price: Math.round(price * 100) / 100,
      currency: meta.currency ?? 'USD',
      name: meta.shortName ?? ticker,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      timestamp: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`Failed to fetch price for ${ticker}:`, err)
    return null
  }
}

// Fallback to query2 if query1 fails
async function fetchWithFallback(ticker: string, opts: FetchOptions = {}): Promise<YahooPrice | null> {
  const result = await fetchSingle(ticker, opts, BASE)
  if (result) return result
  return fetchSingle(ticker, opts, BASE2)
}

export async function fetchPrices(
  tickers: string[],
  opts: FetchOptions = {},
  exchanges?: Record<string, string>
): Promise<YahooPrice[]> {
  const results = await Promise.allSettled(
    tickers.map((t) => fetchWithFallback(t, { ...opts, exchange: exchanges?.[t] ?? opts.exchange }))
  )
  return results
    .filter((r): r is PromiseFulfilledResult<YahooPrice> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
}

/** Live USD→CAD rate via Yahoo's FX pair. Returns null on failure. */
export async function fetchUsdCadRate(opts: FetchOptions = {}): Promise<number | null> {
  const q = await fetchSingle('USDCAD=X', { ...opts })
  return q && q.price > 0 ? q.price : null
}
