// Normalisation (spec §3.3) — the rules that silently corrupt an S/R engine
// if skipped: split/div adjustment (done in the adapter via adjclose), session
// filtering, gap flagging, bad-tick rejection, minimum-data enforcement.
// Also hosts ET/session helpers and the 4h resampler used by the Yahoo adapter.

import { Bar, InsufficientDataError, NormBar, Timeframe } from './provider'

const INTRADAY: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h']
export function isIntraday(tf: Timeframe): boolean {
  return INTRADAY.includes(tf)
}

const ET = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hour12: false,
})

export interface EtParts {
  date: string // YYYY-MM-DD (ET)
  minutes: number // minutes since ET midnight
  weekday: string // Mon..Sun
}

export function etParts(tsMs: number): EtParts {
  const parts = ET.formatToParts(new Date(tsMs))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const hour = Number(get('hour')) % 24
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
    weekday: get('weekday'),
  }
}

const RTH_OPEN = 9 * 60 + 30
const RTH_CLOSE = 16 * 60

/** Regular-hours check for equities (Mon–Fri 09:30–16:00 ET). */
export function isRegularSession(tsMs: number): boolean {
  const p = etParts(tsMs)
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false
  return p.minutes >= RTH_OPEN && p.minutes < RTH_CLOSE
}

/** Resample intraday bars into fixed 4-hour UTC buckets (Yahoo has no native 4h). */
export function resampleTo4h(bars: Bar[]): Bar[] {
  const bucketMs = 4 * 3600_000
  const map = new Map<number, Bar>()
  const order: number[] = []
  for (const b of bars) {
    const key = Math.floor(b.t / bucketMs) * bucketMs
    const existing = map.get(key)
    if (!existing) {
      map.set(key, { t: key, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })
      order.push(key)
    } else {
      existing.h = Math.max(existing.h, b.h)
      existing.l = Math.min(existing.l, b.l)
      existing.c = b.c // last close wins
      existing.v += b.v
    }
  }
  return order.map((k) => map.get(k)!)
}

/** Generic validation + gap flagging. Throws InsufficientDataError below minBars. */
export function normalizeBars(bars: Bar[], tf: Timeframe, minBars: number): NormBar[] {
  const intraday = isIntraday(tf)
  const out: NormBar[] = []
  let prevDate: string | null = null

  for (const b of bars) {
    // rule 5: drop synthetic zero-volume fills
    if (b.v === 0 && b.o === b.h && b.h === b.l && b.l === b.c) continue
    // rule 6: bad-tick rejection
    if (b.h < b.l) continue
    if (b.h < Math.max(b.o, b.c) - 1e-9) continue
    if (b.l > Math.min(b.o, b.c) + 1e-9) continue
    if (intraday && b.l > 0 && b.h / b.l - 1 > 0.5) continue // absurd intraday range = bad print
    if (!isFinite(b.o) || !isFinite(b.h) || !isFinite(b.l) || !isFinite(b.c)) continue

    let isSessionOpen = false
    if (intraday) {
      const d = etParts(b.t).date
      if (d !== prevDate) isSessionOpen = true // first bar of a new ET day = gap bar
      prevDate = d
    }
    out.push({ ...b, isSessionOpen })
  }

  if (out.length < minBars) throw new InsufficientDataError(out.length, minBars)
  return out
}
