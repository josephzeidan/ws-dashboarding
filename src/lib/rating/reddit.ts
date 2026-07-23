// Social sub-score — a TypeScript port of the stock-main Reddit sentiment idea.
// Uses application-only OAuth (client_id/secret from .env.local) to search
// r/stocks+investing+wallstreetbets. Posts are sentiment-scored by Claude when
// credits are available (catches sarcasm the keyword lexicon can't), with the
// lexicon as the always-works fallback.

import { callClaudeJson, hasClaudeKey, CLAUDE_FAST } from '@/lib/claude'

export interface RedditPost {
  title: string
  score: number
  sentiment: number // -1..1
  url: string
  subreddit: string
}

export interface SocialResult {
  score: number | null // 1–10
  postCount: number
  avgSentiment: number | null
  bullish: number
  bearish: number
  topPosts: RedditPost[]
}

const BULLISH = ['buy', 'long', 'bull', 'bullish', 'breakout', 'calls', 'upside', 'squeeze', 'rip', 'moon', 'rocket', 'undervalued', 'beat', 'growth', 'strong', 'rally', 'gains', 'up']
const BEARISH = ['sell', 'short', 'bear', 'bearish', 'puts', 'downside', 'dump', 'drop', 'crash', 'fade', 'overvalued', 'miss', 'weak', 'decline', 'loss', 'bag', 'down', 'warning']

let token: { value: string; exp: number } | null = null

async function getToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID
  const secret = process.env.REDDIT_CLIENT_SECRET
  const ua = process.env.REDDIT_USER_AGENT || 'ws-portfolio/1.0'
  if (!id || !secret) return null
  if (token && Date.now() < token.exp) return token.value
  try {
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': ua,
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.access_token) return null
    token = { value: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000 }
    return token.value
  } catch {
    return null
  }
}

/** Batch-score posts with Claude: one cheap call for all titles. Returns null
 *  on any failure (no key / no credits / bad output) so the caller can fall
 *  back to the lexicon. */
async function claudeSentiment(ticker: string, texts: string[]): Promise<number[] | null> {
  if (!hasClaudeKey() || texts.length === 0) return null
  try {
    const list = texts.map((t, i) => `${i}: ${t.slice(0, 200)}`).join('\n')
    const scored = await callClaudeJson<{ i: number; s: number }[]>(
      `Score the sentiment each Reddit post expresses about the stock ${ticker}, from -1 (strongly bearish on ${ticker}) to +1 (strongly bullish). Read carefully for sarcasm, loss porn, and irony — "I've made a loss on every AI stock!" is NEGATIVE. Posts not really about ${ticker} score 0.\nReturn ONLY a JSON array of {"i": index, "s": score}.\n\nPosts:\n${list}`,
      { model: CLAUDE_FAST, maxTokens: 1500 }
    )
    if (!Array.isArray(scored)) return null
    const out = new Array(texts.length).fill(0)
    for (const row of scored) {
      if (typeof row?.i === 'number' && typeof row?.s === 'number' && row.i >= 0 && row.i < texts.length) {
        out[row.i] = Math.max(-1, Math.min(1, row.s))
      }
    }
    return out
  } catch (err) {
    console.error('Claude sentiment failed, using lexicon:', err instanceof Error ? err.message : err)
    return null
  }
}

function lexiconSentiment(text: string): number {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  let pos = 0
  let neg = 0
  for (const w of words) {
    if (BULLISH.includes(w)) pos++
    if (BEARISH.includes(w)) neg++
  }
  const total = pos + neg
  return total === 0 ? 0 : (pos - neg) / total
}

export async function getSocial(ticker: string, name?: string): Promise<SocialResult> {
  const empty: SocialResult = { score: null, postCount: 0, avgSentiment: null, bullish: 0, bearish: 0, topPosts: [] }
  const tok = await getToken()
  if (!tok) return empty
  const ua = process.env.REDDIT_USER_AGENT || 'ws-portfolio/1.0'

  const query = encodeURIComponent(`${ticker} stock`)
  const url = `https://oauth.reddit.com/r/stocks+investing+wallstreetbets/search?q=${query}&restrict_sr=on&sort=relevance&t=month&limit=50`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, 'User-Agent': ua }, cache: 'no-store' })
    if (!res.ok) return empty
    const data = await res.json()
    const children: any[] = data?.data?.children ?? []
    if (children.length === 0) return empty

    const texts = children.map((c) => `${c.data?.title ?? ''} ${(c.data?.selftext ?? '').slice(0, 120)}`)
    const aiScores = await claudeSentiment(ticker, texts)
    const posts: RedditPost[] = children.map((c, i) => {
      const d = c.data
      return {
        title: d.title ?? '',
        score: d.score ?? 0,
        sentiment: aiScores ? aiScores[i] : lexiconSentiment(texts[i]),
        url: `https://reddit.com${d.permalink ?? ''}`,
        subreddit: d.subreddit ?? '',
      }
    })

    const avgSentiment = posts.reduce((s, p) => s + p.sentiment, 0) / posts.length
    const bullish = posts.filter((p) => p.sentiment > 0.1).length
    const bearish = posts.filter((p) => p.sentiment < -0.1).length

    // 1–10: center 5.5, shift by average sentiment; tiny boost for discussion volume.
    let score = 5.5 + avgSentiment * 4
    if (posts.length >= 20) score += 0.3
    score = Math.max(1, Math.min(10, Math.round(score * 10) / 10))

    const topPosts = [...posts].sort((a, b) => b.score - a.score).slice(0, 5)
    return { score, postCount: posts.length, avgSentiment: Math.round(avgSentiment * 100) / 100, bullish, bearish, topPosts }
  } catch {
    return empty
  }
}
