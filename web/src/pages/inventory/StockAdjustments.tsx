import { useState, useCallback, useEffect } from 'react'
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

interface InvProduct { product_id: string; product_name: string }

const BLANK = { product_id: '', type: 'in', qty: '', reason: '', notes: '' }

export function StockAdjustments() {
  const { user } = useAuthStore()
  const [modal, setModal] = useState(false)
  const [search, setSearch] = useState('')
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
          <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New Adjustment
          </button>
        }
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-base pl-9"
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
          <table className="w-full min-w-[360px]">
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

      <Modal open={modal} onClose={() => { setModal(false); setSaveError('') }} title="New Stock Adjustment">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Product</label>
            <select
              className="input-base"
              value={form.product_id}
              onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
            >
              <option value="">Select product...</option>
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>{p.product_name}</option>
              ))}
            </select>
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
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> {saveError}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.product_id || !form.qty || !form.reason || saving}
              className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Adjustment
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
