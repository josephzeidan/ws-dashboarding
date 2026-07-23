import { NextRequest, NextResponse } from 'next/server'
import { login } from '@/lib/ws-api/client'
import { WsLoginFailedError, WsNetworkError, WsOtpRequiredError } from '@/lib/ws-api/errors'
import { saveSession } from '@/lib/ws-api/session-store'
import { fullSync } from '@/lib/ws-api/sync'

export const dynamic = 'force-dynamic'

// Credentials pass through this route in memory only — never persisted, never logged.
export async function POST(req: NextRequest) {
  try {
    const { email, password, otp } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const session = await login(email, password, otp || undefined)
    await saveSession(session)

    let sync: unknown = null
    let syncError: string | null = null
    try {
      sync = await fullSync()
    } catch (err) {
      // Connected but first sync failed — surface it without failing the connect.
      syncError = err instanceof Error ? err.message : 'First sync failed'
    }

    return NextResponse.json({ connected: true, sync, syncError })
  } catch (err) {
    if (err instanceof WsOtpRequiredError) {
      return NextResponse.json({ otpRequired: true, error: 'Enter your 2FA code' }, { status: 401 })
    }
    if (err instanceof WsLoginFailedError) {
      return NextResponse.json({ error: 'Login failed — check your email, password, and 2FA code' }, { status: 401 })
    }
    if (err instanceof WsNetworkError) {
      return NextResponse.json({ error: 'Could not reach Wealthsimple — check your connection' }, { status: 502 })
    }
    console.error('WS connect failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Connection failed' }, { status: 500 })
  }
}
