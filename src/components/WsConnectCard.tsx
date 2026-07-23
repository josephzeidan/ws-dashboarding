'use client'
import { useCallback, useEffect, useState } from 'react'

interface WsStatus {
  status: 'connected' | 'expired' | 'error' | 'disconnected'
  lastSyncAt: string | null
  lastError: string
  syncMode: string
  account: {
    description: string
    cashCAD: number
    cashUSD: number
    netValueCAD: number
    updatedAt: string
  } | null
}

const STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  connected: { dot: '#10b981', label: 'Connected' },
  expired: { dot: '#f59e0b', label: 'Session expired — reconnect' },
  error: { dot: '#ef4444', label: 'Sync error' },
  disconnected: { dot: '#9ca3af', label: 'Not connected' },
}

export default function WsConnectCard() {
  const [status, setStatus] = useState<WsStatus | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [otpRequired, setOtpRequired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ws/status')
      setStatus(await res.json())
    } catch {
      // leave as-is
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/ws/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, otp: otp || undefined }),
      })
      const data = await res.json()
      if (data.otpRequired) {
        setOtpRequired(true)
        setMessage({ ok: true, text: 'Enter your 2FA code — from your authenticator app, or the text message Wealthsimple just sent to your phone.' })
      } else if (data.connected) {
        setPassword('')
        setOtp('')
        setOtpRequired(false)
        setMessage({
          ok: true,
          text: data.syncError
            ? `Connected, but first sync failed: ${data.syncError}`
            : `✓ Connected — synced ${data.sync?.positions?.updated + data.sync?.positions?.created || 0} holdings, ${data.sync?.newActivities ?? 0} activities`,
        })
        await loadStatus()
      } else {
        setMessage({ ok: false, text: data.error ?? 'Connection failed' })
      }
    } catch {
      setMessage({ ok: false, text: 'Network error — is the app still running?' })
    }
    setBusy(false)
  }

  async function syncNow() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/ws/sync', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setMessage({
          ok: true,
          text: `✓ Synced — ${data.positions.updated} updated, ${data.positions.created} new, ${data.positions.zeroed} sold out, ${data.newActivities} new activities`,
        })
        await loadStatus()
      } else {
        setMessage({ ok: false, text: data.error ?? 'Sync failed' })
        await loadStatus()
      }
    } catch {
      setMessage({ ok: false, text: 'Network error during sync.' })
    }
    setBusy(false)
  }

  async function disconnect() {
    if (!confirm('Disconnect Wealthsimple? Stored tokens will be deleted. Your holdings and notes stay.')) return
    setBusy(true)
    await fetch('/api/ws/disconnect', { method: 'DELETE' })
    setMessage({ ok: true, text: 'Disconnected. Tokens deleted.' })
    await loadStatus()
    setBusy(false)
  }

  const st = STATUS_STYLE[status?.status ?? 'disconnected']
  const connected = status?.status === 'connected'
  const fmtCAD = (v: number) => v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 13,
    marginBottom: 10,
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Wealthsimple connection</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
          {st.label}
        </span>
      </div>

      {connected ? (
        <>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 1.6 }}>
            {status?.account?.description ?? 'TFSA'} — live sync of positions, cash, and trade activity.
            {status?.lastSyncAt && <> Last sync: {new Date(status.lastSyncAt).toLocaleString('en-CA')}.</>}
          </p>
          {status?.account && (
            <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#444', marginBottom: 14 }}>
              <span>Cash (CAD): <strong>{fmtCAD(status.account.cashCAD)}</strong></span>
              {status.account.cashUSD > 0 && <span>Cash (USD): <strong>US${status.account.cashUSD.toFixed(2)}</strong></span>}
              <span>Net value: <strong>{fmtCAD(status.account.netValueCAD)}</strong></span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" disabled={busy} onClick={syncNow}>
              {busy ? 'Syncing…' : '↻ Sync now'}
            </button>
            <button className="btn" disabled={busy} onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.6 }}>
            Connect your Wealthsimple account for live syncing of holdings, cash, and buy/sell activity.
            Credentials are sent only to Wealthsimple — this app stores encrypted session tokens locally, never your password.
            {status?.status === 'expired' && <><br /><strong>Your session expired — log in again to resume live sync.</strong></>}
          </p>
          <form onSubmit={connect} style={{ maxWidth: 380 }}>
            <input
              style={inputStyle}
              type="email"
              placeholder="Wealthsimple email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
            <input
              style={inputStyle}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
            />
            {otpRequired && (
              <input
                style={inputStyle}
                type="text"
                inputMode="numeric"
                placeholder="2FA code (from your app or SMS text)"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoFocus
              />
            )}
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? 'Connecting…' : otpRequired ? 'Verify & connect' : 'Connect Wealthsimple'}
            </button>
          </form>
        </>
      )}

      {message && (
        <div
          style={{
            fontSize: 13,
            padding: '10px 14px',
            borderRadius: 8,
            background: message.ok ? '#e8f7f0' : '#fdeaea',
            color: message.ok ? '#1a6645' : '#8b2020',
            marginTop: 12,
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
