// Thin wrapper around the Anthropic Messages API. Reuses ANTHROPIC_API_KEY
// from .env.local. Kept model-agnostic so callers pick speed vs depth.

const API_URL = 'https://api.anthropic.com/v1/messages'

export const CLAUDE_FAST = 'claude-haiku-4-5-20251001'
export const CLAUDE_SMART = 'claude-sonnet-5'

export interface ClaudeOptions {
  model?: string
  maxTokens?: number
  system?: string
}

/** Send a single-user-message completion and return the text. Throws on error. */
export async function callClaude(prompt: string, opts: ClaudeOptions = {}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? CLAUDE_FAST,
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

/** Call Claude and parse the first JSON object/array in the reply. */
export async function callClaudeJson<T>(prompt: string, opts: ClaudeOptions = {}): Promise<T> {
  const raw = await callClaude(prompt, opts)
  const match = raw.match(/[[{][\s\S]*[\]}]/)
  if (!match) throw new Error('No JSON found in Claude response')
  return JSON.parse(match[0]) as T
}

export function hasClaudeKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}
