import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateBrief, getLatestBrief, getRecentNews, refreshNews } from '@/lib/news'

export const dynamic = 'force-dynamic'

// GET /api/news — cached headlines + latest brief.
export async function GET() {
  try {
    const headlines = await getRecentNews(60)
    const brief = await getLatestBrief()
    return NextResponse.json({ headlines, brief })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load news' }, { status: 500 })
  }
}

// POST /api/news — refresh headlines from Yahoo for current holdings, regenerate brief.
export async function POST(req: NextRequest) {
  try {
    const holdings = await prisma.holding.findMany({ where: { quantity: { gt: 0 } }, select: { ticker: true } })
    const tickers = holdings.map((h) => h.ticker)
    const fetched = await refreshNews(tickers)
    const headlines = await getRecentNews(60)

    const url = new URL(req.url)
    const brief = url.searchParams.get('brief') === 'false' ? null : await generateBrief(headlines)

    return NextResponse.json({ fetched, headlines, brief: brief ? { body: brief, generatedAt: new Date().toISOString() } : await getLatestBrief() })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to refresh news' }, { status: 500 })
  }
}
