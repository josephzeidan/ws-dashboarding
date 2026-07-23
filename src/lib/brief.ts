// Morning Brief: the synthesis layer. Fuses live movers, portfolio quality,
// the SPY day-trade signal, fresh news, rule recommendations, and journal
// hygiene into 3-6 prioritized action cards — AI-composed when credits allow,
// deterministic rule-based composition otherwise. Cached per ET session in KV.

import { prisma } from '@/lib/prisma'
import { getKv, setKv } from '@/lib/kv'
import { buildAnalytics, generateRecommendations } from '@/analytics/scoring'
import { fetchPrices } from '@/lib/yahoo-finance'
import { getRecentNews } from '@/lib/news'
import { callClaudeJson, hasClaudeKey, CLAUDE_FAST } from '@/lib/claude'
import { toEt } from '@/lib/daytrade/intraday'
import type { Holding } from '@/lib/types'

export interface BriefCard {
  priority: number // 1 = most important
  tag: 'MOVER' | 'NEWS' | 'SIGNAL' | 'QUALITY' | 'REBALANCE' | 'JOURNAL' | 'INFO'
  title: string
  body: string
  href: string
}

export interface MorningBrief {
  session: string
  generatedAt: string
  aiComposed: boolean
  cards: BriefCard[]
}

const r1 = (v: number) => Math.round(v * 10) / 10

interface BriefInputs {
  movers: { ticker: string; changePct: number }[]
  analytics: ReturnType<typeof buildAnalytics>
  recommendations: ReturnType<typeof generateRecommendations>
  headlines: { tickers: string[]; title: string; source: string }[]
  signal: { direction: string; confidence: number } | null
  thesisless: { ticker: string; description: string }[]
}

async function gatherInputs(): Promise<BriefInputs | null> {
  const holdings = await prisma.holding.findMany({ where: { quantity: { gt: 0 } } })
  if (holdings.length === 0) return null

  const rateRaw = await getKv('usdCadRate')
  const rate = rateRaw ? Number(rateRaw) : undefined
  const analytics = buildAnalytics(holdings as unknown as Holding[], Number.isFinite(rate) ? rate : undefined)
  const recommendations = generateRecommendations(analytics).slice(0, 3)

  const exchanges = Object.fromEntries(holdings.map((h) => [h.ticker, h.exchange]))
  const prices = await fetchPrices(holdings.map((h) => h.ticker), { noStore: true }, exchanges)
  const movers = prices
    .map((p) => ({ ticker: p.ticker, changePct: p.changePct }))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))

  const dayAgo = Date.now() - 24 * 3600_000
  const headlines = (await getRecentNews(40))
    .filter((h) => new Date(h.publishedAt).getTime() > dayAgo)
    .slice(0, 15)
    .map((h) => ({ tickers: h.tickers, title: h.title, source: h.source }))

  const latestSignal = await prisma.dayTradeSignal.findFirst({ orderBy: { session: 'desc' } })
  const today = toEt(Date.now() / 1000).date
  const signal =
    latestSignal && latestSignal.session === today
      ? { direction: latestSignal.direction, confidence: latestSignal.confidence }
      : null

  // Recent buys with no journal entry = missing thesis (learning-loop nudge).
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000)
  const recentBuys = await prisma.activity.findMany({
    where: { type: 'BUY', occurredAt: { gte: weekAgo } },
    orderBy: { occurredAt: 'desc' },
  })
  const thesisless: { ticker: string; description: string }[] = []
  const seen = new Set<string>()
  for (const buy of recentBuys) {
    if (!buy.ticker || seen.has(buy.ticker)) continue
    seen.add(buy.ticker)
    const entry = await prisma.journalEntry.findFirst({ where: { ticker: buy.ticker, date: { gte: weekAgo } } })
    const holding = holdings.find((h) => h.ticker === buy.ticker)
    if (!entry && (!holding || !holding.thesis)) thesisless.push({ ticker: buy.ticker, description: buy.description })
  }

  return { movers, analytics, recommendations, headlines, signal, thesisless: thesisless.slice(0, 2) }
}

/** Deterministic composition — always works, no AI needed. */
function composeRuleBased(inp: BriefInputs): BriefCard[] {
  const cards: BriefCard[] = []

  const topMover = inp.movers[0]
  if (topMover && Math.abs(topMover.changePct) >= 1.5) {
    const dir = topMover.changePct > 0 ? 'up' : 'down'
    const news = inp.headlines.find((h) => h.tickers.includes(topMover.ticker))
    cards.push({
      priority: 1,
      tag: 'MOVER',
      title: `${topMover.ticker} is ${dir} ${r1(Math.abs(topMover.changePct))}% today`,
      body: news ? `Likely driver: "${news.title}" (${news.source}). Check whether your thesis still holds.` : `Biggest move in your book today — check the tape and your thesis before reacting.`,
      href: '/insights',
    })
  }

  if (inp.signal && inp.signal.direction !== 'NEUTRAL' && inp.signal.confidence >= 55) {
    cards.push({
      priority: 2,
      tag: 'SIGNAL',
      title: `SPY day-trade signal: ${inp.signal.direction} (confidence ${inp.signal.confidence})`,
      body: 'The intraday ensemble fired above threshold. Review the defined-risk spread before acting — and only in a non-registered account.',
      href: '/daytrade',
    })
  }

  const rec = inp.recommendations[0]
  if (rec) {
    cards.push({
      priority: 3,
      tag: 'REBALANCE',
      title: `${rec.action} ${rec.ticker} — ${rec.rule}`,
      body: rec.reason,
      href: '/recommendations',
    })
  }

  const clusters = new Map<string, number>()
  for (const h of inp.headlines) for (const t of h.tickers) clusters.set(t, (clusters.get(t) ?? 0) + 1)
  const hot = [...clusters.entries()].sort((a, b) => b[1] - a[1])[0]
  if (hot && hot[1] >= 3) {
    cards.push({
      priority: 4,
      tag: 'NEWS',
      title: `${hot[0]} is in the news cycle (${hot[1]} fresh stories)`,
      body: inp.headlines.find((h) => h.tickers.includes(hot[0]))?.title ?? 'Multiple headlines in the last 24h.',
      href: '/news',
    })
  }

  for (const t of inp.thesisless) {
    cards.push({
      priority: 5,
      tag: 'JOURNAL',
      title: `You bought ${t.ticker} recently with no thesis on file`,
      body: `${t.description}. Two sentences now beats regret later — write down why you own it.`,
      href: `/journal?ticker=${t.ticker}`,
    })
  }

  const qb = inp.analytics.qualityBreakdown
  if (qb && cards.length < 5) {
    cards.push({
      priority: 6,
      tag: 'QUALITY',
      title: `Quality score ${qb.score}/100 — biggest lever: ${qb.biggestLever}`,
      body: qb.advice,
      href: '/',
    })
  }

  return cards.slice(0, 5).map((c, i) => ({ ...c, priority: i + 1 }))
}

async function composeWithAi(inp: BriefInputs): Promise<BriefCard[] | null> {
  try {
    const context = {
      movers: inp.movers.slice(0, 6),
      qualityScore: inp.analytics.qualityBreakdown,
      recommendations: inp.recommendations.map((r) => ({ action: r.action, ticker: r.ticker, reason: r.reason })),
      headlines: inp.headlines,
      dayTradeSignal: inp.signal,
      missingTheses: inp.thesisless,
      portfolio: { valueCAD: Math.round(inp.analytics.totalValueCAD), returnPct: r1(inp.analytics.totalReturnPct) },
    }
    const cards = await callClaudeJson<BriefCard[]>(
      `You are a senior portfolio analyst writing a morning brief for a retail investor. Given this JSON snapshot of their portfolio situation, produce the 3-5 most decision-relevant action cards, most important first.

Rules: be specific and direct; every card must be actionable (check / trim / write / review), not descriptive filler. Use plain English. Valid hrefs: "/" (dashboard), "/insights", "/news", "/recommendations", "/daytrade", "/rate", "/journal?ticker=X", "/holdings". Valid tags: MOVER, NEWS, SIGNAL, QUALITY, REBALANCE, JOURNAL, INFO.

Return ONLY a JSON array of {priority, tag, title, body, href}. Titles under 70 chars, bodies 1-2 sentences.

Snapshot:
${JSON.stringify(context)}`,
      { model: CLAUDE_FAST, maxTokens: 900 }
    )
    if (!Array.isArray(cards) || cards.length === 0) return null
    return cards.slice(0, 5).map((c, i) => ({
      priority: i + 1,
      tag: (c.tag as BriefCard['tag']) ?? 'INFO',
      title: String(c.title ?? '').slice(0, 90),
      body: String(c.body ?? ''),
      href: typeof c.href === 'string' && c.href.startsWith('/') ? c.href : '/',
    }))
  } catch (err) {
    console.error('AI brief composition failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function getMorningBrief(forceRefresh = false): Promise<MorningBrief | null> {
  const session = toEt(Date.now() / 1000).date
  const cacheKey = `morningBrief:${session}`

  if (!forceRefresh) {
    const cached = await getKv(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as MorningBrief
        // regenerate if older than 3 hours (markets move)
        if (Date.now() - new Date(parsed.generatedAt).getTime() < 3 * 3600_000) return parsed
      } catch {
        // fall through to regenerate
      }
    }
  }

  const inputs = await gatherInputs()
  if (!inputs) return null

  let cards: BriefCard[] | null = null
  let aiComposed = false
  if (hasClaudeKey()) {
    cards = await composeWithAi(inputs)
    aiComposed = cards != null
  }
  if (!cards) cards = composeRuleBased(inputs)

  const brief: MorningBrief = { session, generatedAt: new Date().toISOString(), aiComposed, cards }
  await setKv(cacheKey, JSON.stringify(brief))
  return brief
}
