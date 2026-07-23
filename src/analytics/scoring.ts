import type { Holding, HoldingWithWeight, PortfolioAnalytics, QualityBreakdown } from '@/lib/types'

const DEFAULT_USD_TO_CAD = 1.39 // fallback when no live rate is available

export function toCAD(value: number, currency: string, rate: number = DEFAULT_USD_TO_CAD): number {
  if (currency === 'CAD') return value
  return value * rate
}

export function buildAnalytics(holdings: Holding[], usdCadRate: number = DEFAULT_USD_TO_CAD): PortfolioAnalytics {
  // Compute total portfolio value in CAD
  const totalValueCAD = holdings.reduce((sum, h) => sum + toCAD(h.marketValue, h.marketValueCurrency, usdCadRate), 0)
  const totalCostCAD = holdings.reduce((sum, h) => sum + h.bookValueCAD, 0)
  const totalReturnCAD = totalValueCAD - totalCostCAD
  const totalReturnPct = totalCostCAD ? (totalReturnCAD / totalCostCAD) * 100 : 0

  // Enrich holdings with weight and G/L
  const enriched: HoldingWithWeight[] = holdings.map((h) => {
    const valueCAD = toCAD(h.marketValue, h.marketValueCurrency, usdCadRate)
    const weightPct = totalValueCAD ? (valueCAD / totalValueCAD) * 100 : 0
    const glPct = h.bookValueMkt ? ((h.marketValue - h.bookValueMkt) / h.bookValueMkt) * 100 : 0
    return { ...h, weightPct, glPct }
  })

  // HHI concentration index
  const hhi = enriched.reduce((sum, h) => {
    const w = h.weightPct / 100
    return sum + w * w
  }, 0)

  // Bucket allocation
  const bucketAllocation: Record<string, number> = {}
  for (const h of enriched) {
    bucketAllocation[h.bucket] = (bucketAllocation[h.bucket] ?? 0) + h.weightPct
  }

  // Theme allocation
  const themeAllocation: Record<string, number> = {}
  for (const h of enriched) {
    themeAllocation[h.theme] = (themeAllocation[h.theme] ?? 0) + h.weightPct
  }

  // Scores
  const avgConviction = holdings.reduce((s, h) => s + h.conviction, 0) / holdings.length
  const diversificationScore = Math.min(10, Math.round((1 - hhi) * 10 * 10) / 10)

  // Portfolio quality score (0–100)
  const convictionScore = (avgConviction / 10) * 30
  const diversificationComponent = diversificationScore * 3
  const hhiPenalty = hhi > 0.15 ? 10 : hhi > 0.1 ? 5 : 0
  const qualityScore = Math.min(100, Math.round(convictionScore + diversificationComponent - hhiPenalty + 20))

  const qualityBreakdown = buildQualityBreakdown(
    enriched,
    qualityScore,
    convictionScore,
    diversificationComponent,
    diversificationScore,
    hhiPenalty,
    hhi,
    avgConviction
  )

  return {
    totalValueCAD,
    totalCostCAD,
    totalReturnCAD,
    totalReturnPct,
    holdings: enriched,
    qualityScore,
    qualityBreakdown,
    hhi,
    diversificationScore,
    avgConviction,
    bucketAllocation,
    themeAllocation,
  }
}

// Decompose the quality score into its drivers and identify the biggest lever
// to raise it — mirrors the exact formula above so the math always agrees.
function buildQualityBreakdown(
  holdings: HoldingWithWeight[],
  qualityScore: number,
  convictionScore: number,
  diversificationComponent: number,
  diversificationScore: number,
  hhiPenalty: number,
  hhi: number,
  avgConviction: number
): QualityBreakdown {
  const convictionHeadroom = 30 - convictionScore // toward avg conviction of 10
  const diversificationHeadroom = 30 - diversificationComponent // toward diversification score of 10
  const concentrationHeadroom = hhiPenalty // removing the penalty entirely

  const components: QualityBreakdown['components'] = [
    { key: 'base', label: 'Base', points: 20, max: 20, headroom: 0 },
    { key: 'conviction', label: 'Conviction', points: round1(convictionScore), max: 30, headroom: round1(convictionHeadroom) },
    { key: 'diversification', label: 'Diversification', points: round1(diversificationComponent), max: 30, headroom: round1(diversificationHeadroom) },
    { key: 'concentration', label: 'Concentration penalty', points: round1(-hhiPenalty), max: 0, headroom: round1(concentrationHeadroom) },
  ]

  const topHolding = [...holdings].sort((a, b) => b.weightPct - a.weightPct)[0]
  const lowConviction = [...holdings]
    .filter((h) => h.conviction <= 6)
    .sort((a, b) => a.conviction - b.conviction)
    .slice(0, 3)

  // Pick the lever with the most recoverable points.
  const levers: { key: string; gain: number }[] = [
    { key: 'diversification', gain: diversificationHeadroom },
    { key: 'conviction', gain: convictionHeadroom },
    { key: 'concentration', gain: concentrationHeadroom },
  ].sort((a, b) => b.gain - a.gain)
  const top = levers[0]

  let biggestLever: string
  let advice: string
  if (top.key === 'concentration' && concentrationHeadroom > 0) {
    biggestLever = 'Concentration'
    advice = topHolding
      ? `Your portfolio is concentrated (HHI ${hhi.toFixed(3)}). Trimming ${topHolding.ticker} (${topHolding.weightPct.toFixed(1)}% of the book) below the threshold removes a ${hhiPenalty}-point penalty.`
      : `Reduce your largest positions to clear the ${hhiPenalty}-point concentration penalty.`
  } else if (top.key === 'diversification') {
    biggestLever = 'Diversification'
    advice = topHolding
      ? `Diversification is your biggest lever (+${round1(diversificationHeadroom)} pts available). Spreading weight away from your largest names (e.g. ${topHolding.ticker} at ${topHolding.weightPct.toFixed(1)}%) raises it — every diversification point is worth ~3 score points.`
      : `Spread weight more evenly across holdings — each diversification point is worth ~3 score points.`
  } else {
    biggestLever = 'Conviction'
    advice = lowConviction.length
      ? `Conviction is your biggest lever (+${round1(convictionHeadroom)} pts available). Your average is ${avgConviction.toFixed(1)}/10 — revisit your lowest-conviction holdings (${lowConviction.map((h) => `${h.ticker} ${h.conviction}/10`).join(', ')}): either build a stronger thesis (raise the score) or replace them.`
      : `Raise conviction across the book — average is ${avgConviction.toFixed(1)}/10, and each average point adds ~3 score points.`
  }

  return {
    score: qualityScore,
    components,
    biggestLever,
    advice,
    drags: lowConviction.map((h) => ({ ticker: h.ticker, conviction: h.conviction, weightPct: round1(h.weightPct) })),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function generateRecommendations(analytics: PortfolioAnalytics) {
  const recs = []
  const { holdings } = analytics

  for (const h of holdings) {
    const overweight = h.weightPct - h.targetPct
    const underweight = h.targetPct - h.weightPct

    // High concentration warning
    if (h.weightPct > 20) {
      recs.push({
        action: 'TRIM' as const,
        ticker: h.ticker,
        priority: 'HIGH' as const,
        confidence: 88,
        reason: `${h.ticker} is at ${h.weightPct.toFixed(1)}% of portfolio — above 20% concentration threshold. Trim ~$${Math.round((h.weightPct - h.targetPct) / 100 * analytics.totalValueCAD)} CAD to bring toward ${h.targetPct}% target.`,
        rule: 'Concentration > 20% threshold',
      })
    }
    // Significantly overweight
    else if (overweight > 4 && h.conviction >= 7) {
      recs.push({
        action: 'TRIM' as const,
        ticker: h.ticker,
        priority: 'MEDIUM' as const,
        confidence: 72,
        reason: `${h.ticker} is ${overweight.toFixed(1)}% overweight vs target. Consider trimming to rebalance.`,
        rule: 'Overweight > 4% vs target',
      })
    }

    // Low conviction + underperforming
    if (h.conviction <= 5 && h.glPct < -5) {
      recs.push({
        action: 'REPLACE' as const,
        ticker: h.ticker,
        priority: 'HIGH' as const,
        confidence: 75,
        reason: `${h.ticker} has low conviction (${h.conviction}/10) and is down ${h.glPct.toFixed(1)}%. Consider replacing with higher-conviction exposure in the same theme.`,
        rule: 'Low conviction + underperformance',
      })
    }

    // High conviction, meaningfully underweight
    if (h.conviction >= 8 && underweight > 2) {
      recs.push({
        action: 'ADD' as const,
        ticker: h.ticker,
        priority: 'MEDIUM' as const,
        confidence: 78,
        reason: `${h.ticker} is ${underweight.toFixed(1)}% underweight vs ${h.targetPct}% target with conviction ${h.conviction}/10. Consider adding on any pullback.`,
        rule: 'High conviction + underweight',
      })
    }

    // Big unrealized loss with low conviction
    if (h.glPct < -15 && h.conviction < 6) {
      recs.push({
        action: 'SELL' as const,
        ticker: h.ticker,
        priority: 'MEDIUM' as const,
        confidence: 65,
        reason: `${h.ticker} is down ${Math.abs(h.glPct).toFixed(1)}% with conviction at ${h.conviction}/10. Review whether thesis is still intact.`,
        rule: 'Large loss + low conviction',
      })
    }
  }

  // Dedup — one rec per ticker, highest priority wins
  const seen = new Set<string>()
  const deduped = []
  for (const r of recs) {
    if (!seen.has(r.ticker)) {
      seen.add(r.ticker)
      deduped.push(r)
    }
  }

  return deduped.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return order[a.priority] - order[b.priority]
  })
}
