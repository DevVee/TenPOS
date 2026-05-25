import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, XCircle, Loader2, AlertCircle, Lock } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { apiGetTransaction, apiVoidWithPin, apiReturnWithPin } from '../../lib/api'
import { verifyManagerPin } from '../../lib/db'
import { useApiData } from '../../hooks/useApiData'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface TxItem { id: string; product_name: string; sku: string; quantity: number; unit_price: number; discount: number; total: number }
interface TxPayment { method: string; amount: number; reference?: string }
interface TxDetail {
  id: string; receipt_no: string; created_at: string; staff_name: string; branch_name: string
  status: string; items: TxItem[]; payments: TxPayment[]
  subtotal: number; discount: number; tax: number; total: number; change: number; hash?: string
}

export function TransactionDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  // ── Void ─────────────────────────────────────────────────────────────────
  const [voidModal, setVoidModal]   = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidPin, setVoidPin]       = useState('')
  const [voiding, setVoiding]       = useState(false)
  const [voidError, setVoidError]   = useState('')

  // ── Return ────────────────────────────────────────────────────────────────
  const [returnModal, setReturnModal]       = useState(false)
  const [returnQtys, setReturnQtys]         = useState<Record<string, number>>({})
  const [returnReason, setReturnReason]     = useState('')
  const [returnReasonOther, setReturnReasonOther] = useState('')
  const [returnPin, setReturnPin]           = useState('')
  const [returning, setReturning]           = useState(false)
  const [returnError, setReturnError]       = useState('')

  const RETURN_REASONS = ['Defective item', 'Wrong size', 'Wrong color', 'Wrong item', 'Customer changed mind', 'Duplicate order', 'Other']
  const effectiveReturnReason = returnReason === 'Other' ? returnReasonOther.trim() : returnReason

  const { data: tx, loading, error, refetch } = useApiData<TxDetail>(
    () => apiGetTransaction(id!) as Promise<TxDetail>,
    [id]
  )

  const handleVoid = async () => {
    if (!voidReason.trim() || !id) return
    const ok = await verifyManagerPin(voidPin)
    if (!ok) { setVoidError('Incorrect manager PIN.'); return }
    setVoiding(true)
    setVoidError('')
    try {
      await apiVoidWithPin(id, voidReason.trim(), voidPin)
      setVoidModal(false)
      setVoidReason(''); setVoidPin('')
      refetch()
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void transaction')
    } finally {
      setVoiding(false)
    }
  }

  const openReturnModal = () => {
    if (!tx) return
    // Default: return 0 of each item (user selects qty)
    const init: Record<string, number> = {}
    tx.items.forEach((item) => { init[item.id] = 0 })
    setReturnQtys(init)
    setReturnReason('')
    setReturnPin('')
    setReturnError('')
    setReturnModal(true)
  }

  const handleReturn = async () => {
    if (!id || !tx) return
    const ok = await verifyManagerPin(returnPin)
    if (!ok) { setReturnError('Incorrect manager PIN.'); return }
    const items = tx.items
      .filter((item) => (returnQtys[item.id] ?? 0) > 0)
      .map((item) => ({ item_id: item.id, quantity: returnQtys[item.id], reason: effectiveReturnReason || undefined }))
    if (items.length === 0) { setReturnError('Select at least one item to return.'); return }
    setReturning(true)
    setReturnError('')
    try {
      await apiReturnWithPin(id, items, returnPin)
      setReturnModal(false)
      refetch()
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : 'Failed to process return')
    } finally {
      setReturning(false)
    }
  }

  const handleReprint = () => {
    if (!id) return
    // Navigate to Receipt page — it will load from Dexie via the id param
    navigate(`/pos/receipt/${id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-brand" />
      </div>
    )
  }

  if (error || !tx) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/transactions')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <p className="text-sm text-red-600">{error ?? 'Transaction not found'}</p>
        </div>
      </div>
    )
  }

  const date = new Date(tx.created_at).toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/transactions')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{tx.receipt_no}</h1>
            <p className="text-sm text-gray-400">{date}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={tx.status === 'completed' ? 'green' : tx.status === 'voided' ? 'red' : 'yellow'}>
            {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
          </Badge>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Transaction Info</p>
          <div className="space-y-2">
            {([
              ['Cashier', tx.staff_name],
              ['Branch', tx.branch_name],
              ['Date', date],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-medium text-gray-700 text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Payment</p>
          {tx.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">{p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
              <span className="font-medium text-gray-800">{fmt(Number(p.amount))}</span>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-2 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-700">{fmt(Number(tx.subtotal))}</span>
            </div>
            {Number(tx.discount) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>-{fmt(Number(tx.discount))}</span>
              </div>
            )}
            {Number(tx.tax) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">VAT (12%)</span>
                <span className="text-gray-700">{fmt(Number(tx.tax))}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span><span>{fmt(Number(tx.total))}</span>
            </div>
            {Number(tx.change) > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Change</span><span>{fmt(Number(tx.change))}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">Items Purchased ({tx.items.length})</p>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Product</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">SKU</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-400">Qty</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Price</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody>
            {tx.items.map((item) => (
              <tr key={item.id} className="table-row">
                <td className="px-4 py-3 text-sm font-medium text-gray-700">{item.product_name}</td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono">{item.sku}</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-center">{item.quantity}</td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right">{fmt(Number(item.unit_price))}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(Number(item.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex space-x-2">
        <button
          onClick={handleReprint}
          className="flex items-center space-x-1.5 flex-1 justify-center h-11 px-3 rounded-xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Printer className="w-4 h-4" /><span>Reprint</span>
        </button>
        {tx.status === 'completed' && (
          <>
            <button
              onClick={openReturnModal}
              className="flex items-center space-x-1.5 flex-1 justify-center h-11 px-3 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /><span>Return</span>
            </button>
            <button
              onClick={() => setVoidModal(true)}
              className="flex items-center space-x-1.5 flex-1 justify-center h-11 px-3 rounded-xl border-2 border-red-300 bg-red-50 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              <XCircle className="w-4 h-4" /><span>Void</span>
            </button>
          </>
        )}
      </div>

      {/* ── Void modal ─────────────────────────────────────────────────────── */}
      <Modal open={voidModal} onClose={() => { setVoidModal(false); setVoidReason(''); setVoidPin(''); setVoidError('') }} title="Void Transaction">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Void <strong>{tx.receipt_no}</strong> for {fmt(Number(tx.total))}? Stock will be restored and this cannot be undone.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Reason <span className="text-brand">*</span></label>
            <input
              className="input-base"
              placeholder="e.g. Customer changed mind"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              <span className="flex items-center" style={{ gap: '4px' }}>
                <Lock className="w-3 h-3 text-gray-500" /> Manager PIN required
              </span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              className="input-base font-mono tracking-widest"
              placeholder="Enter manager PIN"
              maxLength={8}
              value={voidPin}
              onChange={(e) => setVoidPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {voidError && (
            <div className="flex items-center text-sm text-red-600" style={{ gap: '8px' }}>
              <AlertCircle className="w-4 h-4" /> {voidError}
            </div>
          )}
          <div className="flex justify-end space-x-2 pt-1">
            <button onClick={() => { setVoidModal(false); setVoidReason(''); setVoidPin(''); setVoidError('') }} className="btn-secondary">Cancel</button>
            <button
              onClick={handleVoid}
              disabled={!voidReason.trim() || !voidPin || voiding}
              className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center" style={{ gap: '8px' }}
            >
              {voiding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm Void
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Return modal ───────────────────────────────────────────────────── */}
      <Modal open={returnModal} onClose={() => setReturnModal(false)} title="Process Return">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Select items and quantities to return from <strong>{tx.receipt_no}</strong>.</p>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {tx.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.product_name}</p>
                  <p className="text-xs text-gray-400">{fmt(Number(item.unit_price))} × {item.quantity} purchased</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500">Return:</span>
                  <input
                    type="number"
                    min="0"
                    max={item.quantity}
                    className="w-16 text-center text-sm font-bold border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    value={returnQtys[item.id] ?? 0}
                    onChange={(e) => {
                      const val = Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0))
                      setReturnQtys((q) => ({ ...q, [item.id]: val }))
                    }}
                  />
                  <span className="text-xs text-gray-400">/ {item.quantity}</span>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Return Reason</label>
            <select
              className="input-base"
              value={returnReason}
              onChange={(e) => { setReturnReason(e.target.value); if (e.target.value !== 'Other') setReturnReasonOther('') }}
            >
              <option value="">Select a reason…</option>
              {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {returnReason === 'Other' && (
              <input
                className="input-base mt-2"
                placeholder="Describe the reason…"
                value={returnReasonOther}
                onChange={(e) => setReturnReasonOther(e.target.value)}
                autoFocus
              />
            )}
          </div>

          {/* Refund preview */}
          {(() => {
            const refundTotal = tx.items.reduce((sum, item) => sum + Number(item.unit_price) * (returnQtys[item.id] ?? 0), 0)
            return refundTotal > 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium text-yellow-700">Refund amount</span>
                <span className="text-lg font-black text-yellow-800">{fmt(refundTotal)}</span>
              </div>
            ) : null
          })()}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              <span className="flex items-center" style={{ gap: '4px' }}>
                <Lock className="w-3 h-3 text-gray-500" /> Manager PIN required
              </span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              className="input-base font-mono tracking-widest"
              placeholder="Enter manager PIN"
              maxLength={8}
              value={returnPin}
              onChange={(e) => setReturnPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {returnError && (
            <div className="flex items-center text-sm text-red-600" style={{ gap: '8px' }}>
              <AlertCircle className="w-4 h-4" /> {returnError}
            </div>
          )}
          <div className="flex justify-end space-x-2 pt-1">
            <button onClick={() => setReturnModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleReturn}
              disabled={returning || !returnPin || Object.values(returnQtys).every((q) => q === 0) || (returnReason === 'Other' && !returnReasonOther.trim())}
              className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center" style={{ gap: '8px' }}
            >
              {returning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm Return
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
