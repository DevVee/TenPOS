import { useState, useCallback, useEffect, useRef } from 'react'
import { Plus, MapPin, Monitor, Edit, Loader2, AlertCircle, CheckCircle2, Search, Users } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { AddressAutocomplete } from '../../components/ui/AddressAutocomplete'
import { apiGetBranches, apiCreateBranch, apiUpdateBranch, apiGetStaff } from '../../lib/api'
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

interface StaffOption { id: string; name: string; role: string }

const BLANK = { name: '', address: '', manager_name: '', terminal_count: '1' }

// ── Manager search combobox ───────────────────────────────────────────────────
function ManagerPicker({
  value, onChange, staffList,
}: { value: string; onChange: (v: string) => void; staffList: StaffOption[] }) {
  const [query, setQuery]   = useState(value)
  const [open,  setOpen]    = useState(false)
  const ref                 = useRef<HTMLDivElement>(null)

  // Keep query in sync when parent resets form
  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = query.trim().length > 0
    ? staffList.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : staffList

  const handleSelect = (s: StaffOption) => {
    setQuery(s.name)
    onChange(s.name)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          className="input-base pl-9"
          placeholder="Search managers or type a name…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-panel overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <li
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
              className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-brand">{s.name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{s.name}</p>
                <p className="text-xs text-gray-400 capitalize">{s.role}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Branches() {
  const [modal,      setModal]      = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState(BLANK)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState('')
  const [tick,       setTick]       = useState(0)
  const [staffList,  setStaffList]  = useState<StaffOption[]>([])

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

  // Pre-load manager/admin staff for the picker
  useEffect(() => {
    apiGetStaff({ limit: '999' }).then((res) => {
      const list = (res as { data?: StaffOption[] }).data ?? (res as StaffOption[])
      const managers = (Array.isArray(list) ? list : []).filter(
        (s: StaffOption) => s.role === 'manager' || s.role === 'admin'
      )
      setStaffList(managers)
    }).catch(() => {})
  }, [])

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
        // If this is the active branch, update the stored name/address
        if (editingId === activeBranchId) {
          setActiveBranch(editingId, form.name.trim(), form.address.trim() || null)
        }
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
                          : setActiveBranch(b.id, b.name, b.address || null)
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
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => set('address', v)}
              placeholder="Search Philippines address…"
            />
            <p className="text-xs text-gray-400 mt-1">Start typing to search, or enter manually.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Branch Manager
              {staffList.length > 0 && (
                <span className="ml-1.5 text-gray-400 font-normal">
                  <Search className="w-3 h-3 inline mr-0.5" /> search from {staffList.length} managers
                </span>
              )}
            </label>
            <ManagerPicker
              value={form.manager_name}
              onChange={(v) => set('manager_name', v)}
              staffList={staffList}
            />
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
