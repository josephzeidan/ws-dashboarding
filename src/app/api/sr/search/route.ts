import { NextRequest, NextResponse } from 'next/server'
import { searchSymbols } from '@/lib/market-data/cache'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  if (q.trim().length < 1) return NextResponse.json({ matches: [] })
  try {
    const matches = await searchSymbols(q)
    return NextResponse.json({ matches })
  } catch {
    return NextResponse.json({ matches: [] })
  }
}
