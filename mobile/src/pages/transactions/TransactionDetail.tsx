import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { apiGetTransaction, apiVoidTransaction, apiVoidWithPin, apiReturnTransaction } from '../../lib/api'
import { useSettingsStore } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import { verifyDevicePin } from '../../lib/db'
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
  const { user } = useAuthStore()
  const settings = useSettingsStore()

  // ── Void ─────────────────────────────────────────────────────────────────
  const [voidModal, setVoidModal]   = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidPin, setVoidPin]       = useState('')
  const [voiding, setVoiding]       = useState(false)
  const [voidError, setVoidError]   = useState('')

  // ── Return ────────────────────────────────────────────────────────────────
  const [returnModal, setReturnModal]   = useState(false)
  const [returnQtys, setReturnQtys]     = useState<Record<string, number>>({})
  const [returnReason, setReturnReason] = useState('')
  const [returning, setReturning]       = useState(false)
  const [returnError, setReturnError]   = useState('')

  const { data: tx, loading, error, refetch } = useApiData<TxDetail>(
    () => apiGetTransaction(id!) as Promise<TxDetail>,
    [id]
  )

  /** PIN auth needed for void when setting is on and user is cashier */
  const requiresVoidPin = settings.requirePinForVoid && user?.role === 'cashier'

  const handleVoid = async () => {
    if (!voidReason.trim() || !id) return
    setVoiding(true)
    setVoidError('')
    try {
      if (requiresVoidPin) {
        // Cashier path — verify device PIN locally (works offline)
        const ok = await verifyDevicePin(voidPin)
        if (!ok) { setVoidError('Incorrect PIN.'); setVoiding(false); return }
        await apiVoidWithPin(id, voidReason.trim(), voidPin)
      } else {
        await apiVoidTransaction(id, voidReason.trim())
      }
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
    setReturnError('')
    setReturnModal(true)
  }

  const handleReturn = async () => {
    if (!id || !tx) return
    const items = tx.items
      .filter((item) => (returnQtys[item.id] ?? 0) > 0)
      .map((item) => ({ item_id: item.id, quantity: returnQtys[item.id], reason: returnReason.trim() || undefined }))
    if (items.length === 0) { setReturnError('Select at least one item to return.'); return }
    setReturning(true)
    setReturnError('')
    try {
      await apiReturnTransaction(id, items)
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
        <div className="flex items-center gap-2">
          <Badge variant={tx.status === 'completed' ? 'green' : tx.status === 'voided' ? 'red' : 'yellow'}>{tx.status}</Badge>
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
      <div className="flex gap-2">
        <button
          onClick={handleReprint}
          className="btn-secondary flex items-center gap-1.5 flex-1 justify-center"
        >
          <Printer className="w-4 h-4" /> Reprint Receipt
        </button>
        {tx.status === 'completed' && (
          <>
            <button
              onClick={openReturnModal}
              className="btn-secondary flex items-center gap-1.5 flex-1 justify-center text-yellow-600 border-yellow-200 hover:bg-yellow-50"
            >
              <RotateCcw className="w-4 h-4" /> Return
            </button>
            <button
              onClick={() => setVoidModal(true)}
              className="btn-secondary flex items-center gap-1.5 flex-1 justify-center text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4" /> Void
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
          {requiresVoidPin && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Manager PIN required <span className="text-brand">*</span>
              </label>
              <input
                type="password"
                className="input-base font-mono tracking-widest"
                placeholder="Enter your 4-digit PIN"
                maxLength={4}
                value={voidPin}
                onChange={(e) => setVoidPin(e.target.value.replace(/\D/g, ''))}
              />
              <p className="text-xs text-gray-400 mt-1">Void transactions require PIN authorization.</p>
            </div>
          )}
          {voidError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> {voidError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setVoidModal(false); setVoidReason(''); setVoidPin(''); setVoidError('') }} className="btn-secondary">Cancel</button>
            <button
              onClick={handleVoid}
              disabled={!voidReason.trim() || voiding || (requiresVoidPin && voidPin.length < 4)}
              className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
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
            <input
              className="input-base"
              placeholder="e.g. Defective item, wrong size"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />
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

          {returnError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> {returnError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setReturnModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleReturn}
              disabled={returning || Object.values(returnQtys).every((q) => q === 0)}
              className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
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
