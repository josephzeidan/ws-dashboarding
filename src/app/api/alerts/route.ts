import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const alerts = await prisma.alert.findMany({ orderBy: { createdAt: 'desc' }, take: 40 })
    const unread = await prisma.alert.count({ where: { readAt: null } })
    return NextResponse.json({ alerts, unread })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 })
  }
}

// PATCH { ids?: string[] } — mark given alerts read; no ids = mark all read.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const where = Array.isArray(body.ids) && body.ids.length > 0 ? { id: { in: body.ids } } : { readAt: null }
    const res = await prisma.alert.updateMany({ where, data: { readAt: new Date() } })
    return NextResponse.json({ updated: res.count })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update alerts' }, { status: 500 })
  }
}
