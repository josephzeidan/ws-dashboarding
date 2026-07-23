'use client'
import { useState, useRef } from 'react'
import WsConnectCard from '@/components/WsConnectCard'

export default function SettingsPage() {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  async function handleImport(file: File) {
    setImporting(true)
    setImportResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) {
        setImportResult({ success: false, error: data.error })
      } else {
        setImportResult({ success: true, message: `✓ Imported ${data.updated} holdings from "${file.name}"${data.timestamp ? ` · WS snapshot: ${data.timestamp}` : ''}` })
      }
    } catch {
      setImportResult({ success: false, error: 'Network error during import.' })
    }
    setImporting(false)
  }

  async function refreshPrices() {
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const res = await fetch('/api/prices', { method: 'POST' })
      const data = await res.json()
      setRefreshResult(`✓ Updated ${data.updated} prices from Yahoo Finance · ${data.failed} failed · ${new Date(data.timestamp).toLocaleTimeString('en-CA')}`)
    } catch {
      setRefreshResult('Failed to refresh prices.')
    }
    setRefreshing(false)
  }

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Import data, refresh prices, manage preferences</p>
      </div>

      {/* Wealthsimple live connection */}
      <WsConnectCard />

      {/* CSV Import (fallback) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Fallback import (CSV)</div>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
          If the live connection is unavailable, export your holdings CSV from Wealthsimple: <strong>Account → Holdings → Export CSV</strong>.<br />
          Drop the file below to sync your latest positions. Your thesis, conviction scores, and notes are preserved.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleImport(f) }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#3b6fd4' : '#ddd'}`,
            borderRadius: 12, padding: '32px 24px', textAlign: 'center',
            cursor: 'pointer', transition: 'border-color 0.15s',
            background: dragging ? '#f0f4ff' : '#fafafa',
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Drop your Wealthsimple CSV here</div>
          <div style={{ fontSize: 13, color: '#888' }}>or click to select a file</div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
        </div>

        {importing && <div style={{ fontSize: 13, color: '#888', padding: '8px 0' }}>Importing…</div>}
        {importResult && (
          <div style={{ fontSize: 13, padding: '10px 14px', borderRadius: 8, background: importResult.success ? '#e8f7f0' : '#fdeaea', color: importResult.success ? '#1a6645' : '#8b2020', marginTop: 8 }}>
            {importResult.message ?? importResult.error}
          </div>
        )}
      </div>

      {/* Price refresh */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Live price refresh</div>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.6 }}>
          Fetch latest prices from Yahoo Finance for all 14 holdings. Free, no API key required. Prices cache for 5 minutes.
        </p>
        <button className="btn btn-primary" disabled={refreshing} onClick={refreshPrices}>
          {refreshing ? 'Refreshing prices…' : '↻ Refresh all prices now'}
        </button>
        {refreshResult && (
          <div style={{ fontSize: 13, padding: '10px 14px', borderRadius: 8, background: '#e8f7f0', color: '#1a6645', marginTop: 12 }}>
            {refreshResult}
          </div>
        )}
      </div>

      {/* How to export */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>How to export from Wealthsimple</div>
        {[
          { step: '1', text: 'Open Wealthsimple on desktop (app or browser)' },
          { step: '2', text: 'Go to your TFSA account' },
          { step: '3', text: 'Click the Holdings tab' },
          { step: '4', text: 'Click the Download / Export button (top right)' },
          { step: '5', text: 'Choose "Holdings report" — this gives you the CSV with all position data' },
          { step: '6', text: 'Drop the downloaded CSV file into the import zone above' },
        ].map((s) => (
          <div key={s.step} style={{ display: 'flex', gap: 14, padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#e8f0ff', color: '#2d5cbe', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</div>
            <span style={{ color: '#444', lineHeight: 1.5 }}>{s.text}</span>
          </div>
        ))}
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#fffbeb', fontSize: 12, color: '#78350f' }}>
          <strong>Note:</strong> The CSV export is a snapshot in time. Export fresh each time you want updated position data. Prices are kept live via Yahoo Finance.
        </div>
      </div>
    </div>
  )
}
