import { useState, useCallback, useEffect } from 'react'
import { Search, RotateCcw, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { Modal } from '../../components/ui/Modal'
import { apiGetTransactions, apiVoidTransaction, apiGetTransaction, apiReturnTransaction } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useApiData } from '../../hooks/useApiData'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface Txn {
  id: string; receipt_no: string; status: string
  total: number; staff_name: string; created_at: string
}
interface TxnItem { id: string; product_name: string; quantity: number; total: number }
interface TxnDetail extends Txn { items: TxnItem[] }

export function Returns() {
  const [search,      setSearch]      = useState('')
  const [voidModal,   setVoidModal]   = useState(false)
  const [returnModal, setReturnModal] = useState(false)
  const [tick,        setTick]        = useState(0)

  // Void modal state
  const [voidReceipt,  setVoidReceipt]  = useState('')
  const [voidReason,   setVoidReason]   = useState('')
  const [voidTxn,      setVoidTxn]      = useState<Txn | null>(null)
  const [voidSearching, setVoidSearching] = useState(false)
  const [voidError,    setVoidError]    = useState('')
  const [voidSaving,   setVoidSaving]   = useState(false)

  // Return modal state
  const [retReceipt,   setRetReceipt]   = useState('')
  const [retTxn,       setRetTxn]       = useState<TxnDetail | null>(null)
  const [retSearching, setRetSearching] = useState(false)
  const [retError,     setRetError]     = useState('')
  const [retSaving,    setRetSaving]    = useState(false)

  const fetchReturns = useCallback(
    () => Promise.all([
      apiGetTransactions({ status: 'voided',   limit: '50', sort: 'desc' }) as Promise<{ data: Txn[] }>,
      apiGetTransactions({ status: 'returned', limit: '50', sort: 'desc' }) as Promise<{ data: Txn[] }>,
    ]).then(([voided, returned]) => ({
      data: [...voided.data, ...returned.data].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  )
  const { data, loading, error } = useApiData(fetchReturns, [tick])
  const entries = data?.data ?? []

  // ── Realtime: refresh when a void or return is processed ─────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('returns-rt')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'transactions' },
        () => setTick((t) => t + 1),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'returns' },
        () => setTick((t) => t + 1),
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  const filtered = entries.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.receipt_no?.toLowerCase().includes(q) || r.staff_name?.toLowerCase().includes(q)
  })

  // — Void flow —
  const searchVoidTxn = async () => {
    if (!voidReceipt.trim()) return
    setVoidSearching(true)
    setVoidError('')
    setVoidTxn(null)
    try {
      const res = await apiGetTransactions({ search: voidReceipt.trim(), limit: '1' }) as { data: Txn[] }
      const found = res.data[0]
      if (!found) { setVoidError('Transaction not found.'); return }
      if (found.status !== 'completed') { setVoidError(`Transaction is already ${found.status}.`); return }
      setVoidTxn(found)
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setVoidSearching(false)
    }
  }

  const submitVoid = async () => {
    if (!voidTxn || !voidReason) return
    setVoidSaving(true)
    setVoidError('')
    try {
      await apiVoidTransaction(voidTxn.id, voidReason)
      setVoidModal(false)
      setVoidReceipt('')
      setVoidReason('')
      setVoidTxn(null)
      setTick((t) => t + 1)
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void transaction')
    } finally {
      setVoidSaving(false)
    }
  }

  // — Return flow —
  const searchReturnTxn = async () => {
    if (!retReceipt.trim()) return
    setRetSearching(true)
    setRetError('')
    setRetTxn(null)
    try {
      const res = await apiGetTransactions({ search: retReceipt.trim(), limit: '1' }) as { data: Txn[] }
      const found = res.data[0]
      if (!found) { setRetError('Transaction not found.'); return }
      if (found.status !== 'completed') { setRetError(`Transaction is already ${found.status}.`); return }
      const detail = await apiGetTransaction(found.id) as TxnDetail
      setRetTxn(detail)
    } catch (err) {
      setRetError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setRetSearching(false)
    }
  }

  const submitReturn = async () => {
    if (!retTxn) return
    setRetSaving(true)
    setRetError('')
    try {
      await apiReturnTransaction(
        retTxn.id,
        retTxn.items.map((item) => ({ item_id: item.id, quantity: item.quantity }))
      )
      setReturnModal(false)
      setRetReceipt('')
      setRetTxn(null)
      setTick((t) => t + 1)
    } catch (err) {
      setRetError(err instanceof Error ? err.message : 'Failed to process return')
    } finally {
      setRetSaving(false)
    }
  }

  const closeVoidModal = () => {
    setVoidModal(false)
    setVoidReceipt('')
    setVoidReason('')
    setVoidTxn(null)
    setVoidError('')
  }

  const closeReturnModal = () => {
    setReturnModal(false)
    setRetReceipt('')
    setRetTxn(null)
    setRetError('')
  }

  return (
    <div>
      <PageHeader
        title="Returns & Voids"
        subtitle="Manager-approved returns and voided transactions"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setReturnModal(true)} className="btn-secondary flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4" /> Process Return
            </button>
            <button onClick={() => setVoidModal(true)} className="btn-secondary flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
              <XCircle className="w-4 h-4" /> Void Transaction
            </button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input-base pl-9" placeholder="Search by receipt or cashier..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && (
        <div className="card p-4 mb-4 text-sm text-red-600 bg-red-50 border-red-100">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Receipt #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">Cashier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No returns or voids found</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="table-row">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-brand">{r.receipt_no}</td>
                    <td className="px-4 py-3">
                      <Badge variant={r.status === 'voided' ? 'red' : 'yellow'}>
                        {r.status === 'voided' ? 'Void' : 'Return'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{r.staff_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                      {new Date(r.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-brand text-right">-{fmt(Number(r.total))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Void Modal */}
      <Modal open={voidModal} onClose={closeVoidModal} title="Void Transaction">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Transaction / Receipt #</label>
            <div className="flex gap-2">
              <input
                className="input-base flex-1"
                placeholder="RCP-20250516-..."
                value={voidReceipt}
                onChange={(e) => setVoidReceipt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchVoidTxn()}
              />
              <button
                onClick={searchVoidTxn}
                disabled={voidSearching || !voidReceipt.trim()}
                className="btn-secondary flex items-center gap-1.5 disabled:opacity-50"
              >
                {voidSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Find
              </button>
            </div>
          </div>

          {voidTxn && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Receipt</span><span className="font-mono font-medium">{voidTxn.receipt_no}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Cashier</span><span>{voidTxn.staff_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-semibold text-brand">{fmt(Number(voidTxn.total))}</span></div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Reason for Void</label>
            <select className="input-base" value={voidReason} onChange={(e) => setVoidReason(e.target.value)}>
              <option value="">Select reason...</option>
              <option>Duplicate transaction</option>
              <option>Input error</option>
              <option>Customer request</option>
              <option>System error</option>
              <option>Other</option>
            </select>
          </div>

          {voidError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> {voidError}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={closeVoidModal} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={submitVoid}
              disabled={!voidTxn || !voidReason || voidSaving}
              className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {voidSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Void Transaction
            </button>
          </div>
        </div>
      </Modal>

      {/* Return Modal */}
      <Modal open={returnModal} onClose={closeReturnModal} title="Process Return">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Transaction / Receipt #</label>
            <div className="flex gap-2">
              <input
                className="input-base flex-1"
                placeholder="RCP-20250516-..."
                value={retReceipt}
                onChange={(e) => setRetReceipt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchReturnTxn()}
              />
              <button
                onClick={searchReturnTxn}
                disabled={retSearching || !retReceipt.trim()}
                className="btn-secondary flex items-center gap-1.5 disabled:opacity-50"
              >
                {retSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Find
              </button>
            </div>
          </div>

          {retTxn && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-gray-500">Receipt</span><span className="font-mono font-medium">{retTxn.receipt_no}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-semibold text-brand">{fmt(Number(retTxn.total))}</span></div>
              {retTxn.items?.length > 0 && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-400 mb-1.5">Items to return:</p>
                  {retTxn.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-xs">
                      <span className="text-gray-600">{item.product_name} × {item.quantity}</span>
                      <span className="font-medium">{fmt(Number(item.total))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {retError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> {retError}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={closeReturnModal} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={submitReturn}
              disabled={!retTxn || retSaving}
              className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {retSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Process Full Return
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
