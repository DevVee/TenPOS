import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { apiLogin } from '../../lib/api'
import type { UserRole } from '../../types'

const CDN = 'https://carryhopebags.com/cdn/shop/files/'
const TEN_LOGO = 'https://carryhopebags.com/cdn/shop/files/Ten_Foundations_TEN_-_Red.png?v=1751749937&width=400'

const BAGS = [
  { src: `${CDN}Pagasa-Large-Butterfly-1.png?v=1746203789&width=400`, label: 'Pagasa Large' },
  { src: `${CDN}Malakas-Medium-Dinosaur-1.png?v=1747373708&width=400`, label: 'Malakas Medium' },
  { src: `${CDN}Pagasa-Large-Hearts-1.png?v=1746203788&width=400`, label: 'Pagasa Hearts' },
]

export function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Enter your email and password to continue.')
      return
    }
    setLoading(true)
    try {
      const data = await apiLogin(email, password)
      const me = data.user
      const initials = me.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
      login({
        id: me.id,
        name: me.name,
        email: me.email,
        role: me.role as UserRole,
        avatarInitials: initials,
        branch: 'Main Branch',
        branch_id: me.branch_id,
      })
      navigate(me.role === 'cashier' ? '/pos' : '/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── LEFT PANEL ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[55%] bg-brand relative overflow-hidden flex-col">

        {/* Subtle texture circles */}
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-[360px] h-[360px] rounded-full bg-white/5 pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full px-12 xl:px-16 py-12 xl:py-14">

          {/* Logo */}
          <img
            src={TEN_LOGO}
            alt="Ten Foundation Philippines"
            className="h-10 object-contain object-left brightness-0 invert mb-auto"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />

          {/* Main copy */}
          <div className="mb-10 mt-16">
            <p className="text-red-200/80 text-sm font-semibold tracking-widest uppercase mb-4">
              TenPOS · Point of Sale System
            </p>
            <h1 className="text-5xl xl:text-6xl font-black text-white leading-[1.05] tracking-tight mb-6">
              Every bag sold,<br />
              <span className="text-red-200">a story moves</span><br />
              forward.
            </h1>
            <p className="text-red-100/70 text-base leading-relaxed max-w-sm">
              Built for Carry Hope Bags — track every transaction, manage inventory, and keep your whole team aligned from one place.
            </p>
          </div>

          {/* Product images — staggered, not grid */}
          <div className="flex items-end gap-3 mb-10">
            {BAGS.map((bag, i) => (
              <div
                key={bag.label}
                className="overflow-hidden rounded-2xl border border-white/20 shadow-xl flex-shrink-0"
                style={{
                  width: i === 1 ? 140 : 110,
                  height: i === 1 ? 160 : 130,
                  marginBottom: i === 1 ? 0 : i === 0 ? 16 : 8,
                }}
              >
                <img
                  src={bag.src}
                  alt={bag.label}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.background = 'rgba(255,255,255,0.08)' }}
                />
              </div>
            ))}

            {/* Tag beside the tallest image */}
            <div className="mb-4 ml-1">
              <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 backdrop-blur-sm">
                <p className="text-white text-xs font-semibold mb-0.5">Carry Hope Bags</p>
                <p className="text-red-200 text-xs">Schoolbags that change lives</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-red-300/60 text-xs">
            © {new Date().getFullYear()} Ten Foundation Philippines Inc.
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 sm:px-10 bg-white">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 bg-brand rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">T</span>
            </div>
            <div>
              <p className="font-black text-gray-900 text-base leading-none">TenPOS</p>
              <p className="text-xs text-gray-400 mt-0.5">Ten Foundation Philippines</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-black text-gray-900 mb-1.5">Sign in</h2>
            <p className="text-gray-400 text-sm">Enter your credentials to access your account.</p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2.5 bg-brand-pale border border-red-200 text-brand text-sm rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="input-base"
                placeholder="you@tenpos.ph"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input-base pr-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 text-sm rounded-xl mt-2"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Signing in...</>
                : 'Sign In'
              }
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-8">
            Need access?{' '}
            <span className="text-gray-500 font-medium">Contact your system administrator.</span>
          </p>
        </div>
      </div>

    </div>
  )
}
