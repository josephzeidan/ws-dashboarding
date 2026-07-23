// Intraday bar data from Yahoo's keyless chart endpoint, normalized to
// America/New_York session time so opening-range math is exact.

export interface Bar {
  ts: number // unix seconds
  et: { date: string; minutes: number } // ET session date "YYYY-MM-DD" + minutes since midnight
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const ET_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function toEt(tsSeconds: number): { date: string; minutes: number } {
  const parts = ET_FMT.formatToParts(new Date(tsSeconds * 1000))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  // en-CA gives YYYY-MM-DD ordering
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const hour = Number(get('hour')) % 24
  return { date, minutes: hour * 60 + Number(get('minute')) }
}

export const SESSION_OPEN = 9 * 60 + 30 // 09:30 ET
export const SESSION_CLOSE = 16 * 60 // 16:00 ET
export const RANGE_END = 10 * 60 // 10:00 ET — end of opening range

export async function fetchBars(symbol: string, interval: '1m' | '5m', range: string): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status}`)
  const data = await res.json()
  const result = data?.chart?.result?.[0]
  const ts: number[] = result?.timestamp ?? []
  const q = result?.indicators?.quote?.[0] ?? {}
  const bars: Bar[] = []
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i]
    const high = q.high?.[i]
    const low = q.low?.[i]
    const close = q.close?.[i]
    if (open == null || high == null || low == null || close == null) continue
    const et = toEt(ts[i])
    // regular session only
    if (et.minutes < SESSION_OPEN || et.minutes >= SESSION_CLOSE) continue
    bars.push({ ts: ts[i], et, open, high, low, close, volume: q.volume?.[i] ?? 0 })
  }
  return bars
}

/** Group bars by ET session date, in chronological order. */
export function groupBySession(bars: Bar[]): { date: string; bars: Bar[] }[] {
  const map = new Map<string, Bar[]>()
  for (const b of bars) {
    const list = map.get(b.et.date) ?? []
    list.push(b)
    map.set(b.et.date, list)
  }
  return [...map.entries()].map(([date, list]) => ({ date, bars: list }))
}

/** Cumulative session VWAP series (one value per bar). */
export function vwapSeries(bars: Bar[]): number[] {
  let pv = 0
  let vol = 0
  return bars.map((b) => {
    const typical = (b.high + b.low + b.close) / 3
    pv += typical * b.volume
    vol += b.volume
    return vol > 0 ? pv / vol : b.close
  })
}
