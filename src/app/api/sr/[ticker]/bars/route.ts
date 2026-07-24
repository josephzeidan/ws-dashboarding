import { NextRequest, NextResponse } from 'next/server'
import { getBarsCached } from '@/lib/market-data/cache'
import { normalizeBars } from '@/lib/market-data/normalize'
import { PROFILES } from '@/lib/sr/config'
import { InsufficientDataError, ProviderDownError, ProviderRateLimitError, UnknownSymbolError } from '@/lib/market-data/provider'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Raw execution-timeframe bars for the chart. time returned in SECONDS.
export async function GET(req: NextRequest, { params }: { params: { ticker: string } }) {
  const url = new URL(req.url)
  const profile = PROFILES[url.searchParams.get('profile') ?? 'swing'] ?? PROFILES.swing
  const session = (url.searchParams.get('session') ?? 'regular') as 'regular' | 'extended' | 'all'
  const tf = profile.executionTF
  const limit = profile.lookbackBars[tf] ?? 500

  try {
    const raw = await getBarsCached({ symbol: params.ticker, timeframe: tf, limit, adjusted: true, session })
    const norm = normalizeBars(raw, tf, Math.min(50, raw.length))
    const bars = norm.map((b) => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }))
    return NextResponse.json({ timeframe: tf, bars })
  } catch (err) {
    if (err instanceof UnknownSymbolError) return NextResponse.json({ error: 'Unknown symbol' }, { status: 404 })
    if (err instanceof InsufficientDataError) return NextResponse.json({ error: 'Insufficient data', found: err.found, required: err.required }, { status: 422 })
    if (err instanceof ProviderRateLimitError) return NextResponse.json({ error: 'Rate limited', retryAfter: err.retryAfter }, { status: 429 })
    if (err instanceof ProviderDownError) return NextResponse.json({ error: 'Provider unavailable' }, { status: 503 })
    console.error(err)
    return NextResponse.json({ error: 'Failed to load bars' }, { status: 500 })
  }
}
