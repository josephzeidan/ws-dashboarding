// Psychological round-number detection (spec §8.5). Tiered by magnitude with
// scale-appropriate subdivisions; floored at a sensible tick for sub-$10 names.

export interface RoundLevel {
  level: number
  weight: number
}

export function roundLevelsNear(price: number, lower: number, upper: number): RoundLevel | null {
  if (price <= 0) return null
  const mag = 10 ** Math.floor(Math.log10(price)) // 7000 -> 1000
  const tick = price < 10 ? 0.5 : price < 50 ? 1 : 5
  const tiers = [mag, mag / 2, mag / 10, mag / 20, Math.max(mag / 100, tick)]
  const weights = [1.0, 0.7, 0.45, 0.3, 0.15]

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]
    if (tier <= 0) continue
    const nearest = Math.round(price / tier) * tier
    if (nearest >= lower && nearest <= upper) {
      return { level: Math.round(nearest * 100) / 100, weight: weights[i] }
    }
  }
  return null
}

export function roundNumberScore(level: RoundLevel | null): number {
  return level ? 100 * level.weight : 0
}
