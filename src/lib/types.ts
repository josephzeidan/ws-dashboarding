export interface Holding {
  id: string
  ticker: string
  name: string
  exchange: string
  securityType: string
  quantity: number
  bookValueCAD: number
  bookValueMkt: number
  bookValueMktCurrency: string
  marketPrice: number
  marketPriceCurrency: string
  marketValue: number
  marketValueCurrency: string
  unrealizedReturn: number
  unrealizedReturnCurrency: string
  bucket: string
  theme: string
  conviction: number
  horizon: string
  targetPct: number
  thesis: string
  updatedAt: string
}

export interface QualityComponent {
  key: 'conviction' | 'diversification' | 'concentration' | 'base'
  label: string
  points: number // current contribution to the score
  max: number // best achievable contribution
  headroom: number // max - points (0 for base)
}

export interface QualityBreakdown {
  score: number
  components: QualityComponent[]
  biggestLever: string // which component to improve first
  advice: string // concrete, portfolio-specific suggestion
  drags: { ticker: string; conviction: number; weightPct: number }[] // low-conviction / oversized names
}

export interface PortfolioAnalytics {
  totalValueCAD: number
  totalCostCAD: number
  totalReturnCAD: number
  totalReturnPct: number
  holdings: HoldingWithWeight[]
  qualityScore: number
  qualityBreakdown: QualityBreakdown
  hhi: number
  diversificationScore: number
  avgConviction: number
  bucketAllocation: Record<string, number>
  themeAllocation: Record<string, number>
}

export interface HoldingWithWeight extends Holding {
  weightPct: number
  glPct: number
}

export interface Recommendation {
  action: 'ADD' | 'TRIM' | 'SELL' | 'REPLACE' | 'HOLD' | 'WATCH'
  ticker: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  confidence: number
  reason: string
  rule: string
  suggestedAmount?: number
}

export interface PriceUpdate {
  ticker: string
  price: number
  currency: string
  timestamp: string
}

export interface WatchlistItem {
  id: string
  ticker: string
  name: string
  theme: string
  notes: string
  alertPrice: number | null
  createdAt: string
}

export interface MacroTrend {
  id: string
  name: string
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  drivers: string[]
  risks: string[]
  tickers: string[]
}

export interface JournalEntry {
  id: string
  ticker: string | null
  title: string
  body: string
  tags: string[]
  date: string
}
