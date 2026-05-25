import { useState, useCallback, useEffect, useRef } from 'react'
import { Plus, Search, Loader2, AlertCircle } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { apiGetAdjustments, apiCreateAdjustment, apiGetInventory } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useApiData } from '../../hooks/useApiData'
import { useAuthStore } from '../../store/authStore'

interface Adjustment {
  id: string
  product_name: string
  type: 'in' | 'out' | 'correction' | 'damage' | 'return'
  quantity: number
  reason: string
  by: string
  created_at: string
}

interface InvProduct { product_id: string; product_name: string; stock: number }

const BLANK = { product_id: '', type: 'in', qty: '', reason: '', notes: '' }

export function StockAdjustments() {
  const { user } = useAuthStore()
  const [modal, setModal] = useState(false)
  const [search, setSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [tick, setTick] = useState(0)

  const fetchAdj = useCallback(
    () => apiGetAdjustments() as Promise<{ data: Adjustment[] }>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  )
  const { data, loading, error } = useApiData(fetchAdj, [tick])
  const adjustments = data?.data ?? []

  const { data: invData } = useApiData<InvProduct[]>(
    () => apiGetInventory() as Promise<InvProduct[]>
  )
  const products = invData ?? []

  // ── Realtime: refresh list when any adjustment is added anywhere ─────────────
  useEffect(() => {
    const channel = supabase
      .channel('stock-adjustments-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_adjustments' },
        () => setTick((t) => t + 1),
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  // ── Barcode scanner — fills list search field ─────────────────────────────
  const searchRef = useRef(search)
  useEffect(() => { searchRef.current = search }, [search])
  useEffect(() => {
    let buffer = '', lastKeyAt = 0, charIntervals: number[] = []
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now(), gap = now - lastKeyAt
      if (gap > 200) { buffer = ''; charIntervals = [] }
      lastKeyAt = now
      if (e.key === 'Enter') {
        const code = buffer.trim(); buffer = ''
        const isScan = code.length >= 4 && charIntervals.every((t) => t < 50)
        charIntervals = []
        if (isScan) { setSearch(code); e.preventDefault() }
      } else if (e.key.length === 1) { charIntervals.push(gap); buffer += e.key }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = adjustments.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return a.product_name?.toLowerCase().includes(q) || a.reason?.toLowerCase().includes(q) || a.by?.toLowerCase().includes(q)
  })

  const handleSave = async () => {
    if (!form.product_id || !form.qty || !form.reason) return
    setSaving(true)
    setSaveError('')
    try {
      await apiCreateAdjustment({
        product_id: form.product_id,
        type: form.type as 'in' | 'out' | 'correction',
        quantity: parseInt(form.qty),
        reason: form.reason,
        branch_id: user?.branch_id ?? 'br-1',
      })
      setModal(false)
      setForm(BLANK)
      setProductSearch('')
      // tick bumped by realtime; manual bump as fallback
      setTick((t) => t + 1)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save adjustment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        subtitle="Manual inventory corrections with audit trail"
        actions={
          <button onClick={() => setModal(true)} className="btn-primary flex items-center space-x-1.5">
            <Plus className="w-4 h-4" /><span>New Adjustment</span>
          </button>
        }
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-base pl-9 w-full"
            placeholder="Search by product, reason, or staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No adjustments found</td></tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id} className="table-row">
                    <td className="px-4 py-3 text-sm text-gray-700">{a.product_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={a.type === 'in' || a.type === 'return' ? 'green' : a.type === 'out' || a.type === 'damage' ? 'red' : 'yellow'}>
                        {a.type === 'in' ? 'Added' : a.type === 'out' ? 'Removed' : a.type === 'return' ? 'Return' : a.type === 'damage' ? 'Damage' : 'Correction'}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${a.type === 'in' || a.type === 'return' ? 'text-green-600' : a.type === 'correction' ? 'text-blue-600' : 'text-brand'}`}>
                      {a.type === 'in' || a.type === 'return' ? '+' : a.type === 'correction' ? '=' : '-'}{a.quantity}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{a.reason}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{a.by}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(a.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => { setModal(false); setSaveError(''); setProductSearch('') }} title="New Stock Adjustment">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Product</label>
            {/* Search filter for the product dropdown */}
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                className="input-base pl-8 text-xs"
                placeholder="Search product..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            <select
              className="input-base"
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
            >
              <option value="">Select product...</option>
              {products
                .filter(p => !productSearch || p.product_name.toLowerCase().includes(productSearch.toLowerCase()))
                .map((p) => (
                  <option key={p.product_id} value={p.product_id}>{p.product_name}</option>
                ))
              }
            </select>
            {form.product_id && (() => {
              const p = products.find((pr) => pr.product_id === form.product_id)
              return p ? (
                <p className="text-xs text-gray-400 mt-1.5">
                  Current stock: <span className="font-semibold text-gray-700">{p.stock}</span> units
                </p>
              ) : null
            })()}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Adjustment Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[['in','Add Stock'],['out','Remove'],['correction','Correction']].map(([val, label]) => (
                <button key={val} onClick={() => setForm((f) => ({ ...f, type: val }))}
                  className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                    form.type === val
                      ? 'border-brand bg-brand-pale text-brand'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Quantity</label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              className="input-base"
              placeholder={form.type === 'correction' ? 'Actual count (sets stock to this value)' : 'Units to adjust'}
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Reason <span className="text-brand">*</span></label>
            <select className="input-base" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}>
              <option value="">Select reason...</option>
              <option>New stock received</option>
              <option>Damaged goods</option>
              <option>Stolen / shrinkage</option>
              <option>Physical count reconciliation</option>
              <option>Transfer to another branch</option>
              <option>Return to supplier</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Additional Notes</label>
            <input className="input-base" placeholder="Optional details..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          {saveError && (
            <div className="flex items-center space-x-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{saveError}</span>
            </div>
          )}
          <div className="flex space-x-2 pt-2">
            <button
              onClick={() => { setModal(false); setSaveError(''); setProductSearch('') }}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.product_id || !form.qty || !form.reason || saving}
              className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Adjustment</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
