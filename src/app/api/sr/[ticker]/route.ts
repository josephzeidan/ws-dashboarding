import { NextRequest, NextResponse } from 'next/server'
import { runAnalysis } from '@/lib/sr/engine'
import { PROFILES } from '@/lib/sr/config'
import { InsufficientDataError, ProviderDownError, ProviderRateLimitError, UnknownSymbolError } from '@/lib/market-data/provider'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: { ticker: string } }) {
  const url = new URL(req.url)
  const profileId = url.searchParams.get('profile') ?? 'swing'
  const session = (url.searchParams.get('session') ?? 'regular') as 'regular' | 'extended' | 'all'
  const refresh = url.searchParams.get('refresh') === 'true'

  if (!PROFILES[profileId]) {
    return NextResponse.json({ error: `Unknown profile "${profileId}"` }, { status: 400 })
  }

  try {
    const analysis = await runAnalysis(params.ticker, { profileId, session, refresh })
    return NextResponse.json(analysis)
  } catch (err) {
    if (err instanceof UnknownSymbolError) {
      return NextResponse.json({ error: `Unknown symbol "${params.ticker.toUpperCase()}"` }, { status: 404 })
    }
    if (err instanceof InsufficientDataError) {
      return NextResponse.json({ error: 'Not enough price history for a reliable read', found: err.found, required: err.required }, { status: 422 })
    }
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Market data rate limit — try again shortly', retryAfter: err.retryAfter }, { status: 429 })
    }
    if (err instanceof ProviderDownError) {
      return NextResponse.json({ error: 'Market data provider is temporarily unavailable' }, { status: 503 })
    }
    console.error('SR analysis failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
