/**
 * csvExport — tiny helper to download data as a .csv file.
 * Works in all modern browsers (no dependencies).
 */

/** Escape a cell value: wrap in quotes, double any internal quotes. */
function cell(v: string | number | boolean | null | undefined): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * Trigger a CSV download in the browser.
 *
 * @param filename  Suggested filename (without extension — .csv is appended)
 * @param headers   Column header labels
 * @param rows      2-D array of values, one array per data row
 */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const lines = [
    headers.map(cell).join(','),
    ...rows.map((row) => row.map(cell).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
