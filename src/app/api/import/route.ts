import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseWealthsimpleCSV } from '@/lib/ws-csv-parser'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const text = await file.text()
    const { holdings, errors, rowCount, timestamp } = parseWealthsimpleCSV(text)

    if (errors.length > 0 && holdings.length === 0) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 })
    }

    let updated = 0
    let skipped = 0

    for (const h of holdings) {
      try {
        // Upsert: update if exists, preserve metadata like thesis/conviction/theme
        const existing = await prisma.holding.findUnique({ where: { ticker: h.ticker } })
        if (existing) {
          await prisma.holding.update({
            where: { ticker: h.ticker },
            data: {
              quantity: h.quantity,
              bookValueCAD: h.bookValueCAD,
              bookValueMkt: h.bookValueMkt,
              bookValueMktCurrency: h.bookValueMktCurrency,
              marketPrice: h.marketPrice,
              marketPriceCurrency: h.marketPriceCurrency,
              marketValue: h.marketValue,
              marketValueCurrency: h.marketValueCurrency,
              unrealizedReturn: h.unrealizedReturn,
              unrealizedReturnCurrency: h.unrealizedReturnCurrency,
              // Preserve existing metadata
            },
          })
          updated++
        } else {
          // New holding — create with defaults
          await prisma.holding.create({
            data: {
              ...h,
              bucket: 'Tactical',
              theme: '',
              conviction: 7,
              horizon: 'MEDIUM',
              targetPct: 0,
              thesis: '',
            },
          })
          updated++
        }
      } catch {
        skipped++
      }
    }

    // Log the import
    await prisma.importLog.create({
      data: {
        filename: file.name,
        rows: rowCount,
        status: 'success',
        message: `Updated ${updated} holdings, skipped ${skipped}. WS timestamp: ${timestamp ?? 'unknown'}`,
      },
    })

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      rowCount,
      timestamp,
      errors,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
