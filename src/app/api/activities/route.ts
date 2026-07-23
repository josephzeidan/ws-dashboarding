import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/activities?type=BUY,SELL&ticker=NVDA&limit=100&cursor=<id>
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const types = searchParams.get('type')?.split(',').filter(Boolean)
    const ticker = searchParams.get('ticker') || undefined
    const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)
    const cursor = searchParams.get('cursor') || undefined

    const where: any = {}
    if (types && types.length) where.type = { in: types }
    if (ticker) where.ticker = ticker

    const items = await prisma.activity.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    const hasMore = items.length > limit
    const page = hasMore ? items.slice(0, limit) : items
    return NextResponse.json({
      activities: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load activities' }, { status: 500 })
  }
}

// PATCH /api/activities  { ids: string[] }  — mark activities as seen (toast dismissed)
export async function PATCH(req: NextRequest) {
  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ updated: 0 })
    const res = await prisma.activity.updateMany({ where: { id: { in: ids } }, data: { seen: true } })
    return NextResponse.json({ updated: res.count })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update activities' }, { status: 500 })
  }
}
