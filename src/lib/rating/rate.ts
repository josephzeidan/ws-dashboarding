// Ticker rating orchestrator: gathers the four sub-scores, blends them into a
// 1–10 composite + BUY/HOLD/SELL verdict, and (if AI credits are available)
// asks Claude for a plain-English rationale. Persists the result to TickerRating.

import { prisma } from '@/lib/prisma'
import { callClaude, hasClaudeKey, CLAUDE_FAST } from '@/lib/claude'
import { getRecentNews } from '@/lib/news'
import { getTechnicals, TechnicalSignals } from './technicals'
import { getFundamentals, FundamentalSignals, AnalystSignals } from './fundamentals'
import { getSocial, RedditPost } from './reddit'

export interface RatingResult {
  ticker: string
  score: number
  verdict: 'BUY' | 'HOLD' | 'SELL'
  subScores: {
    technicals: number | null
    fundamentals: number | null
    analyst: number | null
    social: number | null
  }
  weights: Record<string, number>
  signals: {
    technicals: TechnicalSignals | null
    fundamentals: FundamentalSignals | null
    analyst: AnalystSignals | null
    social: { postCount: number; avgSentiment: number | null; bullish: number; bearish: number; topPosts: RedditPost[] }
  }
  rationale: string
  aiAvailable: boolean
  ratedAt: string
}

const WEIGHTS = { technicals: 0.3, analyst: 0.3, fundamentals: 0.25, social: 0.15 }

function verdictOf(score: number): 'BUY' | 'HOLD' | 'SELL' {
  if (score >= 6.5) return 'BUY'
  if (score <= 4) return 'SELL'
  return 'HOLD'
}

export async function rateTicker(rawTicker: string): Promise<RatingResult> {
  const ticker = rawTicker.trim().toUpperCase()

  // Prefer the user's own holding record for the exchange hint.
  const holding = await prisma.holding.findUnique({ where: { ticker } })

  const [tech, fund, social] = await Promise.all([
    getTechnicals(ticker, holding?.exchange),
    getFundamentals(ticker),
    getSocial(ticker),
  ])

  const subScores = {
    technicals: tech.score,
    fundamentals: fund.fundamentalScore,
    analyst: fund.analystScore,
    social: social.score,
  }

  // Weighted average over whichever sub-scores are available.
  let weightedSum = 0
  let weightTotal = 0
  const usedWeights: Record<string, number> = {}
  for (const [key, w] of Object.entries(WEIGHTS)) {
    const v = (subScores as Record<string, number | null>)[key]
    if (v != null) {
      weightedSum += v * w
      weightTotal += w
      usedWeights[key] = w
    }
  }
  const score = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : 5
  const verdict = verdictOf(score)

  const signals = {
    technicals: tech.signals,
    fundamentals: fund.fundamentals,
    analyst: fund.analyst,
    social: {
      postCount: social.postCount,
      avgSentiment: social.avgSentiment,
      bullish: social.bullish,
      bearish: social.bearish,
      topPosts: social.topPosts,
    },
  }

  const aiAvailable = hasClaudeKey()
  let rationale = buildFallbackRationale(ticker, score, verdict, subScores, signals)
  if (aiAvailable) {
    const ai = await tryAiRationale(ticker, score, verdict, subScores, signals)
    if (ai) rationale = ai
  }

  const priceAtRating = fund.analyst?.currentPrice ?? tech.signals?.price ?? null
  await prisma.tickerRating.upsert({
    where: { ticker },
    update: {
      score, verdict,
      fundamentals: subScores.fundamentals, technicals: subScores.technicals,
      analyst: subScores.analyst, social: subScores.social,
      rationale, detail: JSON.stringify(signals), priceAtRating, ratedAt: new Date(),
    },
    create: {
      ticker, score, verdict,
      fundamentals: subScores.fundamentals, technicals: subScores.technicals,
      analyst: subScores.analyst, social: subScores.social,
      rationale, detail: JSON.stringify(signals), priceAtRating,
    },
  })

  return { ticker, score, verdict, subScores, weights: usedWeights, signals, rationale, aiAvailable, ratedAt: new Date().toISOString() }
}

function buildFallbackRationale(
  ticker: string,
  score: number,
  verdict: string,
  sub: RatingResult['subScores'],
  signals: RatingResult['signals']
): string {
  const parts: string[] = []
  if (signals.technicals) {
    const t = signals.technicals
    parts.push(
      `Technicals: ${t.aboveMa50 ? 'above' : 'below'} the 50-day and ${t.aboveMa200 ? 'above' : 'below'} the 200-day MA, ${t.momentum1mPct != null ? `${t.momentum1mPct > 0 ? '+' : ''}${t.momentum1mPct}% over the past month` : 'flat momentum'}, sitting ${t.rangePctile ?? '—'}% up its 52-week range.`
    )
  }
  if (signals.analyst && sub.analyst != null) {
    const a = signals.analyst
    parts.push(
      `Analysts: consensus "${a.recommendationKey ?? 'n/a'}"${a.upsidePct != null ? `, mean target implies ${a.upsidePct > 0 ? '+' : ''}${a.upsidePct}% upside` : ''}${a.numberOfAnalysts ? ` (${a.numberOfAnalysts} analysts)` : ''}.`
    )
  }
  if (signals.fundamentals && sub.fundamentals != null) {
    const f = signals.fundamentals
    parts.push(
      `Fundamentals: ${f.revenueGrowth != null ? `${Math.round(f.revenueGrowth * 100)}% revenue growth` : 'growth n/a'}, ${f.profitMargin != null ? `${Math.round(f.profitMargin * 100)}% margins` : 'margins n/a'}${f.peForward ?? f.peTrailing ? `, P/E ~${Math.round((f.peForward ?? f.peTrailing)!)}` : ''}.`
    )
  }
  if (sub.social != null) {
    parts.push(`Reddit: ${signals.social.postCount} recent posts, ${signals.social.bullish} bullish vs ${signals.social.bearish} bearish.`)
  }
  return `${ticker} scores ${score}/10 → ${verdict}. ` + parts.join(' ')
}

async function tryAiRationale(
  ticker: string,
  score: number,
  verdict: string,
  sub: RatingResult['subScores'],
  signals: RatingResult['signals']
): Promise<string | null> {
  try {
    const news = await getRecentNews(40)
    const relevant = news.filter((n) => n.tickers.includes(ticker)).slice(0, 6).map((n) => `- ${n.title}`).join('\n')
    const prompt = `You are an equity analyst. Give a concise, decisive read on ${ticker}.
Composite score: ${score}/10 (verdict ${verdict}).
Sub-scores (1-10, null = unavailable): technicals ${sub.technicals}, fundamentals ${sub.fundamentals}, analyst ${sub.analyst}, reddit/social ${sub.social}.
Raw signals JSON: ${JSON.stringify(signals).slice(0, 1500)}
${relevant ? `Recent headlines:\n${relevant}` : ''}

Write 3-4 sentences: what the signals collectively say, the single biggest bull point and biggest risk, and who this suits (e.g. momentum vs value, short vs long horizon). Be specific and direct. No disclaimers, no "as an AI", no restating the numbers verbatim.`
    const text = await callClaude(prompt, { model: CLAUDE_FAST, maxTokens: 400 })
    return text.trim() || null
  } catch (err) {
    console.error('AI rationale failed:', err instanceof Error ? err.message : err)
    return null
  }
}
