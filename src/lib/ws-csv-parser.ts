export interface WSHolding {
  ticker: string
  name: string
  exchange: string
  securityType: string
  quantity: number
  bookValueCAD: number
  bookValueMkt: number
  bookValueMktCurrency: string
  marketPrice: number
  marketPriceCurrency: string
  marketValue: number
  marketValueCurrency: string
  unrealizedReturn: number
  unrealizedReturnCurrency: string
}

export interface ParseResult {
  holdings: WSHolding[]
  errors: string[]
  rowCount: number
  timestamp: string | null
}

export function parseWealthsimpleCSV(csvText: string): ParseResult {
  const errors: string[] = []
  const holdings: WSHolding[] = []
  let timestamp: string | null = null

  const lines = csvText.trim().split('\n')
  if (lines.length < 2) {
    return { holdings, errors: ['CSV file is empty or has no data rows'], rowCount: 0, timestamp }
  }

  // Find header row
  const headerLine = lines[0]
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))

  // Map columns by name
  const col = (name: string) => headers.indexOf(name)
  const idxSymbol = col('Symbol')
  const idxName = col('Name')
  const idxExchange = col('Exchange')
  const idxSecType = col('Security Type')
  const idxQty = col('Quantity')
  const idxBookCAD = col('Book Value (CAD)')
  const idxBookMkt = col('Book Value (Market)')
  const idxBookMktCur = col('Book Value Currency (Market)')
  const idxPrice = col('Market Price')
  const idxPriceCur = col('Market Price Currency')
  const idxMktVal = col('Market Value')
  const idxMktValCur = col('Market Value Currency')
  const idxUnreal = col('Market Unrealized Returns')
  const idxUnrealCur = col('Market Unrealized Returns Currency')

  if (idxSymbol === -1) {
    errors.push('Could not find "Symbol" column. Is this a Wealthsimple holdings CSV?')
    return { holdings, errors, rowCount: 0, timestamp }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Parse CSV respecting quoted fields
    const cells = parseCSVLine(line)

    const symbol = cells[idxSymbol]?.trim()

    // Skip empty rows and timestamp rows
    if (!symbol || symbol === 'NaN' || symbol === '') {
      // Check if this row has timestamp info
      const firstCell = cells[0]?.trim()
      if (firstCell && firstCell.startsWith('As of')) {
        timestamp = firstCell
      }
      continue
    }

    const qty = parseFloat(cells[idxQty] ?? '0')
    if (isNaN(qty) || qty === 0) continue

    holdings.push({
      ticker: symbol,
      name: cells[idxName]?.trim() ?? symbol,
      exchange: cells[idxExchange]?.trim() ?? 'N/A',
      securityType: cells[idxSecType]?.trim() ?? 'EQUITY',
      quantity: qty,
      bookValueCAD: parseFloat(cells[idxBookCAD] ?? '0') || 0,
      bookValueMkt: parseFloat(cells[idxBookMkt] ?? '0') || 0,
      bookValueMktCurrency: cells[idxBookMktCur]?.trim() ?? 'CAD',
      marketPrice: parseFloat(cells[idxPrice] ?? '0') || 0,
      marketPriceCurrency: cells[idxPriceCur]?.trim() ?? 'USD',
      marketValue: parseFloat(cells[idxMktVal] ?? '0') || 0,
      marketValueCurrency: cells[idxMktValCur]?.trim() ?? 'USD',
      unrealizedReturn: parseFloat(cells[idxUnreal] ?? '0') || 0,
      unrealizedReturnCurrency: cells[idxUnrealCur]?.trim() ?? 'USD',
    })
  }

  return { holdings, errors, rowCount: holdings.length, timestamp }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
