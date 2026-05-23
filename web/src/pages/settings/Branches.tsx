import { useState, useCallback } from 'react'
import { Plus, MapPin, Monitor, Edit, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { apiGetBranches, apiCreateBranch, apiUpdateBranch } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { useBranchStore } from '../../store/branchStore'
import { useAuthStore } from '../../store/authStore'

interface Branch {
  id: string
  name: string
  address: string
  managerName: string
  terminalCount: number
  active: boolean
}

const BLANK = { name: '', address: '', manager_name: '', terminal_count: '1' }

export function Branches() {
  const [modal, setModal]       = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]         = useState(BLANK)
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState('')
  const [tick, setTick]         = useState(0)

  const { user } = useAuthStore()
  const { activeBranchId, setActiveBranch } = useBranchStore()
  const isAdmin = user?.role === 'admin'

  const fetchBranches = useCallback(
    () => apiGetBranches() as Promise<Branch[]>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  )
  const { data, loading, error } = useApiData(fetchBranches, [tick])
  const branches = data ?? []

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const openAdd = () => {
    setEditingId(null)
    setForm(BLANK)
    setSaveError('')
    setModal(true)
  }

  const openEdit = (b: Branch) => {
    setEditingId(b.id)
    setForm({
      name:           b.name,
      address:        b.address ?? '',
      manager_name:   b.managerName ?? '',
      terminal_count: String(b.terminalCount ?? 1),
    })
    setSaveError('')
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError('')
    const payload = {
      name:           form.name.trim(),
      address:        form.address.trim() || undefined,
      manager_name:   form.manager_name.trim() || undefined,
      terminal_count: parseInt(form.terminal_count) || 1,
    }
    try {
      if (editingId) {
        await apiUpdateBranch(editingId, payload)
      } else {
        await apiCreateBranch(payload)
      }
      setModal(false)
      setTick((t) => t + 1)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save branch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Branch Management"
        subtitle={loading ? 'Loading...' : `${branches.filter((b) => b.active).length} active branches`}
        actions={
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Branch
          </button>
        }
      />

      {error && (
        <div className="card p-4 mb-4 text-sm text-red-600 bg-red-50 border-red-100">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => {
            const isActiveBranch = activeBranchId === b.id
            return (
              <div
                key={b.id}
                className={`card p-4 transition-shadow ${isActiveBranch ? 'ring-2 ring-brand' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">{b.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant={b.active ? 'green' : 'gray'}>{b.active ? 'Active' : 'Inactive'}</Badge>
                      {isActiveBranch && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand bg-brand-pale px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Viewing
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => openEdit(b)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-brand/30 text-gray-500 hover:text-brand transition-colors text-xs font-semibold"
                  >
                    <Edit className="w-3.5 h-3.5" /> Edit
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-600">{b.address || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Monitor className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600">
                      {b.terminalCount ?? 0} POS Terminal{(b.terminalCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-400">Branch Manager</p>
                    <p className="text-sm font-medium text-gray-700 mt-0.5">{b.managerName || '—'}</p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() =>
                        isActiveBranch
                          ? setActiveBranch(null, null)
                          : setActiveBranch(b.id, b.name)
                      }
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        isActiveBranch
                          ? 'border-brand/30 text-brand bg-brand-pale hover:bg-brand/10'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-brand/30 hover:text-brand'
                      }`}
                    >
                      {isActiveBranch ? 'Unset' : 'Set Active'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {branches.length === 0 && (
            <div className="col-span-3 py-12 text-center text-sm text-gray-400">
              No branches yet.
            </div>
          )}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editingId ? 'Edit Branch' : 'Add Branch'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Branch Name <span className="text-brand">*</span></label>
            <input className="input-base" placeholder="e.g. Makati Branch" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Address</label>
            <input className="input-base" placeholder="Full address" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Branch Manager</label>
            <input className="input-base" placeholder="Manager name" value={form.manager_name} onChange={(e) => set('manager_name', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">POS Terminals</label>
            <input type="number" min="0" className="input-base" value={form.terminal_count} onChange={(e) => set('terminal_count', e.target.value)} />
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
              disabled={!form.name.trim() || saving}
              className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingId ? 'Save Changes' : 'Create Branch'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
