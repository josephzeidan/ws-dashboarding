import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getKv } from '@/lib/kv'
import { getConnectionStatus } from '@/lib/ws-api/session-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const status = await getConnectionStatus()
    const account = await prisma.wsAccount.findFirst({ where: { type: 'tfsa' } })
    const syncMode = (await getKv('syncMode')) ?? 'live'
    return NextResponse.json({
      ...status,
      syncMode,
      account: account
        ? {
            description: account.description,
            cashCAD: account.cashCAD,
            cashUSD: account.cashUSD,
            netValueCAD: account.netValueCAD,
            updatedAt: account.updatedAt,
          }
        : null,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to read connection status' }, { status: 500 })
  }
}
