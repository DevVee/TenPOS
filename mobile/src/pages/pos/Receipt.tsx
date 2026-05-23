import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Printer, ShoppingCart, WifiOff, Loader2, ArrowLeft } from 'lucide-react'
import { db } from '../../lib/db'

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
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()

  // Prefer location.state (fastest path); fall back to Dexie on refresh/restart
  const stateReceipt = (location.state as { transaction?: ReceiptData } | null)?.transaction
  const [receipt, setReceipt] = useState<ReceiptData | null>(stateReceipt ?? null)
  const [loading, setLoading] = useState(!stateReceipt && !!id)

  // Inject @page style for thermal-printer-friendly output (80mm roll)
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'receipt-print-style'
    style.textContent = `
      @media print {
        @page { size: 80mm auto; margin: 4mm; }
        body { background: white !important; }
      }
    `
    document.head.appendChild(style)
    return () => {
      const el = document.getElementById('receipt-print-style')
      if (el) el.remove()
    }
  }, [])

  useEffect(() => {
    if (stateReceipt || !id) return
    // Restore from Dexie cache when state was lost (refresh, back+forward, app restart)
    db.transactions.get(id).then((txn) => {
      if (txn) {
        setReceipt({
          receiptNo:      txn.receipt_no,
          offline:        txn.is_offline,
          branchName:     txn.branch_name,
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
        })
      }
    }).finally(() => setLoading(false))
  }, [id, stateReceipt])

  const date = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
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
        <button onClick={() => navigate('/pos')} className="btn-primary flex items-center justify-center gap-2 mx-auto px-6">
          <ShoppingCart className="w-4 h-4" /> New Sale
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto">
      {/* Actions — hidden when printing */}
      <div className="flex gap-2 mb-4 print:hidden">
        <button
          onClick={() => navigate(-1)}
          className="btn-secondary flex items-center gap-1.5 justify-center px-3"
          title="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => window.print()}
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

      {/* Offline badge — hidden when printing */}
      {receipt.offline && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-4 text-xs text-yellow-700 font-medium print:hidden">
          <WifiOff className="w-3.5 h-3.5" />
          Saved offline — will sync when connected
        </div>
      )}

      {/* Receipt card */}
      <div className="card p-5 font-mono text-sm">
        {/* Header */}
        <div className="text-center mb-4 border-b border-dashed border-gray-200 pb-4">
          <img
            src="/brand/logo.png"
            alt="TEN Foundation Philippines"
            className="h-10 object-contain mx-auto mb-2"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <p className="font-bold text-gray-900 text-base">TenPOS</p>
          <p className="text-xs text-gray-500">Ten Foundation Philippines Inc.</p>
          {receipt.branchName && (
            <p className="text-xs text-gray-400">{receipt.branchName}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{date}</p>
        </div>

        <div className="flex justify-between text-xs text-gray-500 mb-3">
          <span>Receipt #</span>
          <span className="font-semibold text-gray-700">{receipt.receiptNo}</span>
        </div>

        {/* Items */}
        <div className="border-t border-dashed border-gray-200 pt-3 mb-3 space-y-2">
          {receipt.items.map((item, i) => (
            <div key={i}>
              <p className="text-xs text-gray-800 font-medium">{item.name}</p>
              <div className="flex justify-between text-xs text-gray-500">
                <span>
                  {item.qty} × {fmt(item.price)}
                  {item.discount > 0 && ` (disc -${fmt(item.discount)})`}
                </span>
                <span className="font-medium text-gray-700">{fmt(item.total)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t border-dashed border-gray-200 pt-3 space-y-1.5 mb-3">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Subtotal</span>
            <span>{fmt(receipt.subtotal)}</span>
          </div>
          {receipt.voucherDiscount > 0 && (
            <div className="flex justify-between text-xs text-green-600">
              <span>Voucher {receipt.voucherCode ? `(${receipt.voucherCode})` : ''}</span>
              <span>-{fmt(receipt.voucherDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-dashed border-gray-200">
            <span>TOTAL</span><span className="text-brand">{fmt(receipt.total)}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-200 pt-3 space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Payment ({receipt.method.toUpperCase()})</span>
            <span>{fmt(receipt.paid)}</span>
          </div>
          {receipt.change > 0 && (
            <div className="flex justify-between text-xs font-semibold text-green-700">
              <span>Change</span><span>{fmt(receipt.change)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-5 pt-4 border-t border-dashed border-gray-200">
          <p className="text-xs text-gray-400">Thank you for your purchase!</p>
          <p className="text-[10px] text-gray-300 mt-1">Ref: {id}</p>
        </div>
      </div>

      {/* New sale — hidden when printing */}
      <button
        onClick={() => navigate('/pos')}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-4 print:hidden"
      >
        <ShoppingCart className="w-4 h-4" /> New Sale
      </button>
    </div>
  )
}
