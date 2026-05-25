import { useState, useEffect } from 'react'
import { Search, Plus, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import type { UserRole } from '../../types'
import { apiGetStaff } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useApiData } from '../../hooks/useApiData'

interface StaffMember {
  id: string
  name: string
  email: string
  role: UserRole
  branch: string
  status: 'active' | 'inactive' | 'suspended'
  lastLogin: string | null
}

const ROLE_BADGE: Record<UserRole, { variant: 'red' | 'green' | 'blue' | 'yellow' | 'gray'; label: string }> = {
  admin:   { variant: 'red',   label: 'Admin' },
  manager: { variant: 'blue',  label: 'Manager' },
  cashier: { variant: 'green', label: 'Cashier' },
  viewer:  { variant: 'gray',  label: 'Viewer' },
}

export function StaffList() {
  const navigate = useNavigate()
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [tick,       setTick]       = useState(0)

  const { data, loading, error } = useApiData<{ data: StaffMember[]; total: number }>(
    () => apiGetStaff({ limit: '100' }) as Promise<{ data: StaffMember[]; total: number }>,
    [tick],
  )

  // ── Realtime: refresh when staff rows change ─────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('staff-list-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff' },
        () => setTick((t) => t + 1),
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  const staff       = data?.data ?? []
  const activeCount = staff.filter((s) => s.status === 'active').length

  const filtered = staff.filter((s) => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())
    const matchRole   = roleFilter === 'all' || s.role === roleFilter
    return matchSearch && matchRole
  })

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle={loading ? 'Loading...' : `${activeCount} active staff members`}
        actions={
          <button onClick={() => navigate('/staff/new')} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Staff
          </button>
        }
      />

      {error && (
        <div className="card p-4 mb-4 text-sm text-red-600 bg-red-50 border-red-100">{error}</div>
      )}

      {/* Search — full width at top */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          className="input-base pl-9 w-full"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Role filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
        {(['all', 'admin', 'manager', 'cashier', 'viewer'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`flex-shrink-0 h-9 px-4 text-xs font-semibold capitalize transition-colors border ${
              roleFilter === r
                ? 'bg-brand text-white border-brand'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >{r === 'all' ? `All (${staff.length})` : r}</button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">No staff members found</div>
        ) : (
          /* Card list — better than a table on narrow tablets */
          <div className="divide-y divide-gray-100">
            {filtered.map((s) => {
              const rb       = ROLE_BADGE[s.role] ?? { variant: 'gray' as const, label: s.role }
              const initials = s.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
              const isActive = s.status === 'active'
              return (
                <div
                  key={s.id}
                  className="flex items-center space-x-4 px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/staff/${s.id}`)}
                >
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-brand-pale flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-brand">{initials}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                      <Badge variant={rb.variant}>{rb.label}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{s.email}</p>
                    {s.branch && (
                      <p className="text-xs text-gray-400 mt-0.5">{s.branch}</p>
                    )}
                  </div>

                  {/* Status — right side */}
                  <span className={`text-xs font-semibold px-2.5 py-1 capitalize flex-shrink-0 ${
                    isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
                  }`}>{s.status}</span>

                  {/* Chevron */}
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
