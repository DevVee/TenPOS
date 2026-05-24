import { useEffect, useRef } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Printer, ShoppingCart, WifiOff } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore } from '../../store/branchStore'
import { printThermalReceipt } from '../../lib/thermalPrint'
import type { ThermalReceiptData } from '../../lib/thermalPrint'

interface ReceiptItem {
  name: string
  qty: number
  price: number
  discount: number
  total: number
}

interface ReceiptData {
  receiptNo: string
  offline: boolean
  created_at?: string
  cashierName?: string
  items: ReceiptItem[]
  subtotal: number
  voucherDiscount: number
  voucherCode?: string
  total: number
  paid: number
  change: number
  method: string
}

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

export function Receipt() {
  const navigate  = useNavigate()
  const { id }    = useParams()
  const location  = useLocation()
  const state     = location.state as { transaction?: ReceiptData; autoPrint?: boolean } | null
  const receipt   = state?.transaction
  const autoPrint = state?.autoPrint ?? false

  const { storeName, address } = useSettingsStore()
  const { user }               = useAuthStore()
  const { activeBranchName, activeBranchAddress } = useBranchStore()

  const displayName    = activeBranchName    ?? storeName
  const displayAddress = activeBranchAddress ?? address

  // ── Fallback @page rule for Ctrl+P direct print ──────────────────────────
  // Uses `position: absolute` (NOT fixed) so the browser can correctly
  // expand the 58mm auto-height page to fit the receipt content.
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'receipt-print-style'
    style.textContent = `
      @media print {
        /* Override the global A4 @page from index.css */
        @page {
          size: 58mm auto !important;
          margin: 2mm 1.5mm !important;
        }
        /* Hide everything except the receipt */
        body * { visibility: hidden !important; }
        #receipt-print-area,
        #receipt-print-area * { visibility: visible !important; }
        /* Position at top-left of the 58mm page — use absolute, not fixed */
        #receipt-print-area {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 55mm !important;
          font-family: 'Courier New', Courier, monospace !important;
          font-size: 8pt !important;
          line-height: 1.35 !important;
          color: #000 !important;
          background: white !important;
        }
        /* Strip card chrome */
        #receipt-print-area .card {
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          padding: 2mm !important;
          background: white !important;
        }
        /* Separators */
        #receipt-print-area hr {
          border-top: 1px dashed #000 !important;
          border-left: none !important;
          border-right: none !important;
          border-bottom: none !important;
          margin: 2mm 0 !important;
        }
        /* Force monospace + black text everywhere inside the receipt */
        #receipt-print-area * {
          font-family: 'Courier New', Courier, monospace !important;
          color: #000 !important;
          background: transparent !important;
        }
        /* Actions / badges hidden during print */
        .no-print, [class*="print:hidden"] { display: none !important; }
      }
    `
    document.head.appendChild(style)
    return () => document.getElementById('receipt-print-style')?.remove()
  }, [])

  // ── Build ThermalReceiptData from state ───────────────────────────────────
  function toThermalData(): ThermalReceiptData | null {
    if (!receipt) return null
    const dateObj = receipt.created_at ? new Date(receipt.created_at) : new Date()
    return {
      storeName:       displayName,
      address:         displayAddress || undefined,
      receiptNo:       receipt.receiptNo,
      date:            dateObj.toLocaleDateString('en-PH', {
                         year: 'numeric', month: 'short', day: 'numeric',
                         hour: '2-digit', minute: '2-digit',
                       }),
      cashierName:     receipt.cashierName ?? user?.name,
      items:           receipt.items,
      subtotal:        receipt.subtotal,
      voucherDiscount: receipt.voucherDiscount || undefined,
      voucherCode:     receipt.voucherCode,
      total:           receipt.total,
      paid:            receipt.paid,
      change:          receipt.change,
      method:          receipt.method,
      transactionId:   id,
    }
  }

  // ── Auto-print on new order ───────────────────────────────────────────────
  const didPrint = useRef(false)
  useEffect(() => {
    if (!autoPrint || !receipt || didPrint.current) return
    didPrint.current = true
    const thermal = toThermalData()
    if (!thermal) return
    const t = setTimeout(() => printThermalReceipt(thermal), 400)
    return () => clearTimeout(t)
  }, [autoPrint, receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  const dateObj = receipt?.created_at ? new Date(receipt.created_at) : new Date()
  const date = dateObj.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  if (!receipt) {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <p className="text-gray-400 text-sm mb-4">Receipt data not available.</p>
        <button
          onClick={() => navigate('/pos')}
          className="btn-primary flex items-center justify-center gap-2 mx-auto px-6"
        >
          <ShoppingCart className="w-4 h-4" /> New Sale
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto">

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 no-print">
        <button
          onClick={() => {
            const thermal = toThermalData()
            if (thermal) printThermalReceipt(thermal)
          }}
          className="btn-secondary flex items-center gap-1.5 flex-1 justify-center"
        >
          <Printer className="w-4 h-4" /> Print Receipt
        </button>
      </div>

      {receipt.offline && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-4 text-xs text-yellow-700 font-medium no-print">
          <WifiOff className="w-3.5 h-3.5" />
          Saved offline — will sync when connected
        </div>
      )}

      {/* ── Receipt — mirrors thermal print layout exactly ───────────────────── */}
      <div id="receipt-print-area">
        <div className="card font-mono">

          {/* Header */}
          <div className="text-center px-5 pt-5 pb-3">
            <p className="font-bold text-sm leading-snug text-gray-900">{displayName}</p>
            {displayAddress && (
              <p className="text-[11px] text-gray-500 mt-1 leading-snug whitespace-pre-wrap">{displayAddress}</p>
            )}
          </div>

          <div className="border-t border-dashed border-gray-300 mx-5" />

          {/* Receipt meta */}
          <div className="px-5 py-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Receipt #</span>
              <span className="font-semibold text-gray-800">{receipt.receiptNo}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Date</span>
              <span className="text-gray-700">{date}</span>
            </div>
            {(receipt.cashierName ?? user?.name) && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Cashier</span>
                <span className="text-gray-700">{receipt.cashierName ?? user?.name}</span>
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-gray-300 mx-5" />

          {/* Items */}
          <div className="px-5 py-3 space-y-2.5">
            {receipt.items.map((item, i) => (
              <div key={`${item.name}-${i}`}>
                <p className="text-xs font-semibold text-gray-900 leading-snug truncate">{item.name}</p>
                <div className="flex justify-between text-[11px] text-gray-500 mt-0.5">
                  <span>
                    {'  '}{item.qty} × {fmt(item.price)}
                    {item.discount > 0 && ` (-${fmt(item.discount)})`}
                  </span>
                  <span className="font-semibold text-gray-800">{fmt(item.total)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-300 mx-5" />

          {/* Subtotal / Voucher */}
          <div className="px-5 py-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-700">{fmt(receipt.subtotal)}</span>
            </div>
            {receipt.voucherDiscount > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">
                  Voucher{receipt.voucherCode ? ` (${receipt.voucherCode})` : ''}
                </span>
                <span className="text-green-600">-{fmt(receipt.voucherDiscount)}</span>
              </div>
            )}
          </div>

          {/* TOTAL — solid borders, prominent */}
          <div className="flex justify-between items-baseline font-bold text-sm px-5 py-3 border-y-[1.5px] border-gray-800">
            <span>TOTAL</span>
            <span>{fmt(receipt.total)}</span>
          </div>

          {/* Payment / Change */}
          <div className="px-5 py-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">{receipt.method.toUpperCase()}</span>
              <span className="text-gray-700">{fmt(receipt.paid)}</span>
            </div>
            {receipt.change > 0 && (
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-gray-700">CHANGE</span>
                <span className="text-gray-900">{fmt(receipt.change)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-dashed border-gray-300 mx-5" />

          {/* Footer */}
          <div className="text-center px-5 pt-3 pb-5 space-y-1.5">
            <p className="text-[11px] text-gray-400">Thank you for your purchase!</p>
            {id && <p className="text-[10px] text-gray-300">Ref: {id}</p>}
          </div>

        </div>
      </div>

      <button
        onClick={() => navigate('/pos')}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-4 no-print"
      >
        <ShoppingCart className="w-4 h-4" /> New Sale
      </button>

    </div>
  )
}
