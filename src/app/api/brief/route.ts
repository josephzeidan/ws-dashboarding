import { NextRequest, NextResponse } from 'next/server'
import { getMorningBrief } from '@/lib/brief'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const refresh = new URL(req.url).searchParams.get('refresh') === '1'
    const brief = await getMorningBrief(refresh)
    if (!brief) return NextResponse.json({ brief: null })
    return NextResponse.json({ brief })
  } catch (err) {
    console.error('brief failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Brief generation failed' }, { status: 500 })
  }
}
