import { useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Tag, Calendar, Users, Loader2, AlertCircle } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { apiGetVouchers, apiCreateVoucher, apiUpdateVoucherById, apiDeleteVoucher } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

interface Voucher {
  id: string
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  min_purchase: number
  max_uses: number | null
  used_count: number
  active: boolean
  expires_at: string | null
}

const BLANK = {
  code: '', discountType: 'percent' as 'percent' | 'fixed', value: '', minOrder: '0',
  maxUses: '100', expiry: '', active: true,
}

export function Vouchers() {
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [tick, setTick] = useState(0)

  const fetchVouchers = useCallback(
    () => apiGetVouchers() as Promise<{ data: Voucher[] }>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  )
  const { data, loading } = useApiData(fetchVouchers, [tick])
  const vouchers = data?.data ?? []

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const openAdd = () => {
    setEditingId(null)
    setForm(BLANK)
    setSaveError('')
    setShowModal(true)
  }

  const openEdit = (v: Voucher) => {
    setEditingId(v.id)
    setForm({
      code:         v.code,
      discountType: v.discount_type,
      value:        String(v.discount_value),
      minOrder:     String(v.min_purchase),
      maxUses:      String(v.max_uses ?? 100),
      expiry:       v.expires_at ? v.expires_at.slice(0, 10) : '',
      active:       v.active,
    })
    setSaveError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.code.trim() || !form.value || !form.expiry) return
    setSaving(true)
    setSaveError('')
    const payload = {
      code:           form.code.trim().toUpperCase(),
      discount_type:  form.discountType,
      discount_value: parseFloat(form.value) || 0,
      min_purchase:   parseFloat(form.minOrder) || 0,
      max_uses:       parseInt(form.maxUses) || 100,
      expires_at:     form.expiry || undefined,
      active:         form.active,
    }
    try {
      if (editingId) {
        await apiUpdateVoucherById(editingId, payload)
      } else {
        await apiCreateVoucher(payload)
      }
      setShowModal(false)
      setTick((t) => t + 1)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save voucher')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (v: Voucher) => {
    try {
      await apiUpdateVoucherById(v.id, { active: !v.active })
      setTick((t) => t + 1)
    } catch {}
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await apiDeleteVoucher(deleteId)
      setDeleteId(null)
      setTick((t) => t + 1)
    } catch {}
  }

  const isExpired = (expiry: string) => new Date(expiry) < new Date()

  return (
    <div>
      <PageHeader
        title="Vouchers & Promo Codes"
        subtitle="Manage discount codes that cashiers can apply at checkout"
        actions={
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Voucher
          </button>
        }
      />

      <div className="card p-4 mb-4 bg-blue-50 border-blue-100">
        <p className="text-xs text-blue-600 leading-relaxed">
          <strong>How it works:</strong> Cashiers enter the voucher code at the payment screen. The system validates the code and applies the discount automatically. Managers and admins can create and manage codes here.
        </p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {vouchers.length === 0 ? (
              <div className="py-12 text-center">
                <Tag className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No vouchers yet. Create one to start offering discounts.</p>
              </div>
            ) : (
              vouchers.map((v) => {
                const expired = isExpired(v.expires_at ?? '')
                const exhausted = v.max_uses !== null && v.used_count >= v.max_uses
                const status = !v.active ? 'inactive' : expired ? 'expired' : exhausted ? 'exhausted' : 'active'
                return (
                  <div key={v.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-brand-pale flex items-center justify-center flex-shrink-0">
                          <Tag className="w-5 h-5 text-brand" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-gray-900">{v.code}</span>
                            <Badge variant={
                              status === 'active' ? 'green' :
                              status === 'expired' ? 'yellow' :
                              status === 'exhausted' ? 'yellow' : 'gray'
                            }>
                              {status === 'active' ? 'Active' : status === 'expired' ? 'Expired' : status === 'exhausted' ? 'Used Up' : 'Inactive'}
                            </Badge>
                            <span className="text-xs font-semibold text-brand">
                              {v.discount_type === 'percent' ? `${v.discount_value}% off` : `₱${v.discount_value} off`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Users className="w-3 h-3" />
                              <span>{v.used_count} / {v.max_uses ?? '∞'} uses</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Calendar className="w-3 h-3" />
                              <span className={expired ? 'text-red-400' : ''}>{v.expires_at ? v.expires_at.slice(0, 10) : '—'}</span>
                            </div>
                            {v.min_purchase > 0 && (
                              <span className="text-xs text-gray-400">Min ₱{v.min_purchase}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => handleToggle(v)} className="relative flex-shrink-0" title={v.active ? 'Deactivate' : 'Activate'}>
                          <div className={`w-9 h-5 rounded-full transition-colors ${v.active ? 'bg-brand' : 'bg-gray-200'}`}>
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${v.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </div>
                        </button>
                        <button onClick={() => openEdit(v)} className="p-1.5 text-gray-300 hover:text-brand transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteId(v.id)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Voucher' : 'New Voucher'}>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Voucher Code <span className="text-brand">*</span></label>
              <input
                className="input-base font-mono uppercase"
                placeholder="e.g. WELCOME10"
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                disabled={!!editingId}
              />
              <p className="text-xs text-gray-400 mt-1">Code is case-insensitive at checkout</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Discount Type</label>
              <select className="input-base" value={form.discountType} onChange={(e) => set('discountType', e.target.value)}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₱)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {form.discountType === 'percent' ? 'Discount (%)' : 'Discount (₱)'} <span className="text-brand">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{form.discountType === 'percent' ? '%' : '₱'}</span>
                <input type="number" min="0" className="input-base pl-7" placeholder="0" value={form.value} onChange={(e) => set('value', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Minimum Order (₱)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                <input type="number" min="0" className="input-base pl-7" placeholder="0" value={form.minOrder} onChange={(e) => set('minOrder', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Max Uses</label>
              <input type="number" min="1" className="input-base" placeholder="100" value={form.maxUses} onChange={(e) => set('maxUses', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Expiry Date <span className="text-brand">*</span></label>
              <input type="date" className="input-base" value={form.expiry} onChange={(e) => set('expiry', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input type="checkbox" className="sr-only" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.active ? 'bg-brand' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <span className="text-sm text-gray-700">Active (usable at checkout)</span>
              </label>
            </div>
          </div>
          {saveError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" /> {saveError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.code.trim() || !form.value || !form.expiry || saving}
              className="btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingId ? 'Save Changes' : 'Create Voucher'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Voucher">
        <p className="text-sm text-gray-600 mb-5">
          Delete <strong className="font-mono">{vouchers.find((v) => v.id === deleteId)?.code}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Delete</button>
        </div>
      </Modal>
    </div>
  )
}
