/**
 * xlsxExport — mobile stub.
 * Generates CSV instead of XLSX (no xlsx library needed on mobile).
 * API-compatible with web/src/lib/xlsxExport.ts.
 */

export type CellValue = string | number | boolean | null | undefined
export type ColType   = 'text' | 'money' | 'number' | 'percent' | 'date'

export interface SheetColumn {
  header:   string
  type?:    ColType
  width?:   number
  bold?:    boolean
}

export interface ReportSheet {
  name:         string
  columns:      SheetColumn[]
  rows:         CellValue[][]
  totalsRow?:   CellValue[]
  periodLabel?: string
}

function cell(v: CellValue): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export function downloadXLSX(filename: string, sheets: ReportSheet[], _reportTitle?: string) {
  const sheet = sheets[0]
  if (!sheet) return

  const lines: string[] = []
  lines.push(sheet.columns.map((c) => cell(c.header)).join(','))
  for (const row of sheet.rows) {
    lines.push(row.map(cell).join(','))
  }
  if (sheet.totalsRow) {
    lines.push(sheet.totalsRow.map(cell).join(','))
  }

  const csv  = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
