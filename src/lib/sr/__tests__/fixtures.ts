import type { Bar, NormBar } from '@/lib/market-data/provider'

let t = 1_700_000_000_000
const STEP = 3_600_000

/** Build a bar; auto-increments time. */
export function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  const b = { t, o, h, l, c, v }
  t += STEP
  return b
}

export function resetTime() {
  t = 1_700_000_000_000
}

export function norm(bars: Bar[]): NormBar[] {
  return bars.map((b) => ({ ...b, isSessionOpen: false }))
}

/** A clean zigzag: `peaks` up/down legs of `legBars` bars each, amplitude `amp`. */
export function zigzag(legs: number, legBars: number, base: number, amp: number): NormBar[] {
  resetTime()
  const out: Bar[] = []
  let price = base
  for (let leg = 0; leg < legs; leg++) {
    const up = leg % 2 === 0
    for (let i = 0; i < legBars; i++) {
      const next = price + (up ? amp / legBars : -amp / legBars)
      const h = Math.max(price, next) + 0.1
      const l = Math.min(price, next) - 0.1
      out.push(bar(price, h, l, next))
      price = next
    }
  }
  return norm(out)
}
