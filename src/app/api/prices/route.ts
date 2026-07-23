import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchPrices } from '@/lib/yahoo-finance'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const holdings = await prisma.holding.findMany({ select: { ticker: true } })
    const tickers = holdings.map((h) => h.ticker)

    const prices = await fetchPrices(tickers)

    // Update each holding in DB
    const updates = await Promise.allSettled(
      prices.map((p) =>
        prisma.holding.update({
          where: { ticker: p.ticker },
          data: {
            marketPrice: p.price,
            marketPriceCurrency: p.currency,
          },
        })
      )
    )

    const succeeded = updates.filter((u) => u.status === 'fulfilled').length
    const failed = tickers.length - prices.length

    return NextResponse.json({
      updated: succeeded,
      failed,
      prices: prices.map((p) => ({ ticker: p.ticker, price: p.price, currency: p.currency, changePct: p.changePct })),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to refresh prices' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const holdings = await prisma.holding.findMany({ select: { ticker: true } })
    const tickers = holdings.map((h) => h.ticker)
    const prices = await fetchPrices(tickers)
    return NextResponse.json({ prices, timestamp: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
  }
}
