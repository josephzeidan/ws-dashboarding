// Portfolio news: pulls per-ticker headlines from Yahoo Finance's RSS feed
// (keyless) and an optional AI "what matters today" brief. Results are cached
// in the DB so we don't refetch/re-summarize on every page view.

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { callClaude, hasClaudeKey, CLAUDE_FAST } from '@/lib/claude'

export interface NewsHeadline {
  id: string
  tickers: string[]
  title: string
  link: string
  source: string
  publishedAt: string
}

const RSS = (ticker: string) =>
  `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim()
}

function tag(item: string, name: string): string {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(item)
  return m ? decodeEntities(m[1]) : ''
}

interface RawItem {
  title: string
  link: string
  source: string
  publishedAt: Date
}

async function fetchTickerRss(ticker: string): Promise<RawItem[]> {
  try {
    const res = await fetch(RSS(ticker), { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []
    return items
      .map((raw) => {
        const title = tag(raw, 'title')
        const link = tag(raw, 'link')
        const pub = tag(raw, 'pubDate')
        const source = tag(raw, 'source') || 'Yahoo Finance'
        const publishedAt = pub ? new Date(pub) : new Date()
        return { title, link, source, publishedAt }
      })
      .filter((i) => i.title && i.link)
  } catch {
    return []
  }
}

/** Fetch fresh headlines for the given tickers, upsert into NewsItem, deduped. */
export async function refreshNews(tickers: string[]): Promise<number> {
  if (tickers.length === 0) return 0
  const byLink = new Map<string, { item: RawItem; tickers: Set<string> }>()

  const results = await Promise.allSettled(tickers.map((t) => fetchTickerRss(t).then((items) => ({ t, items }))))
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const item of r.value.items) {
      const existing = byLink.get(item.link)
      if (existing) existing.tickers.add(r.value.t)
      else byLink.set(item.link, { item, tickers: new Set([r.value.t]) })
    }
  }

  let count = 0
  for (const { item, tickers: tk } of byLink.values()) {
    const id = crypto.createHash('sha1').update(item.link).digest('hex')
    await prisma.newsItem.upsert({
      where: { id },
      update: { tickers: [...tk].join(',') },
      create: {
        id,
        tickers: [...tk].join(','),
        title: item.title,
        link: item.link,
        source: item.source,
        publishedAt: item.publishedAt,
      },
    })
    count++
  }
  return count
}

export async function getRecentNews(limit = 60): Promise<NewsHeadline[]> {
  const rows = await prisma.newsItem.findMany({ orderBy: { publishedAt: 'desc' }, take: limit })
  return rows.map((r) => ({
    id: r.id,
    tickers: r.tickers ? r.tickers.split(',').filter(Boolean) : [],
    title: r.title,
    link: r.link,
    source: r.source,
    publishedAt: r.publishedAt.toISOString(),
  }))
}

/** Generate (and cache) an AI daily brief prioritizing today's portfolio news.
 *  Returns '' (and logs) if the AI call fails — e.g. no API credits — so the
 *  headlines still render. */
export async function generateBrief(headlines: NewsHeadline[]): Promise<string> {
  if (!hasClaudeKey() || headlines.length === 0) return ''
  const list = headlines
    .slice(0, 40)
    .map((h) => `- [${h.tickers.join(', ') || '—'}] ${h.title} (${h.source})`)
    .join('\n')

  try {
    const body = await callClaude(
      `You are the editor of a concise daily brief for a retail investor who holds these tickers. Below are recent headlines tagged with the holdings they relate to.\n\nWrite a prioritized "What matters today" brief in markdown:\n- Lead with the 2-4 most material items (earnings, guidance, analyst moves, regulatory/macro shocks, big price catalysts). For each: a bold one-line takeaway, then one sentence on why it matters to a holder.\n- Group the rest into a short "Also watching" bulleted list.\n- Be direct and specific. No preamble, no disclaimers, no "as an AI". Max ~250 words.\n\nHeadlines:\n${list}`,
      { model: CLAUDE_FAST, maxTokens: 900 }
    )
    await prisma.newsBrief.create({ data: { body, itemCount: headlines.length } })
    return body
  } catch (err) {
    console.error('News brief generation failed:', err instanceof Error ? err.message : err)
    return ''
  }
}

export async function getLatestBrief(): Promise<{ body: string; generatedAt: string } | null> {
  const row = await prisma.newsBrief.findFirst({ orderBy: { generatedAt: 'desc' } })
  return row ? { body: row.body, generatedAt: row.generatedAt.toISOString() } : null
}
