import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Delete, LogOut, Wifi, WifiOff, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { setDevicePin, verifyDevicePin, hasDevicePin } from '../../lib/db'

const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']
const PIN_LENGTH = 4

export function PinLock() {
  const { user, unlockPin, logout } = useAuthStore()
  const navigate = useNavigate()

  // PIN setup: two-step (enter → confirm → save)
  const isSettingPin = !hasDevicePin()
  const [step, setStep]           = useState<'enter' | 'confirm'>('enter')
  const [firstPin, setFirstPin]   = useState('')

  // Shared entry state
  const [pin, setPin]             = useState('')
  const [error, setError]         = useState(false)
  const [errorMsg, setErrorMsg]   = useState('Incorrect PIN. Try again.')
  const [verifying, setVerifying] = useState(false)
  const [success, setSuccess]     = useState(false)

  /** Destination after successful unlock — cashiers go to POS, others to dashboard */
  const destination = user?.role === 'cashier' ? '/pos' : '/dashboard'

  const resetWithError = (msg = 'Incorrect PIN. Try again.') => {
    setError(true)
    setErrorMsg(msg)
    setTimeout(() => { setPin(''); setError(false) }, 900)
  }

  const verify = async (enteredPin: string) => {
    setVerifying(true)
    try {
      if (isSettingPin) {
        if (step === 'enter') {
          // Step 1: capture first entry, move to confirmation
          setFirstPin(enteredPin)
          setPin('')
          setStep('confirm')
          setVerifying(false)
          return
        }
        // Step 2: confirm — must match first entry
        if (enteredPin !== firstPin) {
          setFirstPin('')
          setStep('enter')
          resetWithError("PINs don't match. Try again.")
          setVerifying(false)
          return
        }
        // Confirmed — save and unlock
        await setDevicePin(enteredPin)
        setSuccess(true)
        setTimeout(() => { unlockPin(); navigate(destination) }, 600)
      } else {
        // Existing PIN — verify hash
        const valid = await verifyDevicePin(enteredPin)
        if (valid) {
          setSuccess(true)
          setTimeout(() => { unlockPin(); navigate(destination) }, 400)
        } else {
          resetWithError()
        }
      }
    } catch {
      resetWithError()
    } finally {
      setVerifying(false)
    }
  }

  const press = (key: string) => {
    if (verifying || success) return
    if (key === '⌫') { setPin((p) => p.slice(0, -1)); setError(false); return }
    if (pin.length >= PIN_LENGTH) return
    const next = pin + key
    setPin(next)
    if (next.length >= PIN_LENGTH) void verify(next)
  }

  const handleLogout = () => { logout(); navigate('/login') }

  // Heading copy depends on setup vs unlock, and which step
  const heading = isSettingPin
    ? step === 'enter' ? 'Set your device PIN' : 'Confirm your PIN'
    : 'Enter your PIN'

  const subheading = isSettingPin
    ? step === 'enter'
      ? 'Choose a 4-digit PIN for quick unlock on this device.'
      : 'Re-enter the same PIN to confirm.'
    : undefined

  return (
    <div className="card p-8 shadow-lg text-center max-w-xs w-full">
      {/* Online status */}
      <div className="flex justify-end mb-2">
        {navigator.onLine
          ? <span className="text-xs text-emerald-500 flex items-center gap-1"><Wifi className="w-3 h-3" /> Online</span>
          : <span className="text-xs text-amber-500 flex items-center gap-1"><WifiOff className="w-3 h-3" /> Offline</span>
        }
      </div>

      {user && (
        <div className="mb-7">
          <div className="w-16 h-16 rounded-full bg-brand-pale flex items-center justify-center mx-auto mb-3 border-2 border-brand/20">
            <span className="text-2xl font-black text-brand">{user.avatarInitials}</span>
          </div>
          <p className="font-black text-gray-900 text-lg">{user.name}</p>
          <p className="text-sm text-gray-500 capitalize font-medium">{user.role} · {user.branch}</p>
        </div>
      )}

      <p className="text-base font-bold text-gray-700 mb-1">{heading}</p>
      {subheading && <p className="text-xs text-gray-400 mb-4">{subheading}</p>}

      {/* PIN dots */}
      <div className={`flex justify-center gap-3 mb-6 mt-4 ${error ? 'shake' : ''}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              success
                ? 'bg-emerald-500 border-emerald-500 scale-110'
                : i < pin.length
                  ? error ? 'bg-red-500 border-red-500 scale-110' : 'bg-brand border-brand scale-110'
                  : 'border-gray-300'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm font-bold text-red-500 mb-4 -mt-2">{errorMsg}</p>}
      {success && (
        <p className="text-sm font-bold text-emerald-500 mb-4 -mt-2 flex items-center justify-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          {isSettingPin ? 'PIN saved!' : 'Unlocked!'}
        </p>
      )}

      {/* Step indicator for PIN setup */}
      {isSettingPin && (
        <div className="flex justify-center gap-1.5 mb-4">
          <span className={`w-5 h-1 rounded-full ${step === 'enter' ? 'bg-brand' : 'bg-emerald-400'}`} />
          <span className={`w-5 h-1 rounded-full ${step === 'confirm' ? 'bg-brand' : 'bg-gray-200'}`} />
        </div>
      )}

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
        {PAD.map((key, i) => (
          key === '' ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              onClick={() => press(key)}
              disabled={verifying || success}
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

      <button
        onClick={handleLogout}
        className="mt-6 flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 transition-colors mx-auto font-semibold"
      >
        <LogOut className="w-4 h-4" /> Sign out
      </button>
    </div>
  )
}
