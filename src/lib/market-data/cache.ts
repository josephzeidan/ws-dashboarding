// Prisma-backed OHLCV cache + staleness policy (spec §3.4). Cache-first reads:
// if the newest cached bar is within one bar-interval and inside TTL, serve it;
// otherwise refetch from the provider and upsert.

import { prisma } from '@/lib/prisma'
import { Bar, GetBarsParams, Timeframe } from './provider'
import { yahooProvider } from './providers/yahoo'

const provider = yahooProvider

const BAR_MS: Record<Timeframe, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1D': 86_400_000, '1W': 604_800_000,
}

const BAR_TTL_MS: Record<Timeframe, number> = {
  '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 900_000,
  '1h': 3_600_000, '4h': 3_600_000, '1D': 12 * 3_600_000, '1W': 24 * 3_600_000,
}

export const ANALYSIS_TTL_MS: Record<Timeframe, number> = {
  '1m': 60_000, '5m': 180_000, '15m': 300_000, '30m': 300_000,
  '1h': 900_000, '4h': 900_000, '1D': 6 * 3_600_000, '1W': 12 * 3_600_000,
}

/** Cache-first bar fetch. */
export async function getBarsCached(params: GetBarsParams): Promise<Bar[]> {
  const symbol = params.symbol.trim().toUpperCase()
  const { timeframe, session, limit } = params

  const newest = await prisma.ohlcvBar.findFirst({
    where: { symbol, timeframe, session },
    orderBy: { t: 'desc' },
  })

  const now = Date.now()
  const barMs = BAR_MS[timeframe]
  const ttl = BAR_TTL_MS[timeframe]
  const fresh =
    newest != null &&
    now - newest.fetchedAt.getTime() < ttl &&
    now - Number(newest.t) < barMs * 2 // newest bar no older than ~1 interval

  if (!fresh) {
    const fetched = await provider.getBars(params)
    if (fetched.length > 0) {
      // Upsert in a transaction-ish batch (SQLite is local; sequential is fine).
      await prisma.$transaction(
        fetched.map((b) =>
          prisma.ohlcvBar.upsert({
            where: { symbol_timeframe_t_session: { symbol, timeframe, t: BigInt(b.t), session } },
            update: { o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, fetchedAt: new Date() },
            create: { symbol, timeframe, t: BigInt(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, adjusted: params.adjusted, session },
          })
        )
      )
    }
  }

  const rows = await prisma.ohlcvBar.findMany({
    where: { symbol, timeframe, session },
    orderBy: { t: 'desc' },
    take: limit,
  })
  return rows
    .reverse()
    .map((r) => ({ t: Number(r.t), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
}

export async function searchSymbols(query: string) {
  return provider.searchSymbols(query)
}

export function providerName(): string {
  return provider.name
}
