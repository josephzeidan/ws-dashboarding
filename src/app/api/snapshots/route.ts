import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const RANGE_MS: Record<string, number> = {
  '1D': 24 * 3600_000,
  '1W': 7 * 24 * 3600_000,
  '1M': 30 * 24 * 3600_000,
  '3M': 90 * 24 * 3600_000,
  ALL: Number.MAX_SAFE_INTEGER,
}

export async function GET(req: NextRequest) {
  try {
    const range = new URL(req.url).searchParams.get('range') ?? '1M'
    const span = RANGE_MS[range] ?? RANGE_MS['1M']
    const since = span === Number.MAX_SAFE_INTEGER ? new Date(0) : new Date(Date.now() - span)

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: { takenAt: { gte: since } },
      orderBy: { takenAt: 'asc' },
      select: { totalCAD: true, cashCAD: true, bookCostCAD: true, takenAt: true },
    })
    return NextResponse.json({ snapshots })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load snapshots' }, { status: 500 })
  }
}
