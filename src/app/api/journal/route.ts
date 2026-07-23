import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const entries = await prisma.journalEntry.findMany({ orderBy: { date: 'desc' } })
    return NextResponse.json(entries.map((e) => ({ ...e, tags: e.tags.split(',').filter(Boolean) })))
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch journal' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ticker, title, body, tags } = await req.json()
    if (!title || !body) return NextResponse.json({ error: 'title and body required' }, { status: 400 })
    const entry = await prisma.journalEntry.create({
      data: { ticker: ticker || null, title, body, tags: Array.isArray(tags) ? tags.join(',') : tags ?? '' },
    })
    return NextResponse.json({ ...entry, tags: entry.tags.split(',').filter(Boolean) })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    await prisma.journalEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}
