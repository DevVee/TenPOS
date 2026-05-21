import { useState, useEffect } from 'react'
import { Search, Plus, UserCheck, UserX, Loader2 } from 'lucide-react'
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

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-base pl-9"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {['all', 'admin', 'manager', 'cashier', 'viewer'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                roleFilter === r ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >{r}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Staff Member</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">Last Login</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No staff members found</td></tr>
              ) : (
                filtered.map((s) => {
                  const rb       = ROLE_BADGE[s.role] ?? { variant: 'gray' as const, label: s.role }
                  const initials = s.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                  const isActive = s.status === 'active'
                  return (
                    <tr key={s.id} className="table-row cursor-pointer" onClick={() => navigate(`/staff/${s.id}`)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-pale flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-brand">{initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{s.name}</p>
                            <p className="text-xs text-gray-400">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge variant={rb.variant}>{rb.label}</Badge></td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{s.branch ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                        {s.lastLogin
                          ? new Date(s.lastLogin).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {isActive
                            ? <UserCheck className="w-3.5 h-3.5 text-green-500" />
                            : <UserX    className="w-3.5 h-3.5 text-gray-400" />}
                          <span className={`text-xs font-medium ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                            {s.status}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
