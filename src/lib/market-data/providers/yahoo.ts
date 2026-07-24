// Yahoo Finance adapter (keyless). Handles the two things Yahoo doesn't give
// directly: a native 4h interval (resampled from 60m) and split/dividend
// adjustment of OHLC (Yahoo only adjusts `adjclose` on daily/weekly — we apply
// the ratio to O/H/L/C ourselves). Session filtering happens here so the 4h
// resample only ever buckets regular-hours bars.

import { Bar, GetBarsParams, MarketDataProvider, ProviderDownError, ProviderRateLimitError, SymbolMatch, Timeframe, UnknownSymbolError } from '../provider'
import { isIntraday, isRegularSession, resampleTo4h } from '../normalize'

// Timeframe → Yahoo interval string. 4h fetches 60m and resamples.
const YF_INTERVAL: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '60m', '4h': '60m', '1D': '1d', '1W': '1wk',
}

// Timeframe → Yahoo range string, sized to comfortably cover the largest lookback.
const YF_RANGE: Record<Timeframe, string> = {
  '1m': '7d', '5m': '60d', '15m': '60d', '30m': '60d',
  '1h': '730d', '4h': '730d', '1D': '5y', '1W': '10y',
}

function yahooSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

async function fetchChart(symbol: string, interval: string, range: string, includePrePost: boolean): Promise<any> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&range=${range}&includePrePost=${includePrePost}&events=div%2Csplit`
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
  } catch (err) {
    throw new ProviderDownError(`Yahoo unreachable: ${err instanceof Error ? err.message : err}`)
  }
  if (res.status === 429) throw new ProviderRateLimitError(30)
  if (res.status === 404) throw new UnknownSymbolError(symbol)
  if (!res.ok) throw new ProviderDownError(`Yahoo HTTP ${res.status}`)
  const data = await res.json()
  const result = data?.chart?.result?.[0]
  if (data?.chart?.error?.code === 'Not Found') throw new UnknownSymbolError(symbol)
  if (!result) throw new ProviderDownError('Yahoo returned no result')
  return result
}

/** Parse Yahoo result into adjusted, session-filtered bars for the interval. */
function parseBars(result: any, intraday: boolean, includeExtended: boolean): Bar[] {
  const ts: number[] = result.timestamp ?? []
  const q = result.indicators?.quote?.[0] ?? {}
  const adj: number[] | undefined = result.indicators?.adjclose?.[0]?.adjclose
  const bars: Bar[] = []
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i]
    if (o == null || h == null || l == null || c == null) continue
    const tMs = ts[i] * 1000
    if (intraday && !includeExtended && !isRegularSession(tMs)) continue
    // Split/div adjustment: scale OHLC by adjclose/close when available (daily/weekly).
    const factor = adj && adj[i] != null && c !== 0 ? adj[i] / c : 1
    bars.push({
      t: tMs,
      o: o * factor,
      h: h * factor,
      l: l * factor,
      c: c * factor,
      v: q.volume?.[i] ?? 0,
    })
  }
  return bars
}

export const yahooProvider: MarketDataProvider = {
  name: 'yahoo',

  async getBars(params: GetBarsParams): Promise<Bar[]> {
    const symbol = yahooSymbol(params.symbol)
    const tf = params.timeframe
    const interval = YF_INTERVAL[tf]
    const range = YF_RANGE[tf]
    const includeExtended = params.session !== 'regular'

    const result = await fetchChart(symbol, interval, range, includeExtended)
    let bars = parseBars(result, isIntraday(tf), includeExtended)

    if (tf === '4h') bars = resampleTo4h(bars)

    // return the most recent `limit` bars (respecting an optional `end`)
    if (params.end) bars = bars.filter((b) => b.t <= params.end!)
    if (bars.length > params.limit) bars = bars.slice(bars.length - params.limit)
    return bars
  },

  async searchSymbols(query: string): Promise<SymbolMatch[]> {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' }
      )
      if (!res.ok) return []
      const data = await res.json()
      return (data?.quotes ?? [])
        .filter((q: any) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'INDEX'))
        .map((q: any) => ({ symbol: q.symbol, name: q.shortname ?? q.longname ?? q.symbol, exchange: q.exchDisp ?? '' }))
    } catch {
      return []
    }
  },
}
