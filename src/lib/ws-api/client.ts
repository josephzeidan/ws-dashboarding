// TypeScript port of the unofficial Wealthsimple API client
// (reference: gboudreau/ws-api-python v0.35 — wealthsimple_api.py).
// Read-only scope; auth = OAuth password grant + TOTP, then refresh tokens.

import crypto from 'crypto'
import {
  WsApiError,
  WsAuthExpiredError,
  WsLoginFailedError,
  WsNetworkError,
  WsOtpRequiredError,
  WsRateLimitError,
  WsSchemaError,
} from './errors'
import { GRAPHQL_QUERIES } from './queries'
import { WsSessionData, loadSession, saveSession, setSessionStatus } from './session-store'

const OAUTH_BASE_URL = 'https://api.production.wealthsimple.com/v1/oauth/v2'
const GRAPHQL_URL = 'https://my.wealthsimple.com/graphql'
const GRAPHQL_VERSION = '12'
const SCOPE_READ_ONLY = 'invest.read trade.read tax.read'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 10_000

async function wsFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
  } catch (err) {
    throw new WsNetworkError(`WS request failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }
}

// --- unauthenticated bootstrap: device id + oauth client id -----------------

interface Bootstrap {
  wssdi: string
  clientId: string
}

/** Scrape the wssdi device-id cookie and the production OAuth clientId from
 *  the WS login page + its app JS bundle (same approach as the reference lib). */
export async function bootstrapDeviceAndClient(): Promise<Bootstrap> {
  const res = await wsFetch('https://my.wealthsimple.com/app/login', {
    headers: { 'User-Agent': USER_AGENT },
  })
  const setCookies: string[] =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [res.headers.get('set-cookie') ?? '']
  let wssdi: string | null = null
  for (const line of setCookies) {
    const m = /wssdi=([a-f0-9-]+);/i.exec(line)
    if (m) {
      wssdi = m[1]
      break
    }
  }
  const html = await res.text()
  const jsMatch = /<script[^>]*src="(.+?\/app-[a-f0-9]+\.js)/i.exec(html)
  if (!wssdi) throw new WsSchemaError("Couldn't find wssdi cookie on the WS login page")
  if (!jsMatch) throw new WsSchemaError("Couldn't find the app JS bundle URL on the WS login page")

  const jsRes = await wsFetch(jsMatch[1], { headers: { 'User-Agent': USER_AGENT } })
  const js = await jsRes.text()
  const idMatch = /"production"[^}]*clientId:"([a-f0-9]+)"/i.exec(js)
  if (!idMatch) throw new WsSchemaError("Couldn't find the OAuth clientId in the WS app JS bundle")

  return { wssdi, clientId: idMatch[1] }
}

// --- token endpoints ---------------------------------------------------------

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  error?: string
  [k: string]: unknown
}

export async function login(email: string, password: string, otp?: string): Promise<WsSessionData> {
  const { wssdi, clientId } = await bootstrapDeviceAndClient()
  const sessionId = crypto.randomUUID()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
    'x-wealthsimple-client': '@wealthsimple/wealthsimple',
    'x-ws-profile': 'undefined',
    'x-ws-session-id': sessionId,
    'x-ws-device-id': wssdi,
  }
  if (otp) headers['x-wealthsimple-otp'] = `${otp};remember=true`

  const res = await wsFetch(`${OAUTH_BASE_URL}/token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      grant_type: 'password',
      username: email,
      password,
      skip_provision: 'true',
      scope: SCOPE_READ_ONLY,
      client_id: clientId,
      otp_claim: null,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse

  if (data.error === 'invalid_grant' && !otp) throw new WsOtpRequiredError()
  if (data.error || !data.access_token || !data.refresh_token) {
    throw new WsLoginFailedError('Wealthsimple login failed', { error: data.error })
  }

  const session: WsSessionData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    sessionId,
    wssdi,
    clientId,
    tokenInfo: null,
  }
  return session
}

async function refreshSession(session: WsSessionData): Promise<WsSessionData> {
  const res = await wsFetch(`${OAUTH_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'x-wealthsimple-client': '@wealthsimple/wealthsimple',
      'x-ws-profile': 'invest',
      'x-ws-session-id': session.sessionId,
      'x-ws-device-id': session.wssdi,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: session.clientId,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!data.access_token || !data.refresh_token) {
    throw new WsAuthExpiredError()
  }
  const updated: WsSessionData = {
    ...session,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenInfo: null, // identity id claim may rotate; re-fetch lazily
  }
  await saveSession(updated)
  return updated
}

export async function getTokenInfo(session: WsSessionData): Promise<Record<string, unknown>> {
  if (session.tokenInfo) return session.tokenInfo
  const res = await wsFetch(`${OAUTH_BASE_URL}/token/info`, {
    headers: {
      'User-Agent': USER_AGENT,
      'x-wealthsimple-client': '@wealthsimple/wealthsimple',
      'x-ws-session-id': session.sessionId,
      'x-ws-device-id': session.wssdi,
      Authorization: `Bearer ${session.accessToken}`,
    },
  })
  if (!res.ok) throw new WsAuthExpiredError(`token/info returned ${res.status}`)
  const info = (await res.json()) as Record<string, unknown>
  session.tokenInfo = info
  await saveSession(session)
  return info
}

// --- session acquisition with single-flight refresh --------------------------

const g = globalThis as unknown as { __wsRefreshPromise?: Promise<WsSessionData> | null }

/** Load the persisted session; throws WsAuthExpiredError if none/unusable. */
export async function getSession(): Promise<WsSessionData> {
  const session = await loadSession()
  if (!session) throw new WsAuthExpiredError('Not connected to Wealthsimple')
  return session
}

async function refreshSingleFlight(session: WsSessionData): Promise<WsSessionData> {
  if (!g.__wsRefreshPromise) {
    g.__wsRefreshPromise = refreshSession(session).finally(() => {
      g.__wsRefreshPromise = null
    })
  }
  return g.__wsRefreshPromise
}

// --- GraphQL -----------------------------------------------------------------

function isNotAuthorized(body: any): boolean {
  const firstError = Array.isArray(body?.errors) ? body.errors[0] : null
  return body?.message === 'Not Authorized.' || firstError?.message === 'Not Authorized.'
}

async function rawGraphql(session: WsSessionData, operationName: string, variables: Record<string, unknown>) {
  const query = GRAPHQL_QUERIES[operationName]
  if (!query) throw new WsSchemaError(`Unknown GraphQL operation: ${operationName}`)
  const res = await wsFetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${session.accessToken}`,
      'x-ws-session-id': session.sessionId,
      'x-ws-device-id': session.wssdi,
      'x-ws-profile': 'trade',
      'x-ws-api-version': GRAPHQL_VERSION,
      'x-ws-locale': 'en-CA',
      'x-platform-os': 'web',
    },
    body: JSON.stringify({ operationName, query, variables }),
  })
  if (res.status === 429) throw new WsRateLimitError()
  const body = await res.json().catch(() => null)
  if (res.status === 401 || isNotAuthorized(body)) throw new WsAuthExpiredError()
  if (!body || !('data' in body)) throw new WsSchemaError(`GraphQL query failed: ${operationName}`, body)
  return body.data
}

export interface GraphqlOptions {
  /** Dot path into the response data, e.g. "identity.accounts.edges" */
  path: string
  /** Follow pageInfo.endCursor and concatenate all pages (arrays only). */
  loadAllPages?: boolean
}

/** Run a named GraphQL operation with automatic one-shot token refresh,
 *  walk `path` into the result, unwrap edges → nodes, optionally paginate. */
export async function wsGraphql(
  operationName: string,
  variables: Record<string, unknown>,
  options: GraphqlOptions
): Promise<any> {
  let session = await getSession()
  let data: any
  try {
    data = await rawGraphql(session, operationName, variables)
  } catch (err) {
    if (err instanceof WsAuthExpiredError) {
      try {
        session = await refreshSingleFlight(session)
      } catch (refreshErr) {
        await setSessionStatus('expired', 'Session expired — reconnect in Settings')
        throw refreshErr
      }
      data = await rawGraphql(session, operationName, variables)
    } else {
      throw err
    }
  }

  let node: any = data
  let endCursor: string | null = null
  const keys = options.path.split('.')
  for (const key of keys) {
    if (node == null || typeof node !== 'object' || !(key in node)) {
      throw new WsSchemaError(`GraphQL response missing "${key}" (${operationName})`, data)
    }
    node = node[key]
    if (node?.pageInfo?.hasNextPage && node.pageInfo.endCursor) {
      endCursor = node.pageInfo.endCursor
    }
  }

  if (keys[keys.length - 1] === 'edges' && Array.isArray(node)) {
    node = node.map((edge: any) => edge.node)
  }

  if (options.loadAllPages && endCursor && Array.isArray(node)) {
    const rest = await wsGraphql(operationName, { ...variables, cursor: endCursor }, options)
    if (Array.isArray(rest)) node = node.concat(rest)
  }

  return node
}

/** Identity canonical id (needed as a variable by most queries). */
export async function getIdentityId(): Promise<string> {
  const session = await getSession()
  const info = await getTokenInfo(session)
  const id = info['identity_canonical_id']
  if (typeof id !== 'string' || !id) throw new WsSchemaError('token/info missing identity_canonical_id', info)
  return id
}

export { SCOPE_READ_ONLY, WsApiError }
