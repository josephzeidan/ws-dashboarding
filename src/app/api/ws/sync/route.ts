import { NextResponse } from 'next/server'
import { WsAuthExpiredError, WsRateLimitError, WsSchemaError } from '@/lib/ws-api/errors'
import { fullSync } from '@/lib/ws-api/sync'
import { setKv } from '@/lib/kv'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await fullSync()
    await setKv('syncMode', 'live') // a successful manual sync clears csv-fallback mode
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof WsAuthExpiredError) {
      return NextResponse.json({ error: 'Session expired — reconnect in Settings', code: 'expired' }, { status: 401 })
    }
    if (err instanceof WsRateLimitError) {
      return NextResponse.json({ error: 'Rate limited by Wealthsimple — try again in a few minutes', code: 'rate-limited' }, { status: 429 })
    }
    if (err instanceof WsSchemaError) {
      return NextResponse.json(
        { error: 'Wealthsimple changed their API — using CSV import until this is fixed', code: 'schema-drift' },
        { status: 502 }
      )
    }
    console.error('WS sync failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
