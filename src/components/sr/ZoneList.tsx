'use client'
import { useState } from 'react'
import type { Zone } from '@/lib/sr/types'
import ZoneCard from './ZoneCard'

export default function ZoneList({ zones, maxVisible }: { zones: Zone[]; maxVisible: number }) {
  const [showMinor, setShowMinor] = useState(false)
  const major = zones.filter((z) => !z.filtered && z.grade !== 'D')
  const minor = zones.filter((z) => z.filtered || z.grade === 'D')

  const resistance = major.filter((z) => z.polarity === 'RESISTANCE' || (z.polarity === 'FLIP' && z.distanceFromPrice > 0)).slice(0, Math.ceil(maxVisible / 2))
  const support = major.filter((z) => z.polarity === 'SUPPORT' || (z.polarity === 'FLIP' && z.distanceFromPrice <= 0)).slice(0, Math.ceil(maxVisible / 2))

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', margin: '4px 0 8px' }}>Resistance above</div>
      {resistance.length === 0 ? <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10 }}>No clean resistance zones nearby.</div> : resistance.map((z) => <ZoneCard key={z.id} zone={z} />)}

      <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', margin: '12px 0 8px' }}>Support below</div>
      {support.length === 0 ? <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10 }}>No clean support zones nearby.</div> : support.map((z) => <ZoneCard key={z.id} zone={z} />)}

      {minor.length > 0 && (
        <>
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setShowMinor(!showMinor)}>
            {showMinor ? 'Hide' : `Show ${minor.length} minor levels`}
          </button>
          {showMinor && <div style={{ marginTop: 8 }}>{minor.map((z) => <ZoneCard key={z.id} zone={z} />)}</div>}
        </>
      )}
    </div>
  )
}
