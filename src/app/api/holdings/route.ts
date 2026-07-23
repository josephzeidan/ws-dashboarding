import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const holdings = await prisma.holding.findMany({ orderBy: { ticker: 'asc' } })
    return NextResponse.json(holdings)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { ticker, ...updates } = body
    if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })
    const holding = await prisma.holding.update({ where: { ticker }, data: updates })
    return NextResponse.json(holding)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update holding' }, { status: 500 })
  }
}
