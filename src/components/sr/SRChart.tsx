'use client'
import { useEffect, useRef, useState } from 'react'
import { createChart, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { Zone } from '@/lib/sr/types'

interface ChartBar { time: number; open: number; high: number; low: number; close: number; volume: number }

interface Props {
  bars: ChartBar[]
  zones: Zone[]
  retiredZones: Zone[]
  showMinor: boolean
  showRetired: boolean
  lastPrice: number
}

// Resistance = red family, support = green, flip = amber. Opacity ∝ strength.
function zoneColor(z: Zone): { fill: string; border: string } {
  const a = 0.06 + (z.strength / 100) * 0.22
  if (z.polarity === 'RESISTANCE') return { fill: `rgba(239,68,68,${a})`, border: 'rgba(239,68,68,0.5)' }
  if (z.polarity === 'SUPPORT') return { fill: `rgba(16,185,129,${a})`, border: 'rgba(16,185,129,0.5)' }
  return { fill: `rgba(245,158,11,${a})`, border: 'rgba(245,158,11,0.55)' }
}

export default function SRChart({ bars, zones, retiredZones, showMinor, showRetired, lastPrice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [, forceReposition] = useState(0)

  // create chart once
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#888', fontSize: 11 },
      grid: { vertLines: { color: '#f0f0f0' }, horzLines: { color: '#f0f0f0' } },
      rightPriceScale: { borderColor: '#e5e5e5' },
      timeScale: { borderColor: '#e5e5e5', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    })
    const series = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    })
    chartRef.current = chart
    seriesRef.current = series

    const reposition = () => forceReposition((n) => n + 1)
    chart.timeScale().subscribeVisibleLogicalRangeChange(reposition)
    const ro = new ResizeObserver(reposition)
    ro.observe(containerRef.current)

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null }
  }, [])

  // load data + round-number price lines
  useEffect(() => {
    const series = seriesRef.current
    if (!series || bars.length === 0) return
    series.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })))

    // touch + failed-breakout markers
    const markers: any[] = []
    for (const z of zones) {
      for (const t of z.touches.filter((x) => !x.provisional)) {
        markers.push({ time: (Math.floor(new Date(t.t).getTime() / 1000)) as UTCTimestamp, position: z.polarity === 'RESISTANCE' ? 'aboveBar' : 'belowBar', color: '#94a3b8', shape: 'circle', size: 0 })
      }
      for (const e of z.events.filter((x) => x.type === 'FAILED_BREAKOUT')) {
        markers.push({ time: (Math.floor(new Date(e.t).getTime() / 1000)) as UTCTimestamp, position: 'aboveBar', color: '#f59e0b', shape: 'arrowDown', text: 'FB' })
      }
    }
    markers.sort((a, b) => a.time - b.time)
    series.setMarkers(markers)

    // round-number dashed lines
    const rounds = new Set<number>()
    for (const z of zones) if (z.roundNumber != null) rounds.add(z.roundNumber)
    chartRef.current?.timeScale().fitContent()
    forceReposition((n) => n + 1)
  }, [bars, zones])

  // compute zone-band overlay rectangles from price → pixel coordinates
  const series = seriesRef.current
  const rects: { key: string; top: number; height: number; color: ReturnType<typeof zoneColor>; label: string; grade: string }[] = []
  if (series) {
    const draw = (z: Zone, retired: boolean) => {
      const yUpper = series.priceToCoordinate(z.upper)
      const yLower = series.priceToCoordinate(z.lower)
      if (yUpper == null || yLower == null) return
      const color = retired
        ? { fill: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.4)' }
        : zoneColor(z)
      rects.push({ key: z.id + (retired ? 'r' : ''), top: yUpper, height: Math.max(2, yLower - yUpper), color, label: `${z.lower.toFixed(2)}–${z.upper.toFixed(2)}`, grade: z.grade })
    }
    for (const z of zones) if (showMinor || (!z.filtered && z.grade !== 'D')) draw(z, false)
    if (showRetired) for (const z of retiredZones) draw(z, true)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: 420 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {rects.map((r) => (
          <div key={r.key} style={{ position: 'absolute', left: 0, right: 60, top: r.top, height: r.height, background: r.color.fill, borderTop: `1px solid ${r.color.border}`, borderBottom: `1px solid ${r.color.border}` }}>
            <span style={{ position: 'absolute', right: 4, top: -1, fontSize: 9, color: r.color.border, fontWeight: 700 }}>{r.grade}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
