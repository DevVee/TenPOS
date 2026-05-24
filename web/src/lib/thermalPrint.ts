/**
 * thermalPrint.ts — 58mm thermal receipt printer utility
 *
 * Opens an isolated popup window with a self-contained HTML receipt.
 * Designed for JK-5801H / XP-58 / 58mm ESC/POS thermal printers.
 *
 * ┌─ Browser print dialog settings (advise cashiers to set once) ──────┐
 * │  Printer  : your thermal printer (JK-5801H / XP-58 / etc.)        │
 * │  Paper    : 58 × Roll  (or Custom 58mm × 200mm)                   │
 * │  Margins  : None / Minimum                                         │
 * │  Scale    : 100 %                                                  │
 * │  Headers / footers : OFF                                           │
 * └────────────────────────────────────────────────────────────────────┘
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThermalItem {
  name: string
  qty: number
  price: number
  discount: number
  total: number
}

export interface ThermalReceiptData {
  storeName: string
  address?: string
  branchName?: string
  receiptNo: string
  date: string
  cashierName?: string
  items: ThermalItem[]
  subtotal: number
  voucherDiscount?: number
  voucherCode?: string
  total: number
  paid: number
  change: number
  method: string
  transactionId?: string
  footer?: string
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function peso(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

/** Two-column flex row */
function row(left: string, right: string, extraClass = ''): string {
  return `<div class="row${extraClass ? ' ' + extraClass : ''}"><span>${esc(left)}</span><span>${esc(right)}</span></div>`
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(d: ThermalReceiptData): string {
  const lines: string[] = []

  /* ── Header ── */
  lines.push('<div class="hdr">')
  lines.push(`<div class="sn">${esc(d.storeName)}</div>`)
  if (d.address)    lines.push(`<div class="sub">${esc(d.address)}</div>`)
  if (d.branchName) lines.push(`<div class="sub">${esc(d.branchName)}</div>`)
  lines.push('</div>')
  lines.push('<hr class="dash">')

  /* ── Transaction meta ── */
  lines.push(row('Receipt #', d.receiptNo))
  lines.push(row('Date', d.date))
  if (d.cashierName) lines.push(row('Cashier', d.cashierName))
  lines.push('<hr class="dash">')

  /* ── Items ── */
  for (const item of d.items) {
    lines.push('<div class="item">')
    lines.push(`<div class="iname">${esc(item.name)}</div>`)
    const detail = `  ${item.qty} × ${peso(item.price)}${item.discount > 0 ? ` (-${peso(item.discount)})` : ''}`
    lines.push(row(detail, peso(item.total), 'irow'))
    lines.push('</div>')
  }
  lines.push('<hr class="dash">')

  /* ── Totals ── */
  lines.push(row('Subtotal', peso(d.subtotal)))
  if (d.voucherDiscount && d.voucherDiscount > 0) {
    const label = d.voucherCode ? `Voucher (${d.voucherCode})` : 'Discount'
    lines.push(row(label, `-${peso(d.voucherDiscount)}`))
  }
  lines.push('<hr class="solid">')
  lines.push(row('TOTAL', peso(d.total), 'tot'))
  lines.push('<hr class="solid">')

  /* ── Payment ── */
  lines.push(row(d.method.toUpperCase(), peso(d.paid)))
  if (d.change > 0) lines.push(row('CHANGE', peso(d.change), 'chg'))
  lines.push('<hr class="dash">')

  /* ── Footer ── */
  lines.push('<div class="ftr">')
  lines.push(`<p>${esc(d.footer ?? 'Thank you for your purchase!')}</p>`)
  if (d.transactionId) lines.push(`<p class="ref">Ref: ${esc(d.transactionId)}</p>`)
  lines.push('</div>')
  lines.push('<div class="feed"></div>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=220,initial-scale=1,maximum-scale=1">
<title>Receipt ${esc(d.receiptNo)}</title>
<style>
/* ── Reset ──────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}

/* ── Page: 58mm thermal roll ────────────────────────
   Side margins 1.5mm × 2 = 3mm → content width 55mm.
   Top 3mm gives a clean lead-in gap before the header.
   Bottom 0: the .feed block handles paper advance past
   the cutter — more reliable than @page margin-bottom. */
@page{size:58mm auto;margin:3mm 1.5mm 0}

/* ── Base ───────────────────────────────────────────── */
html,body{
  width:55mm;max-width:55mm;margin:0;
  font-family:'Courier New',Courier,'Lucida Console',monospace;
  font-size:8pt;line-height:1.5;
  color:#000;background:#fff;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* ── Header ─────────────────────────────────────────── */
.hdr{text-align:center;padding:2mm 0 3mm}
.sn{font-weight:700;font-size:9.5pt;margin-bottom:1.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{font-size:7pt;line-height:1.5;color:#333}

/* ── Separators ─────────────────────────────────────── */
hr{border:none;margin:2mm 0}
hr.dash{border-top:1px dashed #666}
hr.solid{border-top:1.5px solid #000}

/* ── Two-column rows ────────────────────────────────── */
.row{display:flex;justify-content:space-between;align-items:baseline;gap:4px;margin:1.2mm 0}
.row span:first-child{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:clip}
.row span:last-child{flex-shrink:0;text-align:right;white-space:nowrap;padding-left:4px}

/* ── Items ──────────────────────────────────────────── */
/* margin-top on .iname = gap before each item name.
   margin-bottom on .irow = gap after the price line.
   Both together create clear visual separation between items. */
.iname{font-weight:600;margin-top:3mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.irow{font-size:7.5pt;color:#222;margin-top:0.5mm;margin-bottom:1mm}

/* ── Totals ─────────────────────────────────────────── */
.tot{font-weight:700;font-size:10pt;margin:1mm 0}
.chg{font-weight:600}

/* ── Footer ─────────────────────────────────────────── */
.ftr{text-align:center;font-size:7.5pt;color:#444;padding:3mm 0 2mm}
.ftr .ref{font-size:6.5pt;color:#888;margin-top:1.5mm}

/* ── Feed spacer ─────────────────────────────────────── */
/* Explicit block height advances paper past the cutter reliably.
   Thermal drivers respect block content height far more consistently
   than CSS padding-bottom or @page margin-bottom.
   25 mm clears the typical 20–25 mm cutter gap from print head. */
.feed{display:block;height:25mm;width:100%}
</style>
</head>
<body>
${lines.join('\n')}
</body>
</html>`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Print a 58mm thermal receipt via an isolated popup window.
 *
 * The popup is fully self-contained — no external CSS, no conflicting
 * @page rules from the host application.  It auto-closes after print.
 */
export function printThermalReceipt(data: ThermalReceiptData): void {
  const html = buildHtml(data)

  const popup = window.open(
    '',
    '_blank',
    'width=220,height=700,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes',
  )

  if (!popup) {
    alert(
      'Pop-ups are blocked.\n\n' +
      'Please allow pop-ups for this site, then click "Print Receipt" again.',
    )
    return
  }

  popup.document.open()
  popup.document.write(html)
  popup.document.close()

  const doPrint = () => {
    popup.focus()
    popup.print()
    popup.addEventListener('afterprint', () => {
      setTimeout(() => { if (!popup.closed) popup.close() }, 200)
    })
    // Safety: auto-close 2 min after dialog dismissal (cancelled print)
    setTimeout(() => { if (!popup.closed) popup.close() }, 120_000)
  }

  if (popup.document.readyState === 'complete') {
    setTimeout(doPrint, 150)
  } else {
    popup.addEventListener('load', () => setTimeout(doPrint, 150))
    // Fallback: fire anyway after 800ms if 'load' never fires
    setTimeout(() => { if (popup && !popup.closed) doPrint() }, 800)
  }
}
