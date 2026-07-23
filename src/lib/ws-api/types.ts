// Zod schemas for the WS GraphQL responses we consume.
// Amounts arrive as strings or numbers depending on the field — coerce everywhere.
// A parse failure means WS changed their API → WsSchemaError upstream.

import { z } from 'zod'

export const zMoney = z
  .object({
    amount: z.union([z.string(), z.number(), z.null()]).optional(),
    currency: z.string().nullish(),
  })
  .nullish()
  .transform((m) => ({
    amount: m?.amount == null ? null : Number(m.amount),
    currency: m?.currency ?? 'CAD',
  }))

export const zAccount = z
  .object({
    id: z.string(),
    type: z.string().nullish(),
    unifiedAccountType: z.string().nullish(),
    status: z.string().nullish(),
    currency: z.string().nullish(),
    nickname: z.string().nullish(),
    description: z.string().nullish(),
    financials: z
      .object({
        currentCombined: z
          .object({
            netLiquidationValue: zMoney,
          })
          .nullish(),
      })
      .nullish(),
  })
  .passthrough()
export type WsAccountNode = z.infer<typeof zAccount>

export const zAccounts = z.array(zAccount)

export const zBalanceAccount = z
  .object({
    custodianAccounts: z.array(
      z
        .object({
          financials: z
            .object({
              balance: z.array(
                z.object({
                  securityId: z.string(),
                  quantity: z.union([z.string(), z.number()]),
                })
              ),
            })
            .passthrough()
            .nullish(),
        })
        .passthrough()
    ),
  })
  .passthrough()
export const zBalanceAccounts = z.array(zBalanceAccount)

export const zPosition = z
  .object({
    quantity: z.union([z.string(), z.number()]),
    bookValue: zMoney,
    totalValue: zMoney,
    unrealizedReturns: zMoney,
    averagePrice: zMoney,
    security: z
      .object({
        id: z.string(),
        currency: z.string().nullish(),
        securityType: z.string().nullish(),
        stock: z
          .object({
            symbol: z.string().nullish(),
            name: z.string().nullish(),
            primaryExchange: z.string().nullish(),
          })
          .nullish(),
        quoteV2: z
          .object({
            price: z.union([z.string(), z.number(), z.null()]).optional(),
            currency: z.string().nullish(),
          })
          .passthrough()
          .nullish(),
      })
      .passthrough(),
  })
  .passthrough()
export type WsPosition = z.infer<typeof zPosition>
export const zPositions = z.array(zPosition)

export const zActivity = z
  .object({
    canonicalId: z.string(),
    accountId: z.string().nullish(),
    type: z.string().nullish(),
    subType: z.string().nullish(),
    status: z.string().nullish(),
    assetSymbol: z.string().nullish(),
    assetQuantity: z.union([z.string(), z.number(), z.null()]).optional(),
    amount: z.union([z.string(), z.number(), z.null()]).optional(),
    amountSign: z.string().nullish(),
    currency: z.string().nullish(),
    occurredAt: z.string(),
    securityId: z.string().nullish(),
  })
  .passthrough()
export type WsActivity = z.infer<typeof zActivity>
export const zActivities = z.array(zActivity)

export const zSecurityMarketData = z
  .object({
    stock: z
      .object({
        symbol: z.string().nullish(),
        name: z.string().nullish(),
        primaryExchange: z.string().nullish(),
      })
      .nullish(),
  })
  .passthrough()
