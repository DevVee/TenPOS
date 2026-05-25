/**
 * thermalPrint.ts — 58mm thermal receipt printer utility (mobile)
 *
 * Routing:
 *  1. Capacitor native + saved BT device → bluetoothPrint (direct, no dialog)
 *  2. Web / no saved device              → popup window print
 *
 * Popup settings (set once per device in browser):
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Printer  : your thermal printer (JK-5801H / XP-58 / etc.)        │
 * │  Paper    : 58 × Roll  (or Custom 58mm × 200mm)                   │
 * │  Margins  : None / Minimum   ·  Scale : 100 %                     │
 * │  Headers / footers : OFF                                           │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { Capacitor } from '@capacitor/core'
import { usePrinterStore } from '../store/printerStore'
import { connectDevice, checkConnection, printBluetooth } from './bluetoothPrint'

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

function row(left: string, right: string, extraClass = ''): string {
  return `<div class="row${extraClass ? ' ' + extraClass : ''}"><span>${esc(left)}</span><span>${esc(right)}</span></div>`
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(d: ThermalReceiptData): string {
  const lines: string[] = []
  const logoUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/brand/logo.png`
    : '/brand/logo.png'

  lines.push('<div class="hdr">')
  lines.push(`<img src="${logoUrl}" alt="" class="logo" onerror="this.style.display='none'">`)
  lines.push(`<div class="sn">${esc(d.storeName)}</div>`)
  if (d.address)    lines.push(`<div class="sub">${esc(d.address)}</div>`)
  if (d.branchName) lines.push(`<div class="sub">${esc(d.branchName)}</div>`)
  lines.push('</div><hr class="dash">')

  lines.push(row('Receipt #', d.receiptNo))
  lines.push(row('Date', d.date))
  if (d.cashierName) lines.push(row('Served by', d.cashierName))
  lines.push('<hr class="dash">')

  for (const item of d.items) {
    lines.push('<div class="item">')
    lines.push(`<div class="iname">${esc(item.name)}</div>`)
    const detail = `  ${item.qty} × ${peso(item.price)}${item.discount > 0 ? ` (-${peso(item.discount)})` : ''}`
    lines.push(row(detail, peso(item.total), 'irow'))
    lines.push('</div>')
  }
  lines.push('<hr class="dash">')

  lines.push(row('Subtotal', peso(d.subtotal)))
  if (d.voucherDiscount && d.voucherDiscount > 0) {
    const label = d.voucherCode ? `Voucher (${d.voucherCode})` : 'Discount'
    lines.push(row(label, `-${peso(d.voucherDiscount)}`))
  }
  lines.push('<hr class="solid">')
  lines.push(row('TOTAL', peso(d.total), 'tot'))
  lines.push('<hr class="solid">')

  lines.push(row(d.method.toUpperCase(), peso(d.paid)))
  if (d.change > 0) lines.push(row('CHANGE', peso(d.change), 'chg'))
  lines.push('<hr class="dash">')

  lines.push('<div class="ftr">')
  lines.push(`<p><strong>${esc(d.footer ?? 'Thank you for your purchase!')}</strong></p>`)
  lines.push('<p>Please come again</p>')
  if (d.transactionId) lines.push(`<p class="ref">Ref: ${esc(d.transactionId)}</p>`)
  lines.push(`<p class="ref">${esc(d.date)}</p>`)
  lines.push('</div>')
  // Feed spacer: a block element with explicit height is more reliable than
  // CSS padding for advancing paper past the cutter on thermal printers.
  // Padding at the end of the page body is often clipped by thermal drivers;
  // a block with height is respected as content and always printed.
  lines.push('<div class="feed"></div>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=220,initial-scale=1,maximum-scale=1">
<title>Receipt ${esc(d.receiptNo)}</title>
<style>
/* ── Reset ─────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}

/* ── Page: 58mm thermal roll ────────────────────────
   Side margins 1.5mm × 2 = 3mm → content width 55mm.
   Top 3mm gives a clean lead-in gap before the header.
   Bottom 0: the .feed spacer block handles the paper
   advance past the cutter — more reliable than @page
   margin-bottom which thermal drivers often ignore.    */
@page{size:58mm auto;margin:3mm 1.5mm 0}

/* ── Base ───────────────────────────────────────────── */
html,body{
  width:55mm;max-width:55mm;margin:0;
  font-family:'Courier New',Courier,'Lucida Console',monospace;
  font-size:8pt;line-height:1.5;
  color:#000;background:#fff;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* ── Logo / Header ───────────────────────────────────── */
.logo{
  display:block;width:14mm;height:14mm;object-fit:contain;
  margin:0 auto 2.5mm;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
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
/* margin-top on .iname creates the gap before each item.
   margin-bottom on .irow creates the gap after the price line.
   Together these make items clearly distinct without a wrapper div. */
.iname{font-weight:600;margin-top:3mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.irow{font-size:7.5pt;color:#222;margin-top:0.5mm;margin-bottom:1mm}

/* ── Totals ─────────────────────────────────────────── */
.tot{font-weight:700;font-size:10pt;margin:1mm 0}
.chg{font-weight:600}

/* ── Footer ─────────────────────────────────────────── */
.ftr{text-align:center;font-size:7.5pt;color:#444;padding:3mm 0 2mm}
.ftr p{margin:1.5mm 0}
.ftr .ref{font-size:6.5pt;color:#888;margin-top:2mm}

/* ── Feed spacer ────────────────────────────────────── */
/* Explicit block height is the most reliable way to advance thermal
   paper past the cutter. Thermal drivers respect block content height
   far more consistently than CSS padding or @page margin-bottom.
   25 mm clears the typical 20–25 mm cutter distance from print head. */
.feed{display:block;height:25mm;width:100%}
</style>
</head>
<body>
${lines.join('\n')}
</body>
</html>`
}

// ─── Non-blocking toast (replaces alert() — MEDIUM-08) ───────────────────────

function _showToast(message: string, isError = true): void {
  try {
    const el = document.createElement('div')
    el.style.cssText = [
      'position:fixed', 'top:20px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999',
      `background:${isError ? '#E5484D' : '#18181B'}`,
      'color:#fff', 'padding:12px 20px', 'border-radius:12px',
      'font-size:14px', 'font-family:system-ui,sans-serif',
      'box-shadow:0 8px 32px rgba(0,0,0,0.35)',
      'max-width:calc(100vw - 40px)', 'text-align:center',
      'line-height:1.45', 'pointer-events:none',
    ].join(';')
    el.textContent = message
    document.body.appendChild(el)
    // Fade out after 4 seconds
    setTimeout(() => {
      el.style.transition = 'opacity 0.4s'
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 400)
    }, 4000)
  } catch { /* DOM not ready; silently drop */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Print a receipt.
 *
 * On Android native with a saved Bluetooth printer:
 *   → connects if needed, then sends via bluetoothPrint (no browser dialog).
 *
 * On web / no BT device configured:
 *   → opens an isolated popup window and triggers the browser print dialog.
 */
export async function printThermalReceipt(data: ThermalReceiptData): Promise<void> {
  // ── BT path (Android native) ───────────────────────────────────────────────
  if (Capacitor.isNativePlatform()) {
    const { savedDevice, paperWidth, setStatus } = usePrinterStore.getState()

    if (savedDevice) {
      setStatus('printing')

      // Retry up to MAX_PRINT_RETRIES times (reconnect + reprint each attempt)
      const MAX_PRINT_RETRIES = 2
      let lastError = ''

      for (let attempt = 1; attempt <= MAX_PRINT_RETRIES; attempt++) {
        try {
          // Always verify connection before printing; reconnect if dropped
          const isConnected = await checkConnection()
          if (!isConnected) {
            setStatus('connecting')
            const result = await connectDevice(savedDevice.address)
            if (!result.isConnected && result.code !== 0) {
              lastError = result.desc ?? 'Could not connect to printer.'
              // Wait 800 ms before next attempt
              if (attempt < MAX_PRINT_RETRIES) await new Promise((r) => setTimeout(r, 800))
              continue
            }
          }
          setStatus('printing')
          await printBluetooth(data, paperWidth)
          setStatus('connected')
          return   // ← success
        } catch (err) {
          lastError = err instanceof Error ? err.message : 'Unknown print error'
          if (attempt < MAX_PRINT_RETRIES) {
            // Brief pause before retry
            await new Promise((r) => setTimeout(r, 800))
          }
        }
      }

      // All retries exhausted
      setStatus('error', lastError)
      _showToast(
        `Print failed after ${MAX_PRINT_RETRIES} attempt(s): ${lastError}\n` +
        `Check that "${savedDevice.name}" is on and in range.`,
      )
      return
    }
  }

  // ── Native with no printer configured ────────────────────────────────────
  // On native (Android), window.open() opens a browser — terrible UX.
  // If no BT printer is saved, just do nothing. The receipt is visible
  // on screen and the cashier can show it to the customer digitally.
  if (Capacitor.isNativePlatform()) return

  // ── Web browser popup fallback ─────────────────────────────────────────
  const html = buildHtml(data)

  const popup = window.open(
    '',
    '_blank',
    'width=220,height=700,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes',
  )

  if (!popup) {
    _showToast('Pop-ups are blocked. Allow pop-ups for this site, then click "Print Receipt" again.', false)
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
    setTimeout(() => { if (!popup.closed) popup.close() }, 120_000)
  }

  if (popup.document.readyState === 'complete') {
    setTimeout(doPrint, 150)
  } else {
    popup.addEventListener('load', () => setTimeout(doPrint, 150))
    setTimeout(() => { if (popup && !popup.closed) doPrint() }, 800)
  }
}
