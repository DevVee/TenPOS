import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Printer, ShoppingCart, WifiOff, Loader2, ArrowLeft } from 'lucide-react'
import { db } from '../../lib/db'
import { useSettingsStore } from '../../store/settingsStore'
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
  branchName?: string
  cashierName?: string
  items: ReceiptItem[]
  subtotal: number
  voucherDiscount: number
  voucherCode?: string
  total: number
  paid: number
  change: number
  method: string
  createdAt?: string   // ISO timestamp from the actual transaction
}

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

export function Receipt() {
  const navigate = useNavigate()
  const { id }   = useParams()
  const location = useLocation()

  const locationState = location.state as { transaction?: ReceiptData; autoPrint?: boolean } | null
  const stateReceipt  = locationState?.transaction
  const autoPrint     = locationState?.autoPrint ?? false

  const [receipt,  setReceipt]  = useState<ReceiptData | null>(stateReceipt ?? null)
  const [loading,  setLoading]  = useState(!stateReceipt && !!id)
  const didPrint = useRef(false)

  const { storeName, address, receiptFooter } = useSettingsStore()

  // ── Fallback @page for Ctrl+P ─────────────────────────────────────────────
  // Primary printing uses the popup utility below; this is only if the user
  // presses Ctrl+P manually.  Uses position:absolute so page height auto-
  // expands to fit the receipt content (NOT position:fixed which clips it).
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'receipt-print-style'
    style.textContent = `
      @media print {
        /* Override any global A4 @page rule */
        @page { size: 58mm auto !important; margin: 2mm 1.5mm !important; }
        body * { visibility: hidden !important; }
        #receipt-print-area,
        #receipt-print-area * { visibility: visible !important; }
        #receipt-print-area {
          position: absolute !important;
          top: 0 !important; left: 0 !important;
          width: 55mm !important;
          font-family: 'Courier New', Courier, monospace !important;
          font-size: 8pt !important;
          line-height: 1.35 !important;
          color: #000 !important;
          background: white !important;
        }
        #receipt-print-area .card {
          box-shadow: none !important; border: none !important;
          border-radius: 0 !important; padding: 2mm !important;
          background: white !important;
        }
        #receipt-print-area hr {
          border-top: 1px dashed #000 !important;
          border-left: none !important; border-right: none !important;
          border-bottom: none !important; margin: 2mm 0 !important;
        }
        #receipt-print-area * {
          font-family: 'Courier New', Courier, monospace !important;
          color: #000 !important; background: transparent !important;
        }
        .print\\:hidden { display: none !important; }
      }
    `
    document.head.appendChild(style)
    return () => { document.getElementById('receipt-print-style')?.remove() }
  }, [])

  // ── Load from Dexie when state is missing (refresh / back-forward) ────────
  useEffect(() => {
    if (stateReceipt || !id) return
    db.transactions.get(id).then((txn) => {
      if (txn) {
        setReceipt({
          receiptNo:      txn.receipt_no,
          offline:        txn.is_offline,
          branchName:     txn.branch_name,
          cashierName:    txn.staff_name,
          items:          txn.items.map((i) => ({
            name:     i.product_name,
            qty:      i.quantity,
            price:    i.unit_price,
            discount: i.discount,
            total:    i.total,
          })),
          subtotal:        txn.subtotal,
          voucherDiscount: txn.discount,
          total:           txn.total,
          paid:            txn.payments[0]?.amount ?? txn.total,
          change:          txn.change,
          method:          txn.payment_method,
          createdAt:       txn.created_at,
        })
      }
    }).finally(() => setLoading(false))
  }, [id, stateReceipt])

  // ── Build ThermalReceiptData ──────────────────────────────────────────────
  function toThermalData(): ThermalReceiptData | null {
    if (!receipt) return null
    const thermalDate = (receipt.createdAt ? new Date(receipt.createdAt) : new Date())
      .toLocaleDateString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    return {
      storeName:       storeName || 'My Store',
      address:         address || undefined,
      branchName:      receipt.branchName,
      receiptNo:       receipt.receiptNo,
      date:            thermalDate,
      cashierName:     receipt.cashierName,
      items:           receipt.items,
      subtotal:        receipt.subtotal,
      voucherDiscount: receipt.voucherDiscount || undefined,
      voucherCode:     receipt.voucherCode,
      total:           receipt.total,
      paid:            receipt.paid,
      change:          receipt.change,
      method:          receipt.method,
      transactionId:   id,
      footer:          receiptFooter || undefined,
    }
  }

  // ── Auto-print on new order ───────────────────────────────────────────────
  useEffect(() => {
    if (!autoPrint || !receipt || didPrint.current) return
    didPrint.current = true
    const thermal = toThermalData()
    if (!thermal) return
    const t = setTimeout(() => printThermalReceipt(thermal), 350)
    return () => clearTimeout(t)
  }, [autoPrint, receipt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Use the actual transaction timestamp; fall back to now only for brand-new receipts
  const txDate = receipt?.createdAt ? new Date(receipt.createdAt) : new Date()
  const date = txDate.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  if (loading) {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading receipt…</p>
      </div>
    )
  }

  if (!receipt) {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <p className="text-gray-400 text-sm mb-4">Receipt not found.</p>
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
      <div className="flex gap-2 mb-4 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="btn-secondary flex items-center gap-1.5 justify-center px-3"
          title="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            const thermal = toThermalData()
            if (thermal) printThermalReceipt(thermal)
          }}
          className="btn-primary flex items-center gap-1.5 flex-1 justify-center"
        >
          <Printer className="w-4 h-4" /> Print Receipt
        </button>
        <button
          onClick={() => navigate('/pos')}
          className="btn-secondary flex items-center gap-1.5 justify-center px-3"
          title="New sale"
        >
          <ShoppingCart className="w-4 h-4" />
        </button>
      </div>

      {receipt.offline && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-4 text-xs text-yellow-700 font-medium print:hidden">
          <WifiOff className="w-3.5 h-3.5" />
          Saved offline — will sync when connected
        </div>
      )}

      {/* ── Receipt — mirrors thermal print layout exactly ───────────────────── */}
      <div id="receipt-print-area">
        <div className="card font-mono">

          {/* Header */}
          <div className="text-center px-5 pt-6 pb-4">
            <img
              src="/brand/logo.png"
              alt={storeName}
              className="w-12 h-12 object-contain mx-auto mb-2"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <p className="font-bold text-base leading-snug text-gray-900">{storeName || 'My Store'}</p>
            {address    && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{address}</p>}
            {receipt.branchName && <p className="text-[11px] text-gray-400 mt-0.5">{receipt.branchName}</p>}
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
            {receipt.cashierName && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Served by</span>
                <span className="text-gray-700">{receipt.cashierName}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Items</span>
              <span className="text-gray-700">
                {receipt.items.reduce((s, i) => s + i.qty, 0)} pc{receipt.items.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
                {' '}({receipt.items.length} line{receipt.items.length !== 1 ? 's' : ''})
              </span>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-300 mx-5" />

          {/* Items */}
          <div className="px-5 py-4 space-y-3.5">
            {receipt.items.map((item, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-gray-900 leading-snug">{item.name}</p>
                <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                  <span>
                    {item.qty} × {fmt(item.price)}
                    {item.discount > 0 && <span className="text-green-600 ml-1">(-{fmt(item.discount)})</span>}
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
                <span className="text-gray-500">Voucher {receipt.voucherCode ? `(${receipt.voucherCode})` : ''}</span>
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
          <div className="text-center px-5 pt-4 pb-6 space-y-2">
            <p className="text-xs font-semibold text-gray-500">
              {receiptFooter || 'Thank you for your purchase!'}
            </p>
            <p className="text-[11px] text-gray-400">Please come again</p>
            {id && (
              <p className="text-[10px] text-gray-300 pt-1 font-mono break-all">Ref: {id}</p>
            )}
            <p className="text-[10px] text-gray-300">{date}</p>
          </div>

        </div>
      </div>

      <button
        onClick={() => navigate('/pos')}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-4 print:hidden"
      >
        <ShoppingCart className="w-4 h-4" /> New Sale
      </button>

    </div>
  )
}
