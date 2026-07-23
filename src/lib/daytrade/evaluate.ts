// Closes the loop on confidence: grades stored signals against what actually
// happened, and computes a 60-session synthetic calibration curve by replaying
// the same ensemble at ~10:35 each day and checking it against the close.

import { prisma } from '@/lib/prisma'
import { Bar, fetchBars, groupBySession } from './intraday'
import { analyzeSession } from './strategy'

const ENTRY_MINUTES = 10 * 60 + 35 // grade from 10:35 ET (after signals firm up)

export interface CalibrationBucket {
  label: string
  min: number
  max: number
  signals: number
  wins: number
  hitRate: number | null // %
  avgPct: number | null
}

export interface CalibrationResult {
  sessions: number
  from: string
  to: string
  buckets: CalibrationBucket[]
  neutralDays: number
}

function gradeSession(
  bars: Bar[],
  direction: string
): { outcomePct: number; outcome: 'WIN' | 'LOSS' } | null {
  const entryBar = bars.find((b) => b.et.minutes >= ENTRY_MINUTES)
  const closeBar = bars[bars.length - 1]
  if (!entryBar || !closeBar || entryBar === closeBar) return null
  const raw = ((closeBar.close - entryBar.close) / entryBar.close) * 100
  const outcomePct = direction === 'BEARISH' ? -raw : raw
  return { outcomePct: Math.round(outcomePct * 100) / 100, outcome: outcomePct > 0 ? 'WIN' : 'LOSS' }
}

/** Grade any stored, past-session signals that haven't been evaluated yet.
 *  Uses whatever recent bar history is passed in (1m/5d covers the window). */
export async function evaluateStoredSignals(sessions: { date: string; bars: Bar[] }[]): Promise<void> {
  const currentSession = sessions[sessions.length - 1]?.date
  const pending = await prisma.dayTradeSignal.findMany({
    where: { outcome: '', session: { not: currentSession ?? '' } },
  })
  if (pending.length === 0) return

  const byDate = new Map(sessions.map((s) => [s.date, s.bars]))
  for (const sig of pending) {
    const bars = byDate.get(sig.session)
    if (!bars || bars.length < 30) continue
    if (sig.direction === 'NEUTRAL') {
      await prisma.dayTradeSignal.update({ where: { id: sig.id }, data: { outcome: 'SKIPPED' } })
      continue
    }
    const graded = gradeSession(bars, sig.direction)
    if (graded) {
      await prisma.dayTradeSignal.update({
        where: { id: sig.id },
        data: { outcome: graded.outcome, outcomePct: graded.outcomePct },
      })
    }
  }
}

/** Replay the ensemble at ~10:35 on each of the last ~60 sessions and bucket
 *  hit rates by the confidence the ensemble reported. Answers "what does a
 *  confidence of 60 actually mean?" */
export async function runCalibration(symbol = 'SPY'): Promise<CalibrationResult> {
  const bars = await fetchBars(symbol, '5m', '60d')
  const sessions = groupBySession(bars).filter((s) => s.bars.length >= 60)

  const buckets: CalibrationBucket[] = [
    { label: '35–54 (below trade threshold)', min: 35, max: 54, signals: 0, wins: 0, hitRate: null, avgPct: null },
    { label: '55–69 (tradeable)', min: 55, max: 69, signals: 0, wins: 0, hitRate: null, avgPct: null },
    { label: '70+ (high conviction)', min: 70, max: 101, signals: 0, wins: 0, hitRate: null, avgPct: null },
  ]
  const pcts: number[][] = [[], [], []]
  let neutralDays = 0

  for (let i = 0; i < sessions.length; i++) {
    const { bars: dayBars } = sessions[i]
    const priorSession = i > 0 ? sessions[i - 1] : null
    const prior = priorSession
      ? {
          close: priorSession.bars[priorSession.bars.length - 1].close,
          high: Math.max(...priorSession.bars.map((b) => b.high)),
          low: Math.min(...priorSession.bars.map((b) => b.low)),
        }
      : undefined

    // Snapshot the ensemble as of ~10:35 — same information a live user had.
    const snapshot = dayBars.filter((b) => b.et.minutes <= ENTRY_MINUTES)
    if (snapshot.length < 8) continue
    const analysis = analyzeSession(snapshot, prior, { barMinutes: 5 })

    if (analysis.direction === 'NEUTRAL') {
      neutralDays++
      continue
    }
    const graded = gradeSession(dayBars, analysis.direction)
    if (!graded) continue

    const bi = buckets.findIndex((b) => analysis.confidence >= b.min && analysis.confidence <= b.max)
    if (bi === -1) continue
    buckets[bi].signals++
    if (graded.outcome === 'WIN') buckets[bi].wins++
    pcts[bi].push(graded.outcomePct)
  }

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i]
    if (b.signals > 0) {
      b.hitRate = Math.round((b.wins / b.signals) * 1000) / 10
      b.avgPct = Math.round((pcts[i].reduce((a, v) => a + v, 0) / b.signals) * 100) / 100
    }
  }

  return {
    sessions: sessions.length,
    from: sessions[0]?.date ?? '',
    to: sessions[sessions.length - 1]?.date ?? '',
    buckets,
    neutralDays,
  }
}
