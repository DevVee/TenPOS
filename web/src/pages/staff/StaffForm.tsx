import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Eye, EyeOff, Save } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import type { UserRole } from '../../types'
import { apiCreateStaff, apiUpdateStaff, apiGetStaffMember, apiGetBranches } from '../../lib/api'

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: 'admin',   label: 'Admin',   desc: 'Full access to all features including settings and staff management' },
  { value: 'manager', label: 'Manager', desc: 'Can approve discounts/voids, view reports, manage inventory' },
  { value: 'cashier', label: 'Cashier', desc: 'Can process sales, apply pre-approved discounts, access POS' },
  { value: 'viewer',  label: 'Viewer',  desc: 'Read-only access to reports and transaction history' },
]

interface Branch { id: string; name: string }

export function StaffForm() {
  const navigate = useNavigate()
  const { id }   = useParams<{ id?: string }>()
  const isEdit   = id !== undefined && id !== 'new'

  const [form, setForm] = useState({
    name: '', email: '', role: 'cashier' as UserRole,
    branch_id: '', password: '', confirmPassword: '', active: true,
  })
  const [showPass,     setShowPass]     = useState(false)
  const [errors,       setErrors]       = useState<Record<string, string>>({})
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [branches,     setBranches]     = useState<Branch[]>([])
  const [loadingData,  setLoadingData]  = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoadingData(true)
      try {
        const branchList = await apiGetBranches() as Branch[]
        setBranches(branchList)

        if (isEdit && id) {
          const member = await apiGetStaffMember(id) as {
            name: string; email: string; role: UserRole; branch_id: string | null; status: string
          }
          setForm((f) => ({
            ...f,
            name:      member.name,
            email:     member.email,
            role:      member.role,
            branch_id: member.branch_id ?? '',
            active:    member.status === 'active',
          }))
        }
      } catch {}
      setLoadingData(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const set = (k: string, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim())  errs.name  = 'Name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email'
    if (!isEdit) {
      if (!form.password) errs.password = 'Password is required'
      else if (form.password.length < 8) errs.password = 'Password must be at least 8 characters'
      else if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    } else {
      if (form.password && form.password.length < 8) errs.password = 'Password must be at least 8 characters'
      if (form.password && form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    setSaveError('')
    try {
      const payload: Record<string, unknown> = {
        name:      form.name.trim(),
        email:     form.email.trim().toLowerCase(),
        role:      form.role,
        branch_id: form.branch_id || undefined,
      }
      if (!isEdit) {
        payload.password = form.password
      } else {
        payload.status = form.active ? 'active' : 'inactive'
        if (form.password) payload.password = form.password
      }

      if (isEdit && id) {
        await apiUpdateStaff(id, payload)
        navigate(`/staff/${id}`)
      } else {
        await apiCreateStaff(payload)
        navigate('/staff')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Staff Member' : 'Add Staff Member'}
        subtitle="Set up account credentials and access permissions"
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(isEdit ? `/staff/${id}` : '/staff')} className="btn-secondary flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        }
      />

      {saveError && (
        <div className="card p-4 mb-4 text-sm text-red-600 bg-red-50 border-red-100">{saveError}</div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">

        {/* ── LEFT: Identity + Password ─────────────────────────────── */}
        <div className="space-y-4">

          {/* Personal Info */}
          <div className="card p-5">
            <p className="section-label mb-4">Personal Information</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Full Name <span className="text-brand">*</span></label>
                <input
                  className={`input-base ${errors.name ? 'border-red-400' : ''}`}
                  placeholder="e.g. Maria Santos"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Email Address <span className="text-brand">*</span></label>
                <input
                  type="email"
                  className={`input-base ${errors.email ? 'border-red-400' : ''}`}
                  placeholder="staff@tenpos.ph"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Branch</label>
                <select className="input-base" value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
                  <option value="">No specific branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="card p-5">
            <p className="section-label mb-1">
              {isEdit ? 'Change Password' : 'Set Password'} {!isEdit && <span className="text-brand">*</span>}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {isEdit ? 'Leave blank to keep the existing password.' : 'Used to log in via email and password.'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Password {!isEdit && <span className="text-brand">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className={`input-base pr-9 ${errors.password ? 'border-red-400' : ''}`}
                    placeholder="Min 8 characters"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirm Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  className={`input-base ${errors.confirmPassword ? 'border-red-400' : ''}`}
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={(e) => set('confirmPassword', e.target.value)}
                />
                {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
              </div>
            </div>
          </div>

        </div>

        {/* ── RIGHT: Role + Status ─────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Role */}
          <div className="card p-5">
            <p className="section-label mb-4">Role & Permissions</p>
            <div className="space-y-2.5">
              {ROLES.map((r) => (
                <label
                  key={r.value}
                  className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-all hover:bg-gray-50 border-transparent has-[:checked]:border-brand has-[:checked]:bg-brand-pale"
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={form.role === r.value}
                    onChange={() => set('role', r.value)}
                    className="mt-0.5 accent-brand"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{r.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Account Status (edit only) */}
          {isEdit && (
            <div className="card p-5">
              <p className="section-label mb-4">Account Status</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.active}
                    onChange={(e) => set('active', e.target.checked)}
                  />
                  <div className={`w-10 h-5 rounded-full transition-colors ${form.active ? 'bg-brand' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Account Active</p>
                  <p className="text-xs text-gray-400">Inactive accounts cannot log in to the system</p>
                </div>
              </label>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
