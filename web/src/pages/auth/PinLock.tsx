import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Delete, LogOut } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { apiVerifyPin } from '../../lib/api'

const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']
const PIN_LENGTH = 6

export function PinLock() {
  const { user, unlockPin, logout } = useAuthStore()
  const navigate = useNavigate()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const verify = async (enteredPin: string) => {
    setVerifying(true)
    try {
      await apiVerifyPin(enteredPin)
      unlockPin()
      navigate('/pos')
    } catch {
      setError(true)
      setTimeout(() => { setPin(''); setError(false) }, 800)
    } finally {
      setVerifying(false)
    }
  }

  const press = (key: string) => {
    if (verifying) return
    if (key === '⌫') { setPin((p) => p.slice(0, -1)); setError(false); return }
    if (pin.length >= PIN_LENGTH) return
    const next = pin + key
    setPin(next)
    if (next.length >= 4) {
      verify(next)
    }
  }

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="card p-8 shadow-lg text-center max-w-xs w-full">
      {user && (
        <div className="mb-7">
          <div className="w-16 h-16 rounded-full bg-brand-pale flex items-center justify-center mx-auto mb-3 border-2 border-brand/20">
            <span className="text-2xl font-black text-brand">{user.avatarInitials}</span>
          </div>
          <p className="font-black text-gray-900 text-lg">{user.name}</p>
          <p className="text-sm text-gray-500 capitalize font-medium">{user.role} · {user.branch}</p>
        </div>
      )}

      <p className="text-base font-bold text-gray-700 mb-5">Enter your PIN</p>

      {/* PIN dots */}
      <div className={`flex justify-center gap-3 mb-6 ${error ? 'shake' : ''}`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              i < pin.length
                ? error ? 'bg-red-500 border-red-500 scale-110' : 'bg-brand border-brand scale-110'
                : 'border-gray-300'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm font-bold text-red-500 mb-4 -mt-2">Incorrect PIN. Try again.</p>}

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
        {PAD.map((key, i) => (
          key === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => press(key)}
              disabled={verifying}
              className={`h-16 rounded-2xl font-black text-xl transition-all active:scale-90 disabled:opacity-50 ${
                key === '⌫'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center'
                  : 'bg-gray-50 text-gray-900 hover:bg-gray-100 border-2 border-gray-100 hover:border-gray-200 shadow-sm'
              }`}
            >
              {key === '⌫' ? <Delete className="w-5 h-5" /> : key}
            </button>
          )
        ))}
      </div>

      <button onClick={handleLogout} className="mt-6 flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 transition-colors mx-auto font-semibold">
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  )
}
