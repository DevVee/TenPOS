import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { apiGetTransaction, apiVoidTransaction } from '../../lib/api'
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
  const [voidModal, setVoidModal] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)
  const [voidError, setVoidError] = useState('')

  const { data: tx, loading, error, refetch } = useApiData<TxDetail>(
    () => apiGetTransaction(id!) as Promise<TxDetail>,
    [id]
  )

  const handleVoid = async () => {
    if (!voidReason.trim() || !id) return
    setVoiding(true)
    setVoidError('')
    try {
      await apiVoidTransaction(id, voidReason.trim())
      setVoidModal(false)
      refetch()
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void transaction')
    } finally {
      setVoiding(false)
    }
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
            {[
              ['Cashier', tx.staff_name],
              ['Branch', tx.branch_name],
              ['Date', date],
              tx.hash ? ['Integrity Hash', <span key="hash" className="font-mono text-xs text-gray-400">{tx.hash}</span>] : null,
            ].filter((item): item is [string, React.ReactNode] => item !== null).map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3">
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

      <div className="flex gap-2">
        <button className="btn-secondary flex items-center gap-1.5 flex-1 justify-center">
          <Printer className="w-4 h-4" /> Reprint Receipt
        </button>
        {tx.status === 'completed' && (
          <>
            <button className="btn-secondary flex items-center gap-1.5 flex-1 justify-center text-yellow-600 border-yellow-200 hover:bg-yellow-50">
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

      {/* Void confirmation modal */}
      <Modal open={voidModal} onClose={() => setVoidModal(false)} title="Void Transaction">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Void <strong>{tx.receipt_no}</strong> for {fmt(Number(tx.total))}? This will restore stock and cannot be undone.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Reason for void <span className="text-brand">*</span></label>
            <input
              className="input-base"
              placeholder="e.g. Customer changed mind"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </div>
          {voidError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> {voidError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setVoidModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleVoid}
              disabled={!voidReason.trim() || voiding}
              className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {voiding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm Void
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
