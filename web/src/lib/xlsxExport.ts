/**
 * xlsxExport — branded Excel (.xlsx) export for TEN POS reports.
 *
 * Each export receives one or more sheets. Every sheet gets:
 *   Row 1  — Company + Report title  (merged, brand red bg, bold white)
 *   Row 2  — Generated timestamp + period label  (gray)
 *   Row 3  — empty separator
 *   Row 4  — Column headers  (bold, light-gray bg, AutoFilter)
 *   Row 5+ — Data rows  (money columns: ₱#,##0.00 format)
 *   Last   — Totals / summary row  (bold, yellow bg)  — optional
 *
 * Rows 1-4 are frozen so they stay visible while scrolling.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — xlsx types work at runtime even if TS narrowing flags some methods
import * as XLSX from 'xlsx'

export type CellValue = string | number | boolean | null | undefined
export type ColType   = 'text' | 'money' | 'number' | 'percent' | 'date'

export interface SheetColumn {
  header:  string
  type?:   ColType   // default 'text'
  width?:  number    // chars, default auto
  bold?:   boolean   // bold this column in data rows
}

export interface ReportSheet {
  name:        string
  columns:     SheetColumn[]
  rows:        CellValue[][]
  totalsRow?:  CellValue[]   // optional bold/yellow summary row appended after data
  periodLabel?: string        // e.g. "Week (May 14–21 2026)"
}

// ─── Colours ─────────────────────────────────────────────────────────────────
const CLR_BRAND   = 'C0392B'  // brand red (fill)
const CLR_HEADER  = 'F3F4F6'  // light gray
const CLR_TOTALS  = 'FEF3C7'  // amber-100
const CLR_STRIPE  = 'FAFAFA'  // near-white stripe

// ─── Helper: create a cell with optional style ────────────────────────────────
function makeCell(
  value: CellValue,
  opts?: {
    bold?: boolean
    fill?: string
    align?: 'left' | 'center' | 'right'
    numFmt?: string
    italic?: boolean
    color?: string  // font color hex
    wrapText?: boolean
  }
): XLSX.CellObject {
  let t: XLSX.ExcelDataType = 's'
  let v: CellValue = value == null ? '' : value

  if (typeof v === 'number')  { t = 'n' }
  else if (typeof v === 'boolean') { t = 'b' }
  else { v = v ?? '' }

  const cell: XLSX.CellObject = { t, v }

  const s: Record<string, unknown> = {}

  if (opts?.bold || opts?.italic || opts?.color) {
    s.font = {
      bold:   opts?.bold   ?? false,
      italic: opts?.italic ?? false,
      color:  opts?.color  ? { rgb: opts.color } : undefined,
    }
  }
  if (opts?.fill) {
    s.fill = { patternType: 'solid', fgColor: { rgb: opts.fill } }
  }
  if (opts?.align) {
    s.alignment = { horizontal: opts.align, wrapText: opts?.wrapText }
  }
  if (opts?.numFmt) {
    s.numFmt = opts.numFmt
  }

  cell.s = s
  return cell
}

// ─── Number format strings ────────────────────────────────────────────────────
function numFmtFor(type: ColType | undefined): string | undefined {
  switch (type) {
    case 'money':   return '#,##0.00'
    case 'number':  return '#,##0'
    case 'percent': return '0.00%'
    default:        return undefined
  }
}

// ─── Build one worksheet ─────────────────────────────────────────────────────
function buildSheet(sheet: ReportSheet, reportTitle: string): XLSX.WorkSheet {
  const { columns, rows, totalsRow, periodLabel } = sheet
  const ncols = columns.length
  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
  })

  // Collect all cells into a 2-D map
  const cells: Record<string, XLSX.CellObject> = {}
  const R = (row: number, col: number) => XLSX.utils.encode_cell({ r: row, c: col })

  let rowIdx = 0

  // ── Row 0: Title ───────────────────────────────────────────────────────────
  for (let c = 0; c < ncols; c++) {
    cells[R(rowIdx, c)] = makeCell(
      c === 0 ? `Ten Foundation Philippines Inc. — ${reportTitle}` : '',
      { bold: true, fill: CLR_BRAND, color: 'FFFFFF', align: c === 0 ? 'left' : 'left', wrapText: false }
    )
  }
  rowIdx++

  // ── Row 1: Generated / period ──────────────────────────────────────────────
  for (let c = 0; c < ncols; c++) {
    cells[R(rowIdx, c)] = makeCell(
      c === 0 ? `Generated: ${today}${periodLabel ? `  ·  Period: ${periodLabel}` : ''}` : '',
      { italic: true, color: '6B7280', fill: 'F9FAFB' }
    )
  }
  rowIdx++

  // ── Row 2: Empty separator ─────────────────────────────────────────────────
  for (let c = 0; c < ncols; c++) {
    cells[R(rowIdx, c)] = makeCell('', { fill: 'FFFFFF' })
  }
  rowIdx++

  // ── Row 3: Column headers ──────────────────────────────────────────────────
  const headerRowIdx = rowIdx
  for (let c = 0; c < ncols; c++) {
    cells[R(rowIdx, c)] = makeCell(columns[c].header, {
      bold:  true,
      fill:  CLR_HEADER,
      align: columns[c].type === 'money' || columns[c].type === 'number' || columns[c].type === 'percent'
             ? 'right' : 'left',
    })
  }
  rowIdx++

  // ── Rows 4+: Data ─────────────────────────────────────────────────────────
  const dataStartRowIdx = rowIdx
  rows.forEach((row, ri) => {
    const stripe = ri % 2 === 1 ? CLR_STRIPE : 'FFFFFF'
    for (let c = 0; c < ncols; c++) {
      const val = row[c]
      const col = columns[c]
      const nf  = numFmtFor(col.type)
      cells[R(rowIdx, c)] = makeCell(val, {
        fill:   stripe,
        bold:   col.bold,
        align:  col.type === 'money' || col.type === 'number' || col.type === 'percent'
                ? 'right' : 'left',
        numFmt: nf,
      })
    }
    rowIdx++
  })

  // ── Totals row (optional) ─────────────────────────────────────────────────
  if (totalsRow) {
    for (let c = 0; c < ncols; c++) {
      const col = columns[c]
      const nf  = numFmtFor(col.type)
      cells[R(rowIdx, c)] = makeCell(totalsRow[c], {
        bold:   true,
        fill:   CLR_TOTALS,
        align:  col.type === 'money' || col.type === 'number' || col.type === 'percent'
                ? 'right' : 'left',
        numFmt: nf,
      })
    }
    rowIdx++
  }

  // ── Assemble worksheet ────────────────────────────────────────────────────
  const ws: XLSX.WorkSheet = { ...cells }

  ws['!ref'] = XLSX.utils.encode_range(
    { r: 0, c: 0 },
    { r: rowIdx - 1, c: ncols - 1 }
  )

  // Merged title row (A1 across all columns)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ncols - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: ncols - 1 } },
  ]

  // Column widths
  ws['!cols'] = columns.map((col) => ({
    wch: col.width ?? (
      col.type === 'money'   ? 18 :
      col.type === 'number'  ? 12 :
      col.type === 'percent' ? 10 :
      col.type === 'date'    ? 16 :
      Math.max(col.header.length + 4, 16)
    ),
  }))

  // Freeze rows 1-4 (pane below header)
  ws['!freeze'] = { xSplit: 0, ySplit: dataStartRowIdx } as unknown as XLSX.WSKeys

  // AutoFilter on header row
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range(
      { r: headerRowIdx, c: 0 },
      { r: headerRowIdx, c: ncols - 1 }
    ),
  }

  return ws
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build and download a multi-sheet .xlsx file.
 *
 * @param filename  Suggested filename without extension
 * @param sheets    One or more sheet definitions
 * @param reportTitle  Short title (used in every sheet's branding row)
 */
export function downloadXLSX(
  filename: string,
  sheets: ReportSheet[],
  reportTitle: string
) {
  const wb = XLSX.utils.book_new()
  wb.Props = {
    Title:   reportTitle,
    Author:  'Ten Foundation Philippines Inc.',
    Company: 'Ten Foundation Philippines Inc.',
  }

  for (const sheet of sheets) {
    const ws = buildSheet(sheet, reportTitle)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31)) // Excel sheet name limit = 31 chars
  }

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─── Convenience: single-sheet shortcut ──────────────────────────────────────
export function downloadSingleSheet(
  filename: string,
  reportTitle: string,
  sheet: ReportSheet
) {
  downloadXLSX(filename, [sheet], reportTitle)
}
