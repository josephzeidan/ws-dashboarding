'use client'

interface Props {
  data: Record<string, number>
  colors: string[]
}

export default function AllocationChart({ data, colors }: Props) {
  const sorted = Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 0.5)

  return (
    <div>
      {sorted.map(([label, pct], i) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], display: 'inline-block' }} />
              {label}
            </span>
            <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{pct.toFixed(1)}%</span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: colors[i % colors.length] }} />
          </div>
        </div>
      ))}
    </div>
  )
}
