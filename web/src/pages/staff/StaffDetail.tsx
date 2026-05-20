import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, UserX, UserCheck, Check, X, Loader2, Pencil } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { apiGetStaffMember, apiUpdateStaff, apiDeleteStaff } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface StaffMember {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'cashier' | 'viewer'
  branch: string
  branch_id: string | null
  status: 'active' | 'inactive' | 'suspended'
  lastLogin: string | null
  salesCount: number
  created_at: string
  recent_transactions: { receipt_no: string; total: number; status: string; created_at: string }[]
}

const ROLE_BADGE: Record<string, { variant: 'red' | 'blue' | 'green' | 'gray'; label: string }> = {
  admin:   { variant: 'red',   label: 'Admin' },
  manager: { variant: 'blue',  label: 'Manager' },
  cashier: { variant: 'green', label: 'Cashier' },
  viewer:  { variant: 'gray',  label: 'Viewer' },
}

const ROLE_PERMISSIONS: Record<string, [string, boolean][]> = {
  admin: [
    ['Process sales', true], ['View reports', true], ['Manage staff', true],
    ['Manage inventory', true], ['Void transactions', true], ['Access settings', true],
  ],
  manager: [
    ['Process sales', true], ['View reports', true], ['Manage staff', false],
    ['Manage inventory', true], ['Void transactions', true], ['Access settings', false],
  ],
  cashier: [
    ['Process sales', true], ['View own sales', true], ['Issue receipts', true],
    ['Apply pre-set discounts', true], ['Access analytics', false], ['Void transactions', false],
  ],
  viewer: [
    ['Process sales', false], ['View reports', true], ['Manage staff', false],
    ['Manage inventory', false], ['Void transactions', false], ['Access settings', false],
  ],
}

export function StaffDetail() {
  const navigate  = useNavigate()
  const { id }    = useParams<{ id: string }>()
  const [deactivateModal, setDeactivateModal] = useState(false)
  const [actionLoading, setActionLoading]     = useState(false)

  const { data: staff, loading, error, refetch } = useApiData<StaffMember>(
    () => apiGetStaffMember(id!) as Promise<StaffMember>,
    [id]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  if (error || !staff) {
    return (
      <div>
        <button onClick={() => navigate('/staff')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Staff
        </button>
        <div className="card p-6 text-center text-red-500">{error || 'Staff member not found'}</div>
      </div>
    )
  }

  const rb       = ROLE_BADGE[staff.role] ?? { variant: 'gray' as const, label: staff.role }
  const initials = staff.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  const isActive = staff.status === 'active'
  const perms    = ROLE_PERMISSIONS[staff.role] ?? []

  const recentCompleted = staff.recent_transactions.filter((t) => t.status === 'completed')
  const totalRevenue    = recentCompleted.reduce((s, t) => s + Number(t.total), 0)
  const avgValue        = recentCompleted.length > 0 ? totalRevenue / recentCompleted.length : 0

  const handleToggleStatus = async () => {
    setActionLoading(true)
    try {
      await apiUpdateStaff(staff.id, { status: isActive ? 'inactive' : 'active' })
      refetch()
      setDeactivateModal(false)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    setActionLoading(true)
    try {
      await apiDeleteStaff(staff.id)
      navigate('/staff')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/staff')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-pale flex items-center justify-center">
              <span className="font-semibold text-brand">{initials}</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{staff.name}</h1>
              <p className="text-sm text-gray-400">{staff.email}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/staff/edit/${staff.id}`)}
            className="btn-secondary flex items-center gap-1.5 text-xs"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => setDeactivateModal(true)}
            className="btn-secondary flex items-center gap-1.5 text-xs text-red-500 border-red-200 hover:bg-red-50"
          >
            {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            {isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Account Details</p>
          <div className="space-y-2.5">
            {[
              ['Role',       <Badge key="r" variant={rb.variant}>{rb.label}</Badge>],
              ['Branch',     staff.branch ?? '—'],
              ['Status',     <div key="s" className="flex items-center gap-1.5">
                               {isActive
                                 ? <UserCheck className="w-3.5 h-3.5 text-green-500" />
                                 : <UserX className="w-3.5 h-3.5 text-gray-400" />}
                               <span className={`font-medium text-sm ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                                 {staff.status}
                               </span>
                             </div>],
              ['Created',    new Date(staff.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })],
              ['Last Login', staff.lastLogin
                ? new Date(staff.lastLogin).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Never'],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between items-center gap-3">
                <span className="text-sm text-gray-500">{l}</span>
                <span className="text-sm font-medium text-gray-700">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Performance (Recent)</p>
          <div className="space-y-2.5">
            {[
              ['Total Sales',     String(staff.salesCount ?? 0) + ' transactions'],
              ['Revenue (10)',    fmt(totalRevenue)],
              ['Avg Order',       fmt(avgValue)],
              ['Completed (10)', String(recentCompleted.length)],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between gap-3">
                <span className="text-sm text-gray-500">{l}</span>
                <span className="text-sm font-medium text-gray-700">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
          Permissions ({rb.label} Role)
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {perms.map(([label, allowed]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${allowed ? 'bg-green-100' : 'bg-gray-100'}`}>
                {allowed
                  ? <Check className="w-2.5 h-2.5 text-green-600" />
                  : <X     className="w-2.5 h-2.5 text-gray-400" />}
              </span>
              <span className={allowed ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      {staff.recent_transactions.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-sm font-medium text-gray-800">Recent Transactions</p>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Receipt #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Total</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {staff.recent_transactions.map((t) => (
                <tr key={t.receipt_no} className="table-row">
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">{t.receipt_no}</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.status === 'completed' ? 'green' : t.status === 'voided' ? 'red' : 'yellow'}>
                      {t.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(Number(t.total))}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">
                    {new Date(t.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deactivate / Activate Modal */}
      <Modal open={deactivateModal} onClose={() => setDeactivateModal(false)} title={isActive ? 'Deactivate Account' : 'Activate Account'}>
        <p className="text-sm text-gray-600 mb-5">
          {isActive
            ? `Deactivating ${staff.name}'s account will prevent them from logging in. This can be reversed.`
            : `Reactivating ${staff.name}'s account will restore their access.`}
        </p>
        <div className="flex gap-2">
          <button onClick={() => setDeactivateModal(false)} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleToggleStatus}
            disabled={actionLoading}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              isActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
        {isActive && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">Or permanently delete this account:</p>
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="text-xs text-red-400 hover:text-red-600 underline"
            >
              Delete account permanently
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
