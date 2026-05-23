import { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera, Check, AlertCircle, Lock, Mail,
  User, Save, Trash2, Info,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { apiUpdateProfile, apiChangePassword, apiUploadAvatar, apiRemoveAvatar } from '../../lib/api'
import { PageHeader } from '../../components/ui/PageHeader'
import { getAvatarInitials } from '@tenpos/shared'

// ── Small helpers ─────────────────────────────────────────────────────────────
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
      ok
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-brand-pale text-brand border-red-200'
    }`}>
      {ok
        ? <Check className="w-4 h-4 flex-shrink-0" />
        : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
      <span>{msg}</span>
    </div>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
      <div className="w-7 h-7 rounded-lg bg-brand-pale flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-brand" />
      </div>
      <p className="text-sm font-bold text-gray-800">{title}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function ProfileSettings() {
  const { user } = useAuthStore()
  const navigate  = useNavigate()

  if (!user) return null
  if (user.role === 'cashier') { navigate('/pos',       { replace: true }); return null }
  if (user.role === 'viewer')  { navigate('/dashboard', { replace: true }); return null }

  return <ProfileForm />
}

function ProfileForm() {
  const { user, updateUser } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Avatar state
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarMsg,     setAvatarMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  // ── Personal info state
  const [name,        setName]        = useState(user?.name  ?? '')
  const [email,       setEmail]       = useState(user?.email ?? '')
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoMsg,     setInfoMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  // ── Password state
  const [newPass,     setNewPass]     = useState('')
  const [confPass,    setConfPass]    = useState('')
  const [passLoading, setPassLoading] = useState(false)
  const [passMsg,     setPassMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  const flash = (
    setter: (v: { text: string; ok: boolean } | null) => void,
    msg: { text: string; ok: boolean },
  ) => {
    setter(msg)
    if (msg.ok) setTimeout(() => setter(null), 4000)
  }

  // ── Upload avatar to Supabase Storage ──────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!file.type.startsWith('image/')) {
      flash(setAvatarMsg, { text: 'Please select an image file (JPG, PNG, GIF).', ok: false })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      flash(setAvatarMsg, { text: 'Image must be under 2 MB.', ok: false })
      return
    }

    setAvatarLoading(true)
    setAvatarMsg(null)
    try {
      const url = await apiUploadAvatar(file)
      updateUser({ avatarUrl: url })
      flash(setAvatarMsg, { text: 'Profile photo saved to your account!', ok: true })
    } catch (err) {
      flash(setAvatarMsg, {
        text: err instanceof Error ? err.message : 'Upload failed.',
        ok: false,
      })
    } finally {
      setAvatarLoading(false)
    }
  }, [updateUser])

  const handleRemoveAvatar = async () => {
    setAvatarLoading(true)
    setAvatarMsg(null)
    try {
      await apiRemoveAvatar()
      updateUser({ avatarUrl: undefined })
      flash(setAvatarMsg, { text: 'Profile photo removed.', ok: true })
    } catch {
      flash(setAvatarMsg, { text: 'Could not remove photo. Try again.', ok: false })
    } finally {
      setAvatarLoading(false)
    }
  }

  // ── Save personal info ─────────────────────────────────────────────────────
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    setInfoMsg(null)
    if (!name.trim())  { flash(setInfoMsg, { text: 'Name cannot be empty.',  ok: false }); return }
    if (!email.trim()) { flash(setInfoMsg, { text: 'Email cannot be empty.', ok: false }); return }

    setInfoLoading(true)
    try {
      const patch: { name?: string; email?: string } = {}
      if (name.trim()  !== user?.name)  patch.name  = name.trim()
      if (email.trim() !== user?.email) patch.email = email.trim()

      if (!Object.keys(patch).length) {
        flash(setInfoMsg, { text: 'No changes to save.', ok: true })
        return
      }
      const result = await apiUpdateProfile(patch)
      if (patch.name) {
        const newInitials = getAvatarInitials(patch.name)
        updateUser({ name: patch.name, avatarInitials: newInitials })
      }
      if (result === 'email_pending') {
        flash(setInfoMsg, {
          text: 'A confirmation link has been sent to your new email address. Your email will update after you click the link.',
          ok: true,
        })
      } else {
        flash(setInfoMsg, { text: 'Profile updated successfully!', ok: true })
      }
    } catch (err) {
      flash(setInfoMsg, {
        text: err instanceof Error ? err.message : 'Failed to update profile.',
        ok: false,
      })
    } finally {
      setInfoLoading(false)
    }
  }

  // ── Change password ────────────────────────────────────────────────────────
  const handleChangePass = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassMsg(null)
    if (newPass.length < 8)  { flash(setPassMsg, { text: 'Password must be at least 8 characters.', ok: false }); return }
    if (newPass !== confPass) { flash(setPassMsg, { text: 'Passwords do not match.',                 ok: false }); return }

    setPassLoading(true)
    try {
      await apiChangePassword(newPass)
      setNewPass(''); setConfPass('')
      flash(setPassMsg, { text: 'Password changed successfully!', ok: true })
    } catch (err) {
      flash(setPassMsg, {
        text: err instanceof Error ? err.message : 'Failed to change password.',
        ok: false,
      })
    } finally {
      setPassLoading(false)
    }
  }

  const avatarUrl = user?.avatarUrl
  const initials  = user?.avatarInitials ?? '?'

  // Password strength (1-4): length ≥8 + has letter + has number + length ≥12
  const strengthScore = [
    newPass.length >= 8,
    /[a-zA-Z]/.test(newPass),
    /[0-9]/.test(newPass),
    newPass.length >= 12,
  ].filter(Boolean).length
  const strength = newPass.length > 0 ? Math.max(1, strengthScore) : 0
  const strengthColors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-500']
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  return (
    <div>
      <PageHeader
        title="Profile Settings"
        subtitle="Manage your personal information and account security"
      />

      {/* Full-width layout matching other pages */}
      <div className="space-y-4">

        {/* ── TOP CARD: Photo + name preview ─────────────────────────── */}
        <div className="card p-6">
          <SectionHeader icon={User} title="Profile Photo" />
          <div className="flex items-center gap-6">

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-brand/15 shadow-sm bg-gradient-to-br from-brand-pale to-red-100">
                {avatarUrl
                  ? <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl font-black text-brand">{initials}</span>
                    </div>
                }
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={avatarLoading}
                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-brand text-white shadow-md shadow-brand/30 flex items-center justify-center hover:bg-brand-dark transition-colors disabled:opacity-60"
                title="Change photo"
              >
                {avatarLoading
                  ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Camera className="w-3.5 h-3.5" />}
              </button>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            {/* Info + actions */}
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 leading-tight">{user?.name}</p>
              <p className="text-sm text-gray-400 capitalize font-medium mt-0.5">{user?.role} · {user?.branch}</p>

              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarLoading}
                  className="btn-secondary text-xs py-1.5 px-3 min-h-0 gap-1.5"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={avatarLoading}
                    className="btn-ghost text-xs py-1.5 px-3 min-h-0 gap-1.5 text-red-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>

              <div className="flex items-start gap-1.5 mt-2.5">
                <Info className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-300 font-medium leading-snug">
                  Photo is saved to your account and visible across all devices.
                  JPG, PNG, GIF · Max 2 MB.
                </p>
              </div>
            </div>
          </div>

          {avatarMsg && <div className="mt-4 max-w-lg"><Toast msg={avatarMsg.text} ok={avatarMsg.ok} /></div>}
        </div>

        {/* ── TWO-COLUMN GRID ─────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4">

          {/* LEFT — Personal information */}
          <div className="card p-6">
            <SectionHeader icon={Mail} title="Personal Information" />
            <form onSubmit={handleSaveInfo} className="space-y-4">

              <div>
                <label className="block mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    <User className="w-3.5 h-3.5" /> Full Name
                  </span>
                </label>
                <input
                  type="text"
                  className="input-base"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="block mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                    <Mail className="w-3.5 h-3.5" /> Email Address
                  </span>
                </label>
                <input
                  type="email"
                  className="input-base"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@tenpos.ph"
                  autoComplete="email"
                />
                <p className="text-[11px] text-gray-400 mt-1.5 font-medium">
                  Changing email triggers a re-verification from Supabase.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Role</label>
                <div className="input-base bg-gray-50 text-gray-400 capitalize cursor-not-allowed select-none">
                  {user?.role}
                </div>
              </div>

              {infoMsg && <Toast msg={infoMsg.text} ok={infoMsg.ok} />}

              <button type="submit" disabled={infoLoading} className="btn-primary gap-2 mt-1">
                {infoLoading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                  : <><Save className="w-4 h-4" /> Save Changes</>}
              </button>
            </form>
          </div>

          {/* RIGHT — Password + Account details */}
          <div className="space-y-4">

            {/* Change Password */}
            <div className="card p-6">
              <SectionHeader icon={Lock} title="Change Password" />
              <form onSubmit={handleChangePass} className="space-y-4">

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">New Password</label>
                  <input
                    type="password"
                    className="input-base"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                  {/* Strength bar */}
                  {newPass.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((lvl) => (
                          <div
                            key={lvl}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-200 ${
                              lvl <= strength ? strengthColors[strength - 1] : 'bg-gray-100'
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-[11px] font-medium ${strength >= 3 ? 'text-emerald-600' : strength === 2 ? 'text-yellow-600' : 'text-red-500'}`}>
                        {strengthLabels[strength]} — must have 8+ chars, one letter & one number
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    className="input-base"
                    value={confPass}
                    onChange={(e) => setConfPass(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                  />
                  {confPass && newPass !== confPass && (
                    <p className="text-xs text-red-500 mt-1.5 font-medium">Passwords do not match</p>
                  )}
                </div>

                {passMsg && <Toast msg={passMsg.text} ok={passMsg.ok} />}

                <button
                  type="submit"
                  disabled={passLoading || !newPass || !confPass}
                  className="btn-primary gap-2"
                >
                  {passLoading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Changing…</>
                    : <><Lock className="w-4 h-4" /> Change Password</>}
                </button>
              </form>
            </div>

            {/* Account Details (read-only) */}
            <div className="card p-6">
              <SectionHeader icon={Info} title="Account Details" />
              <div className="space-y-0">
                {[
                  { label: 'User ID',  value: user?.id ?? '—',     mono: true  },
                  { label: 'Branch',   value: user?.branch ?? '—', mono: false },
                  { label: 'Role',     value: user?.role ?? '—',   mono: false },
                ].map((row, i, arr) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between py-3 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    <p className="text-xs font-semibold text-gray-500">{row.label}</p>
                    <p className={`text-xs text-gray-700 capitalize ${row.mono ? 'font-mono text-[11px]' : 'font-semibold'}`}>
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
