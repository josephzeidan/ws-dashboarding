import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scanTickers } from '@/lib/sr/scanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// GET /api/sr/scan?profile=swing[&symbols=AAPL,MSFT] — defaults to holdings + watchlist.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const profile = url.searchParams.get('profile') ?? 'swing'
  const explicit = url.searchParams.get('symbols')

  let symbols: string[]
  if (explicit) {
    symbols = explicit.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  } else {
    const [holdings, watch] = await Promise.all([
      prisma.holding.findMany({ where: { quantity: { gt: 0 } }, select: { ticker: true } }),
      prisma.watchlistItem.findMany({ select: { ticker: true } }),
    ])
    symbols = Array.from(new Set([...holdings.map((h) => h.ticker), ...watch.map((w) => w.ticker)]))
  }
  symbols = symbols.slice(0, 20) // guard the scan size

  try {
    const rows = await scanTickers(symbols, profile)
    return NextResponse.json({ rows, scannedAt: new Date().toISOString() })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 })
  }
}
