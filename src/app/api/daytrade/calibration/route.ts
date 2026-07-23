import { NextResponse } from 'next/server'
import { runCalibration } from '@/lib/daytrade/evaluate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    const result = await runCalibration('SPY')
    return NextResponse.json(result)
  } catch (err) {
    console.error('calibration failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Calibration failed' }, { status: 500 })
  }
}
