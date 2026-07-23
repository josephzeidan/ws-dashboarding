// Wealth-goal projection: compounds the current portfolio + monthly
// contributions at an assumed CAGR, and tells the user whether they're on
// track for the target by the target date.

import { prisma } from '@/lib/prisma'

export interface GoalProjection {
  targetAmount: number
  targetDate: string
  monthlyContribution: number
  assumedCagrPct: number
  currentValue: number
  monthsRemaining: number
  projectedValue: number // at the target date, assumed CAGR
  onTrack: boolean
  shortfall: number // projected - target (negative = behind)
  requiredCagrPct: number // CAGR needed to exactly hit target
  requiredMonthly: number // monthly needed at assumed CAGR to hit target
  curve: { month: number; projected: number; contributions: number }[]
}

const DEFAULT_TARGET_YEARS = 20

export async function getGoal() {
  let goal = await prisma.goal.findFirst()
  if (!goal) {
    goal = await prisma.goal.create({
      data: {
        targetAmount: 1_000_000,
        targetDate: new Date(Date.now() + DEFAULT_TARGET_YEARS * 365 * 24 * 3600_000),
        monthlyContribution: 500,
        assumedCagrPct: 8,
      },
    })
  }
  return goal
}

async function currentPortfolioCAD(): Promise<number> {
  const holdings = await prisma.holding.findMany({ where: { quantity: { gt: 0 } }, select: { marketValue: true, marketValueCurrency: true } })
  const kv = await prisma.kV.findUnique({ where: { key: 'usdCadRate' } })
  const rate = kv ? Number(kv.value) : 1.39
  const holdingsVal = holdings.reduce((s, h) => s + (h.marketValueCurrency === 'CAD' ? h.marketValue : h.marketValue * rate), 0)
  const account = await prisma.wsAccount.findFirst({ where: { type: 'tfsa' } })
  return holdingsVal + (account?.cashCAD ?? 0)
}

// Future value of a present sum + monthly contributions at a monthly rate.
function futureValue(pv: number, monthly: number, monthlyRate: number, months: number): number {
  const growthPv = pv * Math.pow(1 + monthlyRate, months)
  const growthContrib = monthlyRate === 0 ? monthly * months : monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate)
  return growthPv + growthContrib
}

export async function buildProjection(): Promise<GoalProjection> {
  const goal = await getGoal()
  const currentValue = await currentPortfolioCAD()
  const now = Date.now()
  const monthsRemaining = Math.max(1, Math.round((new Date(goal.targetDate).getTime() - now) / (30.44 * 24 * 3600_000)))
  const monthlyRate = Math.pow(1 + goal.assumedCagrPct / 100, 1 / 12) - 1

  const projectedValue = futureValue(currentValue, goal.monthlyContribution, monthlyRate, monthsRemaining)
  const shortfall = projectedValue - goal.targetAmount

  // Required monthly contribution to hit target at the assumed CAGR.
  const fvOfCurrent = currentValue * Math.pow(1 + monthlyRate, monthsRemaining)
  const annuityFactor = monthlyRate === 0 ? monthsRemaining : (Math.pow(1 + monthlyRate, monthsRemaining) - 1) / monthlyRate
  const requiredMonthly = Math.max(0, (goal.targetAmount - fvOfCurrent) / annuityFactor)

  // Required CAGR (bisection) to hit target with current contributions.
  let lo = 0
  let hi = 0.5 // 50% monthly is absurd — plenty of headroom
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const fv = futureValue(currentValue, goal.monthlyContribution, mid, monthsRemaining)
    if (fv < goal.targetAmount) lo = mid
    else hi = mid
  }
  const requiredCagrPct = (Math.pow(1 + (lo + hi) / 2, 12) - 1) * 100

  // Projection curve (sampled ~24 points).
  const step = Math.max(1, Math.round(monthsRemaining / 24))
  const curve: GoalProjection['curve'] = []
  for (let m = 0; m <= monthsRemaining; m += step) {
    curve.push({
      month: m,
      projected: Math.round(futureValue(currentValue, goal.monthlyContribution, monthlyRate, m)),
      contributions: Math.round(currentValue + goal.monthlyContribution * m),
    })
  }

  return {
    targetAmount: goal.targetAmount,
    targetDate: new Date(goal.targetDate).toISOString().slice(0, 10),
    monthlyContribution: goal.monthlyContribution,
    assumedCagrPct: goal.assumedCagrPct,
    currentValue: Math.round(currentValue),
    monthsRemaining,
    projectedValue: Math.round(projectedValue),
    onTrack: shortfall >= 0,
    shortfall: Math.round(shortfall),
    requiredCagrPct: Math.round(requiredCagrPct * 10) / 10,
    requiredMonthly: Math.round(requiredMonthly),
    curve,
  }
}
