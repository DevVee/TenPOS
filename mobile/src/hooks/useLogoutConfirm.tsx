import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

/**
 * Shared logout confirmation hook.
 * Returns `trigger` (call to open the dialog) and `modal` (render in JSX).
 *
 * Usage:
 *   const { trigger: triggerLogout, modal: logoutModal } = useLogoutConfirm()
 *   <button onClick={triggerLogout}>Sign out</button>
 *   {logoutModal}
 */
export function useLogoutConfirm() {
  const { logout } = useAuthStore()
  const navigate   = useNavigate()
  const [open, setOpen] = useState(false)

  const trigger = () => setOpen(true)

  const handleConfirm = () => {
    setOpen(false)
    logout()
    navigate('/login')
  }

  const modal = open ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.55)' }}
    >
      <div
        className="bg-white rounded-2xl w-full shadow-2xl overflow-hidden animate-slide-up"
        style={{ maxWidth: 320 }}
      >
        {/* Icon + copy */}
        <div className="flex flex-col items-center pt-8 pb-5 px-6 text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
            style={{ background: '#FEF2F2' }}
          >
            <LogOut className="w-6 h-6" style={{ color: '#E5484D' }} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Sign out?</h3>
          <p className="text-sm text-gray-500 leading-snug">
            You'll need to sign back in to continue using TenPOS.
          </p>
        </div>

        {/* Action row */}
        <div className="flex border-t border-gray-100">
          <button
            onClick={() => setOpen(false)}
            className="flex-1 py-4 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors border-r border-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-4 text-sm font-bold transition-colors hover:bg-red-50"
            style={{ color: '#E5484D' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { trigger, modal }
}
