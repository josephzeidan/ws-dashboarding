import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchPrices } from '@/lib/yahoo-finance'

export const dynamic = 'force-dynamic'

// Live day-change per holding (Yahoo regularMarket vs previous close).
export async function GET() {
  try {
    const holdings = await prisma.holding.findMany({
      where: { quantity: { gt: 0 } },
      select: { ticker: true, exchange: true },
    })
    const exchanges = Object.fromEntries(holdings.map((h) => [h.ticker, h.exchange]))
    const prices = await fetchPrices(holdings.map((h) => h.ticker), { noStore: true }, exchanges)
    const movers = prices
      .map((p) => ({ ticker: p.ticker, price: p.price, changePct: p.changePct, currency: p.currency }))
      .sort((a, b) => b.changePct - a.changePct)
    return NextResponse.json({ movers, at: new Date().toISOString() })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load movers' }, { status: 500 })
  }
}
