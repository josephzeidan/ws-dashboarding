import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const items = await prisma.watchlistItem.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json(items)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ticker, name, theme, notes, alertPrice } = await req.json()
    if (!ticker || !name) return NextResponse.json({ error: 'ticker and name required' }, { status: 400 })
    const item = await prisma.watchlistItem.upsert({
      where: { ticker },
      update: { name, theme, notes, alertPrice: alertPrice ?? null },
      create: { ticker, name, theme: theme ?? '', notes: notes ?? '', alertPrice: alertPrice ?? null },
    })
    return NextResponse.json(item)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to add to watchlist' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ticker } = await req.json()
    await prisma.watchlistItem.delete({ where: { ticker } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to remove from watchlist' }, { status: 500 })
  }
}
