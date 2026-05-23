import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Printer, ShoppingCart, WifiOff } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore } from '../../store/branchStore'

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
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const receipt = (location.state as { transaction?: ReceiptData } | null)?.transaction
  const { storeName, address } = useSettingsStore()
  const { user } = useAuthStore()
  const { activeBranchName, activeBranchAddress } = useBranchStore()

  const displayName    = activeBranchName    ?? storeName
  const displayAddress = activeBranchAddress ?? address

  const dateObj = receipt?.created_at ? new Date(receipt.created_at) : new Date()
  const date = dateObj.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  if (!receipt) {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <p className="text-gray-400 text-sm mb-4">Receipt data not available.</p>
        <button onClick={() => navigate('/pos')} className="btn-primary flex items-center justify-center gap-2 mx-auto px-6">
          <ShoppingCart className="w-4 h-4" /> New Sale
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto">
      {/* Actions */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => window.print()}
          className="btn-secondary flex items-center gap-1.5 flex-1 justify-center"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      {/* Offline badge */}
      {receipt.offline && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 mb-4 text-xs text-yellow-700 font-medium">
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
            alt={displayName}
            className="h-10 object-contain mx-auto mb-2"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <p className="font-bold text-gray-900 text-base">{displayName}</p>
          {displayAddress && <p className="text-xs text-gray-400">{displayAddress}</p>}
          <p className="text-xs text-gray-400 mt-1">{date}</p>
        </div>

        <div className="flex justify-between text-xs text-gray-500 mb-3">
          <span>Receipt #</span>
          <span className="font-semibold text-gray-700">{receipt.receiptNo}</span>
        </div>

        {/* Items */}
        <div className="border-t border-dashed border-gray-200 pt-3 mb-3 space-y-2">
          {receipt.items.map((item, i) => (
            <div key={`${item.name}-${i}`}>
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
          {(receipt.cashierName ?? user?.name) && (
            <p className="text-[11px] text-gray-400 mt-1">
              Served by: {receipt.cashierName ?? user?.name}
            </p>
          )}
          <p className="text-[10px] text-gray-300 mt-1">Ref: {id}</p>
        </div>
      </div>

      {/* New sale */}
      <button
        onClick={() => navigate('/pos')}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-4"
      >
        <ShoppingCart className="w-4 h-4" /> New Sale
      </button>
    </div>
  )
}
