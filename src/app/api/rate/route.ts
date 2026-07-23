import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchPrices } from '@/lib/yahoo-finance'
import { rateTicker } from '@/lib/rating/rate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/rate — scoreboard: past ratings graded against live prices.
export async function GET() {
  try {
    const ratings = await prisma.tickerRating.findMany({ orderBy: { ratedAt: 'desc' }, take: 30 })
    if (ratings.length === 0) return NextResponse.json({ scoreboard: [] })

    const prices = await fetchPrices(ratings.map((r) => r.ticker), { noStore: true })
    const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

    const scoreboard = ratings.map((r) => {
      const now = priceMap.get(r.ticker) ?? null
      const sincePct =
        now != null && r.priceAtRating ? Math.round(((now - r.priceAtRating) / r.priceAtRating) * 1000) / 10 : null
      // A BUY is "right" if up since rating; SELL if down; HOLD graded on small moves.
      let grade: 'RIGHT' | 'WRONG' | 'OPEN' = 'OPEN'
      if (sincePct != null && Math.abs(sincePct) >= 1) {
        if (r.verdict === 'BUY') grade = sincePct > 0 ? 'RIGHT' : 'WRONG'
        else if (r.verdict === 'SELL') grade = sincePct < 0 ? 'RIGHT' : 'WRONG'
        else grade = Math.abs(sincePct) <= 5 ? 'RIGHT' : 'WRONG'
      }
      return {
        ticker: r.ticker,
        score: r.score,
        verdict: r.verdict,
        ratedAt: r.ratedAt,
        priceAtRating: r.priceAtRating,
        priceNow: now,
        sincePct,
        grade,
      }
    })
    return NextResponse.json({ scoreboard })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load scoreboard' }, { status: 500 })
  }
}

// POST /api/rate { ticker }
export async function POST(req: NextRequest) {
  try {
    const { ticker } = await req.json()
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
    }
    const result = await rateTicker(ticker)
    if (Object.keys(result.weights).length === 0) {
      return NextResponse.json({ error: `Couldn't find market data for "${ticker.toUpperCase()}". Check the symbol.` }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('Rating failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Rating failed' }, { status: 500 })
  }
}
