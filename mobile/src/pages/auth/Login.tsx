import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, AlertCircle, ShoppingCart, Users, ArrowRight,
  Zap, Package, Shield,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { apiLogin } from '../../lib/api'
import type { UserRole } from '../../types'

const BAGS = [
  { src: '/products/butterfly-large.png',  label: 'Pagasa Large Butterfly' },
  { src: '/products/dino-medium.png',      label: 'Malakas Medium Dinosaur' },
  { src: '/products/hearts-large.png',     label: 'Pagasa Large Hearts' },
]

const FEATURES = [
  { icon: ShoppingCart, title: 'Sell with speed',      desc: 'Fast transactions that keep your line moving.' },
  { icon: Package,      title: 'Manage with clarity',  desc: 'Real-time inventory and stock insights.' },
  { icon: Users,        title: 'Grow together',        desc: 'Aligned teams. Stronger impact.' },
]

export function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username || !password) { setError('Enter your username and password to continue.'); return }

    // Check connectivity before hitting the network
    if (!navigator.onLine) {
      setError('No internet connection. Please check your network and try again.')
      return
    }

    setLoading(true)
    try {
      const data = await apiLogin(username, password)
      const me = data.user
      const initials = me.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
      login({ id: me.id, name: me.name, email: me.email, role: me.role as UserRole, avatarInitials: initials, branch: me.branch_name ?? 'Unknown Branch', branch_id: me.branch_id })
      navigate(me.role === 'cashier' ? '/pos' : '/dashboard')
    } catch (err) {
      // Distinguish network errors from auth errors
      const isNetworkErr = !navigator.onLine || (
        err instanceof Error && /fetch|network|failed to fetch|load/i.test(err.message)
      )
      setError(
        isNetworkErr
          ? 'No internet connection. Please check your network and try again.'
          : (err instanceof Error ? err.message : 'Incorrect username or password.')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex overflow-hidden">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div className="hidden md:flex md:w-[42%] bg-brand flex-col overflow-hidden relative">

        {/* Decorative blobs */}
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 px-8 pt-8 flex items-center space-x-3">
          <img
            src="/brand/logo.png"
            alt="TenPOS"
            className="h-9 w-9 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div>
            <p className="text-white font-black text-base leading-none">TenPOS</p>
            <p className="text-white/60 text-[10px] font-semibold tracking-widest uppercase leading-none mt-0.5">Point of Sale System</p>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10 px-8 pt-10 flex-1">
          <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight mb-4">
            Every bag sold,<br />
            a story moves<br />
            forward.
          </h1>

          {/* Divider */}
          <div className="flex items-center space-x-3 mb-5">
            <div className="w-8 h-0.5 bg-white/40 rounded-full" />
            <Zap className="w-4 h-4 text-white/50" />
          </div>

          <p className="text-white/70 text-sm leading-relaxed mb-8 max-w-xs">
            Built for Carry Hope Bags — track every transaction, manage inventory, and keep your whole team aligned from one place.
          </p>

          {/* Feature list */}
          <div className="space-y-4 mb-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start space-x-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-sm leading-none mb-0.5">{f.title}</p>
                  <p className="text-white/55 text-xs leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Carry Hope Bags card */}
          <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
            <div className="flex items-start space-x-4">
              <div className="flex-1">
                <p className="text-white font-black text-sm mb-0.5">Carry Hope Bags</p>
                <div className="w-6 h-0.5 bg-red-300 rounded-full mb-1" />
                <p className="text-white/60 text-xs">Schoolbags that change lives.</p>
              </div>
              <div className="flex space-x-1">
                {BAGS.map((bag) => (
                  <div key={bag.label} className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 flex-shrink-0">
                    <img
                      src={bag.src}
                      alt={bag.label}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).parentElement!.classList.add('bg-white/5') }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="relative z-10 px-8 pb-8">
          <p className="text-white/30 text-[11px]">© {new Date().getFullYear()} Ten Foundation Philippines Inc.</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div className="flex-1 bg-white flex flex-col overflow-y-auto">

        {/* Centered form content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-8">
          <div className="w-full max-w-sm">

            {/* Icon */}
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-gray-900 border-2 border-gray-700 flex items-center justify-center">
                <img
                  src="/brand/logo.png"
                  alt="TenPOS"
                  className="w-9 h-9 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            </div>

            <h2 className="text-2xl font-black text-gray-900 text-center mb-1">Welcome back!</h2>
            <p className="text-sm text-gray-400 text-center mb-6">Sign in to your TenPOS account</p>

            {error && (
              <div className="flex items-center space-x-2 bg-brand-pale border border-red-200 text-brand text-sm rounded-xl px-4 py-3 mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Username</label>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  <input
                    type="text"
                    className="input-base pl-10"
                    placeholder="your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="input-base pl-10 pr-11"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350)}
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
                className="btn-primary w-full py-3.5 text-sm rounded-md"
              >
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Signing in...</span></>
                ) : (
                  <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-4">
              Need access?{' '}
              <span className="text-gray-600 font-medium">Contact your system administrator.</span>
            </p>
          </div>
        </div>

        {/* Security badge */}
        <div className="px-8 pb-8">
          <div className="w-full max-w-sm mx-auto">
            <div className="flex items-center space-x-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-brand-pale flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-brand" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800 leading-none mb-0.5">Your data is secure with us</p>
                <p className="text-xs text-gray-400">We use industry-standard encryption to protect your information.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
