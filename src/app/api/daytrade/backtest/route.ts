import { NextResponse } from 'next/server'
import { runBacktest } from '@/lib/daytrade/backtest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  try {
    const result = await runBacktest('SPY')
    return NextResponse.json(result)
  } catch (err) {
    console.error('backtest failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Backtest failed' }, { status: 500 })
  }
}
