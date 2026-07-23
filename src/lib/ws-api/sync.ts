// Sync engine: pulls positions / cash / activities from the WS API into the
// local DB. Mirrors the metadata-preserving upsert semantics of /api/import —
// broker-owned columns only; bucket/conviction/thesis/theme/targets are never
// touched. All entry points map failures to the WsApiError taxonomy.

import { prisma } from '@/lib/prisma'
import { getKv, setKv } from '@/lib/kv'
import { getIdentityId, wsGraphql } from './client'
import {
  WsApiError,
  WsAuthExpiredError,
  WsRateLimitError,
  WsSchemaError,
} from './errors'
import { markSynced, setSessionStatus } from './session-store'
import {
  zAccounts,
  zActivities,
  zBalanceAccounts,
  zPositions,
  zSecurityMarketData,
  WsActivity,
} from './types'

const KV_TFSA_ID = 'wsTfsaAccountId'
const KV_USDCAD = 'usdCadRate'
const FALLBACK_USDCAD = 1.39

async function usdCadRate(): Promise<number> {
  const raw = await getKv(KV_USDCAD)
  const rate = raw ? Number(raw) : NaN
  return Number.isFinite(rate) && rate > 0 ? rate : FALLBACK_USDCAD
}

function toCad(amount: number, currency: string, rate: number): number {
  return currency === 'CAD' ? amount : amount * rate
}

/** Find the open TFSA account, persist it as WsAccount, cache its id. */
export async function resolveTfsaAccount(): Promise<string> {
  const identityId = await getIdentityId()
  const raw = await wsGraphql(
    'FetchAllAccountFinancials',
    { pageSize: 25, identityId },
    { path: 'identity.accounts.edges', loadAllPages: true }
  )
  const parsed = zAccounts.safeParse(raw)
  if (!parsed.success) throw new WsSchemaError('Unexpected accounts response shape', parsed.error.issues)

  const accounts = parsed.data.filter((a) => (a.status ?? 'open') === 'open')
  const tfsa = accounts.find((a) => {
    const t = `${a.unifiedAccountType ?? ''} ${a.type ?? ''}`.toLowerCase()
    return t.includes('tfsa')
  })
  if (!tfsa) throw new WsSchemaError('No open TFSA account found on this Wealthsimple identity')

  const netValue = tfsa.financials?.currentCombined?.netLiquidationValue
  await prisma.wsAccount.upsert({
    where: { id: tfsa.id },
    update: {
      description: tfsa.nickname || tfsa.description || 'TFSA',
      type: 'tfsa',
      currency: tfsa.currency ?? 'CAD',
      ...(netValue?.amount != null ? { netValueCAD: netValue.amount } : {}),
    },
    create: {
      id: tfsa.id,
      description: tfsa.nickname || tfsa.description || 'TFSA',
      type: 'tfsa',
      currency: tfsa.currency ?? 'CAD',
      netValueCAD: netValue?.amount ?? 0,
    },
  })
  await setKv(KV_TFSA_ID, tfsa.id)
  return tfsa.id
}

async function tfsaAccountId(): Promise<string> {
  return (await getKv(KV_TFSA_ID)) ?? resolveTfsaAccount()
}

/** Pull positions + cash for the TFSA and upsert Holdings (metadata preserved). */
export async function syncPositions(): Promise<{ updated: number; created: number; zeroed: number }> {
  const identityId = await getIdentityId()
  const accountId = await resolveTfsaAccount() // also refreshes net value
  const rate = await usdCadRate()

  const raw = await wsGraphql(
    'FetchIdentityPositions',
    {
      identityId,
      currency: 'CAD',
      accountIds: [accountId],
      filter: { securityIds: null },
      includeSecurity: true,
      includeAccountData: false,
    },
    { path: 'identity.financials.current.positions.edges', loadAllPages: true }
  )
  const parsed = zPositions.safeParse(raw)
  if (!parsed.success) throw new WsSchemaError('Unexpected positions response shape', parsed.error.issues)

  let updated = 0
  let created = 0
  const seenTickers: string[] = []

  for (const p of parsed.data) {
    const ticker = p.security.stock?.symbol
    if (!ticker) continue // options/crypto legs without a stock symbol — skip for now
    seenTickers.push(ticker)

    const quantity = Number(p.quantity)
    const bookAmount = p.bookValue.amount ?? 0
    const bookCurrency = p.bookValue.currency
    const marketValue = p.totalValue.amount ?? 0
    const marketValueCurrency = p.totalValue.currency
    const quotePrice = p.security.quoteV2?.price != null ? Number(p.security.quoteV2.price) : null
    const marketPrice = quotePrice ?? (quantity > 0 ? marketValue / quantity : 0)
    const marketPriceCurrency = p.security.quoteV2?.currency ?? marketValueCurrency
    const unrealized = p.unrealizedReturns.amount ?? 0
    const unrealizedCurrency = p.unrealizedReturns.currency

    const brokerFields = {
      quantity,
      bookValueCAD: toCad(bookAmount, bookCurrency, rate),
      bookValueMkt: bookAmount,
      bookValueMktCurrency: bookCurrency,
      marketPrice,
      marketPriceCurrency,
      marketValue,
      marketValueCurrency,
      unrealizedReturn: unrealized,
      unrealizedReturnCurrency: unrealizedCurrency,
    }

    const existing = await prisma.holding.findUnique({ where: { ticker } })
    if (existing) {
      await prisma.holding.update({ where: { ticker }, data: brokerFields })
      updated++
    } else {
      await prisma.holding.create({
        data: {
          ticker,
          name: p.security.stock?.name ?? ticker,
          exchange: p.security.stock?.primaryExchange ?? '',
          securityType: p.security.securityType ?? 'Equity',
          ...brokerFields,
          bucket: 'Tactical',
          theme: '',
          conviction: 7,
          horizon: 'MEDIUM',
          targetPct: 0,
          thesis: '',
        },
      })
      created++
    }
  }

  // Sold-out positions: zero the quantity, keep the row (thesis preserved).
  // Only when WS returned a sane, non-empty portfolio.
  let zeroed = 0
  if (seenTickers.length > 0) {
    const res = await prisma.holding.updateMany({
      where: { ticker: { notIn: seenTickers }, quantity: { gt: 0 } },
      data: { quantity: 0, marketValue: 0 },
    })
    zeroed = res.count
  }

  await syncCash(accountId)
  await markSynced()
  await setSessionStatus('connected')
  await prisma.importLog.create({
    data: {
      filename: 'wealthsimple-api',
      rows: seenTickers.length,
      status: 'success',
      message: `WS sync: ${updated} updated, ${created} created, ${zeroed} zeroed`,
    },
  })

  return { updated, created, zeroed }
}

async function syncCash(accountId: string): Promise<void> {
  const raw = await wsGraphql(
    'FetchAccountsWithBalance',
    { type: 'TRADING', ids: [accountId] },
    { path: 'accounts' }
  )
  const parsed = zBalanceAccounts.safeParse(raw)
  if (!parsed.success) throw new WsSchemaError('Unexpected balances response shape', parsed.error.issues)

  let cashCAD = 0
  let cashUSD = 0
  for (const account of parsed.data) {
    for (const custodian of account.custodianAccounts) {
      for (const balance of custodian.financials?.balance ?? []) {
        if (balance.securityId === 'sec-c-cad') cashCAD += Number(balance.quantity)
        if (balance.securityId === 'sec-c-usd') cashUSD += Number(balance.quantity)
      }
    }
  }
  await prisma.wsAccount.update({ where: { id: accountId }, data: { cashCAD, cashUSD } })
}

// --- activities --------------------------------------------------------------

const symbolCache = (globalThis as any).__wsSymbolCache ?? new Map<string, string>()
;(globalThis as any).__wsSymbolCache = symbolCache

async function securityIdToSymbol(securityId: string): Promise<string> {
  if (symbolCache.has(securityId)) return symbolCache.get(securityId)!
  try {
    const raw = await wsGraphql('FetchSecurityMarketData', { id: securityId }, { path: 'security' })
    const parsed = zSecurityMarketData.safeParse(raw)
    const symbol = parsed.success ? parsed.data.stock?.symbol ?? '' : ''
    symbolCache.set(securityId, symbol)
    return symbol
  } catch {
    return '' // delisted / special securities — leave blank
  }
}

function mapActivityType(rawType: string): string {
  const t = rawType.toUpperCase()
  if (t.endsWith('_BUY')) return 'BUY'
  if (t.endsWith('_SELL')) return 'SELL'
  if (t === 'DIVIDEND') return 'DIVIDEND'
  if (t === 'DEPOSIT') return 'DEPOSIT'
  if (t === 'WITHDRAWAL') return 'WITHDRAWAL'
  if (t === 'FEE' || t === 'MANAGEMENT_FEE') return 'FEE'
  if (t === 'INTEREST') return 'INTEREST'
  return 'OTHER'
}

function isIgnorableActivity(a: WsActivity): boolean {
  const status = (a.status ?? '').toLowerCase()
  const type = (a.type ?? '').toUpperCase()
  if (type === 'LEGACY_TRANSFER') return true
  return ['rejected', 'cancelled', 'expired'].some((s) => status.includes(s))
}

function describeActivity(type: string, ticker: string, quantity: number | null, price: number | null, amount: number | null, currency: string): string {
  const fmtMoney = (v: number) => v.toLocaleString('en-CA', { style: 'currency', currency: currency === 'USD' ? 'USD' : 'CAD' })
  if (type === 'BUY' || type === 'SELL') {
    const verb = type === 'BUY' ? 'Bought' : 'Sold'
    if (quantity && price) return `${verb} ${quantity} × ${ticker || '?'} @ ${fmtMoney(price)}`
    return `${verb} ${ticker || '?'}`
  }
  if (type === 'DIVIDEND') return `Dividend — ${ticker || '?'}${amount != null ? ` (${fmtMoney(amount)})` : ''}`
  if (type === 'DEPOSIT') return `Deposit${amount != null ? ` ${fmtMoney(amount)}` : ''}`
  if (type === 'WITHDRAWAL') return `Withdrawal${amount != null ? ` ${fmtMoney(amount)}` : ''}`
  if (type === 'INTEREST') return `Interest${amount != null ? ` ${fmtMoney(amount)}` : ''}`
  return ticker ? `${type} — ${ticker}` : type
}

export interface NewActivity {
  id: string
  type: string
  ticker: string
  description: string
  quantity: number | null
  price: number | null
  amount: number | null
  currency: string
  occurredAt: string
}

/** Pull the activity feed, insert unseen items, return the newly inserted ones
 *  (newest first). First-ever sync backfills the full history. */
export async function syncActivities(): Promise<NewActivity[]> {
  const accountId = await tfsaAccountId()
  const existingCount = await prisma.activity.count()
  const firstSync = existingCount === 0

  const endDate = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10)
  const raw = await wsGraphql(
    'FetchActivityFeedItems',
    {
      orderBy: 'OCCURRED_AT_DESC',
      first: 50,
      condition: { startDate: null, endDate, accountIds: [accountId] },
    },
    { path: 'activityFeedItems.edges', loadAllPages: firstSync }
  )
  const parsed = zActivities.safeParse(raw)
  if (!parsed.success) throw new WsSchemaError('Unexpected activities response shape', parsed.error.issues)

  const items = parsed.data.filter((a) => !isIgnorableActivity(a))
  if (items.length === 0) return []

  const ids = items.map((a) => a.canonicalId)
  const known = new Set(
    (await prisma.activity.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id)
  )

  const created: NewActivity[] = []
  for (const a of items) {
    if (known.has(a.canonicalId)) continue
    const type = mapActivityType(a.type ?? '')
    const quantity = a.assetQuantity != null ? Number(a.assetQuantity) : null
    const amount = a.amount != null ? Number(a.amount) : null
    const price = quantity && amount ? Math.round((amount / quantity) * 10000) / 10000 : null
    let ticker = a.assetSymbol ?? ''
    if (!ticker && (type === 'BUY' || type === 'SELL' || type === 'DIVIDEND') && a.securityId) {
      ticker = await securityIdToSymbol(a.securityId)
    }
    const currency = a.currency ?? 'CAD'
    const description = describeActivity(type, ticker, quantity, price, amount, currency)

    await prisma.activity.create({
      data: {
        id: a.canonicalId,
        accountId: a.accountId ?? accountId,
        type,
        subType: [a.type, a.subType].filter(Boolean).join('/'),
        ticker,
        description,
        quantity,
        price,
        amount,
        currency,
        status: a.status ?? '',
        occurredAt: new Date(a.occurredAt),
        seen: firstSync, // don't toast the entire backfilled history
      },
    })
    // Learning loop: auto-draft a journal stub for real (non-backfilled) trades
    // so every fill prompts a rationale. Skipped on the first bulk sync.
    if (!firstSync && (type === 'BUY' || type === 'SELL') && ticker) {
      try {
        await prisma.journalEntry.create({
          data: {
            ticker,
            title: `${type === 'BUY' ? 'Bought' : 'Sold'} ${ticker}${quantity ? ` (${quantity})` : ''}`,
            body: `Auto-logged from your ${new Date(a.occurredAt).toLocaleDateString('en-CA')} fill: ${description}.\n\n**Why did I make this trade?** (add your rationale)`,
            tags: 'auto,trade',
          },
        })
      } catch {
        // journal is best-effort; never block the sync
      }
    }

    created.push({
      id: a.canonicalId,
      type,
      ticker,
      description,
      quantity,
      price,
      amount,
      currency,
      occurredAt: a.occurredAt,
    })
  }

  return created
}

/** Full sync used by the connect flow and the "Sync now" button. */
export async function fullSync(): Promise<{ positions: { updated: number; created: number; zeroed: number }; newActivities: number }> {
  try {
    const positions = await syncPositions()
    const newActivities = await syncActivities()
    return { positions, newActivities: newActivities.length }
  } catch (err) {
    await logSyncFailure(err)
    throw err
  }
}

/** Persist an ImportLog row + connection status for a failed WS sync. */
export async function logSyncFailure(err: unknown): Promise<void> {
  const status =
    err instanceof WsAuthExpiredError
      ? 'auth-expired'
      : err instanceof WsRateLimitError
        ? 'rate-limited'
        : err instanceof WsSchemaError
          ? 'schema-drift'
          : err instanceof WsApiError
            ? 'error'
            : 'error'
  try {
    await prisma.importLog.create({
      data: {
        filename: 'wealthsimple-api',
        rows: 0,
        status,
        message: err instanceof Error ? err.message : String(err),
      },
    })
    if (err instanceof WsAuthExpiredError) {
      await setSessionStatus('expired', err.message)
    } else if (err instanceof WsSchemaError) {
      await setSessionStatus('error', 'WS API changed — falling back to CSV import')
      await setKv('syncMode', 'csv-fallback')
    }
  } catch {
    // logging must never throw
  }
}
