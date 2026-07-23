import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildAnalytics, generateRecommendations } from '@/analytics/scoring'
import { getKv } from '@/lib/kv'
import type { Holding } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const holdings = await prisma.holding.findMany()
    const rateRaw = await getKv('usdCadRate')
    const rate = rateRaw ? Number(rateRaw) : undefined
    const analytics = buildAnalytics(holdings as Holding[], Number.isFinite(rate) ? rate : undefined)
    const recommendations = generateRecommendations(analytics)
    return NextResponse.json({ recommendations, generatedAt: new Date().toISOString() })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }
}
