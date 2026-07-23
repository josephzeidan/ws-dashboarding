// Encrypted-at-rest persistence for the WS OAuth session.
// The session JSON (tokens, device id, client id) is AES-256-GCM encrypted with
// a key kept in .env.local (gitignored). Deleting the WsSession row = disconnect.

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'

export interface WsSessionData {
  accessToken: string
  refreshToken: string
  sessionId: string
  wssdi: string
  clientId: string
  tokenInfo?: Record<string, unknown> | null
}

const ENV_KEY_NAME = 'WS_TOKEN_KEY'

function envLocalPath(): string {
  return path.join(process.cwd(), '.env.local')
}

/** Returns the 32-byte encryption key, generating and persisting one on first use. */
function getKey(): Buffer {
  let hex = process.env[ENV_KEY_NAME]
  if (!hex) {
    hex = crypto.randomBytes(32).toString('hex')
    fs.appendFileSync(envLocalPath(), `\n${ENV_KEY_NAME}="${hex}"\n`, { mode: 0o600 })
    try {
      fs.chmodSync(envLocalPath(), 0o600)
    } catch {
      // best-effort permission tightening
    }
    process.env[ENV_KEY_NAME] = hex
  }
  return Buffer.from(hex, 'hex')
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.')
}

function decrypt(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split('.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

export async function saveSession(data: WsSessionData, identityId?: string | null): Promise<void> {
  const blob = encrypt(JSON.stringify(data))
  const existing = await prisma.wsSession.findFirst()
  if (existing) {
    await prisma.wsSession.update({
      where: { id: existing.id },
      data: { sessionBlob: blob, status: 'connected', lastError: '', ...(identityId ? { identityId } : {}) },
    })
  } else {
    await prisma.wsSession.create({
      data: { sessionBlob: blob, status: 'connected', identityId: identityId ?? null },
    })
  }
}

export async function loadSession(): Promise<WsSessionData | null> {
  const row = await prisma.wsSession.findFirst()
  if (!row || row.status === 'disconnected') return null
  try {
    return JSON.parse(decrypt(row.sessionBlob)) as WsSessionData
  } catch {
    // key changed or blob corrupted — treat as disconnected
    return null
  }
}

export async function setSessionStatus(status: 'connected' | 'expired' | 'error', lastError = ''): Promise<void> {
  const row = await prisma.wsSession.findFirst()
  if (row) await prisma.wsSession.update({ where: { id: row.id }, data: { status, lastError } })
}

export async function markSynced(): Promise<void> {
  const row = await prisma.wsSession.findFirst()
  if (row) await prisma.wsSession.update({ where: { id: row.id }, data: { lastSyncAt: new Date() } })
}

export async function deleteSession(): Promise<void> {
  await prisma.wsSession.deleteMany()
}

export async function getConnectionStatus() {
  const row = await prisma.wsSession.findFirst()
  if (!row) return { status: 'disconnected' as const, lastSyncAt: null, lastError: '' }
  return {
    status: row.status as 'connected' | 'expired' | 'error' | 'disconnected',
    lastSyncAt: row.lastSyncAt,
    lastError: row.lastError,
  }
}
