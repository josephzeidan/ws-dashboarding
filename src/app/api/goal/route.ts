import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildProjection, getGoal } from '@/lib/goal'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(await buildProjection())
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to build projection' }, { status: 500 })
  }
}

// PATCH — update goal parameters (target, date, monthly, CAGR).
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const goal = await getGoal()
    await prisma.goal.update({
      where: { id: goal.id },
      data: {
        ...(body.targetAmount != null ? { targetAmount: Number(body.targetAmount) } : {}),
        ...(body.targetDate ? { targetDate: new Date(body.targetDate) } : {}),
        ...(body.monthlyContribution != null ? { monthlyContribution: Number(body.monthlyContribution) } : {}),
        ...(body.assumedCagrPct != null ? { assumedCagrPct: Number(body.assumedCagrPct) } : {}),
      },
    })
    return NextResponse.json(await buildProjection())
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 })
  }
}
