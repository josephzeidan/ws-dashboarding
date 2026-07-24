// Market-data provider interface (spec §3.1). All provider calls happen
// server-side only. The S/R engine talks to this interface, never to a
// concrete provider — so Yahoo can be swapped for Polygon/Alpaca later.

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D' | '1W'

export interface Bar {
  t: number // epoch ms, bar OPEN time, UTC
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** A normalized bar carries session context the raw feed doesn't. */
export interface NormBar extends Bar {
  isSessionOpen: boolean // false on the first bar of a session (gap bar)
}

export interface GetBarsParams {
  symbol: string
  timeframe: Timeframe
  limit: number // number of bars, counted backwards from `end`
  end?: number // epoch ms, default now
  adjusted: boolean // MUST be true for equities
  session: 'regular' | 'extended' | 'all'
}

export interface SymbolMatch {
  symbol: string
  name: string
  exchange: string
}

export interface MarketDataProvider {
  name: string
  getBars(params: GetBarsParams): Promise<Bar[]>
  searchSymbols(query: string): Promise<SymbolMatch[]>
}

export class InsufficientDataError extends Error {
  found: number
  required: number
  constructor(found: number, required: number) {
    super(`Insufficient data: ${found} valid bars, need ${required}`)
    this.name = 'InsufficientDataError'
    this.found = found
    this.required = required
  }
}

export class ProviderRateLimitError extends Error {
  retryAfter: number
  constructor(retryAfter = 30) {
    super('Market data provider rate limit')
    this.name = 'ProviderRateLimitError'
    this.retryAfter = retryAfter
  }
}

export class ProviderDownError extends Error {
  constructor(msg = 'Market data provider unavailable') {
    super(msg)
    this.name = 'ProviderDownError'
  }
}

export class UnknownSymbolError extends Error {
  constructor(symbol: string) {
    super(`Unknown symbol: ${symbol}`)
    this.name = 'UnknownSymbolError'
  }
}
