import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const trends = await prisma.macroTrend.findMany()
    return NextResponse.json(
      trends.map((t) => ({
        ...t,
        drivers: t.drivers.split('|').filter(Boolean),
        risks: t.risks.split('|').filter(Boolean),
        tickers: t.tickers.split(',').filter(Boolean),
      }))
    )
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, signal } = await req.json()
    const trend = await prisma.macroTrend.update({ where: { id }, data: { signal } })
    return NextResponse.json(trend)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update trend' }, { status: 500 })
  }
}
