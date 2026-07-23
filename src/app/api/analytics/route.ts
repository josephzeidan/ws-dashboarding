import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildAnalytics } from '@/analytics/scoring'
import { getKv } from '@/lib/kv'
import type { Holding } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const holdings = await prisma.holding.findMany()
    const rateRaw = await getKv('usdCadRate')
    const rate = rateRaw ? Number(rateRaw) : undefined
    const analytics = buildAnalytics(holdings as Holding[], Number.isFinite(rate) ? rate : undefined)
    return NextResponse.json({ ...analytics, usdCadRate: Number.isFinite(rate) ? rate : 1.39 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 })
  }
}
