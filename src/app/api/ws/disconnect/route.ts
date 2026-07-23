import { NextResponse } from 'next/server'
import { deleteSession } from '@/lib/ws-api/session-store'

export const dynamic = 'force-dynamic'

export async function DELETE() {
  try {
    await deleteSession()
    return NextResponse.json({ disconnected: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
