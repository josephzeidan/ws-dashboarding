// Is the North-American market open? TSX/NYSE regular session is
// Mon–Fri 09:30–16:00 America/Toronto. Holidays aren't modelled — on a holiday
// the poller simply runs at its slower off-hours cadence, which is harmless.

export function isMarketOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = get('weekday')
  if (weekday === 'Sat' || weekday === 'Sun') return false

  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  const minutes = hour * 60 + minute
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60
}
