import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getKv } from '@/lib/kv'

export const dynamic = 'force-dynamic'

// Data-source health: per-source freshness so silent staleness becomes visible.
export async function GET() {
  try {
    const [ws, lastPriceTick, lastNews] = await Promise.all([
      prisma.wsSession.findFirst(),
      getKv('health:lastPriceTickAt'),
      prisma.newsItem.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } }),
    ])

    const now = Date.now()
    const ageMin = (iso: string | Date | null | undefined) =>
      iso ? Math.round((now - new Date(iso).getTime()) / 60000) : null

    return NextResponse.json({
      sources: [
        {
          key: 'ws',
          label: 'Wealthsimple',
          ok: ws?.status === 'connected',
          detail: ws ? ws.status : 'not connected',
          ageMin: ageMin(ws?.lastSyncAt),
        },
        {
          key: 'quotes',
          label: 'Live quotes',
          ok: lastPriceTick != null && (ageMin(lastPriceTick) ?? 999) < 30,
          detail: lastPriceTick ? 'polling' : 'no tick yet',
          ageMin: ageMin(lastPriceTick),
        },
        {
          key: 'news',
          label: 'News',
          ok: lastNews != null,
          detail: lastNews ? 'cached' : 'never fetched',
          ageMin: ageMin(lastNews?.fetchedAt),
        },
      ],
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
