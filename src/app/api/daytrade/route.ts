import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchBars, groupBySession } from '@/lib/daytrade/intraday'
import { analyzeSession } from '@/lib/daytrade/strategy'
import { buildTradeIdea } from '@/lib/daytrade/options'
import { evaluateStoredSignals } from '@/lib/daytrade/evaluate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYMBOL = 'SPY'

// GET /api/daytrade — full live analysis: ensemble votes, direction,
// confidence, and the recommended defined-risk trade (or NO_TRADE).
export async function GET() {
  try {
    // 5 days of 1m bars: latest session to analyze + prior session for levels,
    // plus enough history to estimate the average daily range.
    const bars = await fetchBars(SYMBOL, '1m', '5d')
    const sessions = groupBySession(bars)
    if (sessions.length === 0) {
      return NextResponse.json({ error: 'No intraday data available' }, { status: 502 })
    }

    const current = sessions[sessions.length - 1]
    const priorSession = sessions.length > 1 ? sessions[sessions.length - 2] : null
    const prior = priorSession
      ? {
          close: priorSession.bars[priorSession.bars.length - 1].close,
          high: Math.max(...priorSession.bars.map((b) => b.high)),
          low: Math.min(...priorSession.bars.map((b) => b.low)),
        }
      : undefined

    const analysis = analyzeSession(current.bars, prior)

    // Average daily range % over available sessions → expected-move input.
    const ranges = sessions.slice(0, -1).map((s) => {
      const hi = Math.max(...s.bars.map((b) => b.high))
      const lo = Math.min(...s.bars.map((b) => b.low))
      const cl = s.bars[s.bars.length - 1].close
      return ((hi - lo) / cl) * 100
    })
    const avgDailyRangePct = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0.8

    const trade = await buildTradeIdea(SYMBOL, analysis.direction, analysis.confidence, analysis.price, avgDailyRangePct)

    // Persist one signal per session (for the history log / later evaluation).
    if (analysis.state !== 'RANGE_FORMING') {
      await prisma.dayTradeSignal.upsert({
        where: { session: analysis.sessionDate },
        update: {
          direction: analysis.direction,
          confidence: analysis.confidence,
          price: analysis.price,
          detail: JSON.stringify({ votes: analysis.votes, aggregate: analysis.aggregate, chopPenalty: analysis.chopPenalty, openingRange: analysis.openingRange }),
          trade: JSON.stringify(trade),
        },
        create: {
          session: analysis.sessionDate,
          symbol: SYMBOL,
          direction: analysis.direction,
          confidence: analysis.confidence,
          price: analysis.price,
          detail: JSON.stringify({ votes: analysis.votes, aggregate: analysis.aggregate, chopPenalty: analysis.chopPenalty, openingRange: analysis.openingRange }),
          trade: JSON.stringify(trade),
        },
      })
    }

    // Close the loop: grade any past signals we haven't evaluated yet.
    await evaluateStoredSignals(sessions)

    const history = await prisma.dayTradeSignal.findMany({ orderBy: { session: 'desc' }, take: 15 })

    return NextResponse.json({
      analysis,
      trade,
      avgDailyRangePct: Math.round(avgDailyRangePct * 100) / 100,
      history: history.map((h) => ({
        session: h.session,
        direction: h.direction,
        confidence: h.confidence,
        price: h.price,
        outcome: h.outcome,
        outcomePct: h.outcomePct,
      })),
    })
  } catch (err) {
    console.error('daytrade analysis failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Analysis failed — Yahoo data may be briefly unavailable' }, { status: 500 })
  }
}
