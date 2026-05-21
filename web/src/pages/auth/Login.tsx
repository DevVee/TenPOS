import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, AlertCircle, ShoppingCart, Users, ArrowRight,
  Zap, Package, Globe, Mail, CheckCircle2,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { apiLogin } from '../../lib/api'
import type { UserRole } from '../../types'

const FEATURES = [
  { icon: ShoppingCart, title: 'Sell with speed',      desc: 'Fast transactions that keep your line moving.' },
  { icon: Package,      title: 'Manage with clarity',  desc: 'Real-time inventory and stock insights.' },
  { icon: Users,        title: 'Grow together',        desc: 'Aligned teams. Stronger impact.' },
]

const BAGS = [
  { src: '/products/butterfly-large.png',  label: 'Pagasa Large Butterfly' },
  { src: '/products/dino-medium.png',      label: 'Malakas Medium Dinosaur' },
  { src: '/products/hearts-large.png',     label: 'Pagasa Large Hearts' },
]

const STATS = [
  { value: '12k+', label: 'Transactions' },
  { value: '5',    label: 'Branches' },
  { value: '99%',  label: 'Uptime' },
]

export function Login() {
  const navigate = useNavigate()
  const login    = useAuthStore((s) => s.login)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Enter your email and password to continue.'); return }
    setLoading(true)
    try {
      const data = await apiLogin(email, password)
      const me   = data.user
      const initials = me.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
      login({ id: me.id, name: me.name, email: me.email, role: me.role as UserRole, avatarInitials: initials, branch: 'Main Branch', branch_id: me.branch_id, avatar_url: me.avatar_url } as Parameters<typeof login>[0])
      navigate(me.role === 'cashier' ? '/pos' : '/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex overflow-hidden">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[42%] flex-col overflow-hidden relative"
        style={{ background: 'linear-gradient(145deg, #C0392B 0%, #A93226 55%, #922B21 100%)' }}
      >
        {/* Decorative blobs */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-white/[0.06] pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-white/[0.06] pointer-events-none" />
        <div className="absolute top-1/2 right-0 w-48 h-48 rounded-full bg-white/[0.04] pointer-events-none -translate-y-1/2 translate-x-1/2" />

        {/* Subtle dot grid */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Logo */}
        <div className="relative z-10 px-8 pt-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
            <img src="/brand/logo.png" alt="TenPOS" className="h-7 w-7 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div>
            <p className="text-white font-black text-base leading-none">TenPOS</p>
            <p className="text-white/60 text-[10px] font-semibold tracking-widest uppercase leading-none mt-0.5">Point of Sale System</p>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 px-8 pt-10 flex-1">
          <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight mb-4">
            Every bag sold,<br />a story moves<br />forward.
          </h1>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-0.5 bg-white/40 rounded-full" />
            <Zap className="w-4 h-4 text-white/50" />
          </div>
          <p className="text-white/70 text-sm leading-relaxed mb-8 max-w-xs">
            Built for Carry Hope Bags — track every transaction, manage inventory, and keep your whole team aligned from one place.
          </p>

          {/* Feature list */}
          <div className="space-y-4 mb-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-2xl bg-white/12 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-4 h-4 text-white" />
                </div>
                <div className="pt-0.5">
                  <p className="text-white font-bold text-sm leading-none mb-1">{f.title}</p>
                  <p className="text-white/55 text-xs leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Product card */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="text-white font-black text-sm mb-0.5">Carry Hope Bags</p>
                <div className="w-6 h-0.5 bg-white/40 rounded-full mb-1.5" />
                <p className="text-white/60 text-xs">Schoolbags that change lives.</p>
              </div>
              <div className="flex gap-1.5">
                {BAGS.map((bag) => (
                  <div key={bag.label} className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 border border-white/10 flex-shrink-0">
                    <img src={bag.src} alt={bag.label} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).parentElement!.classList.add('bg-white/5') }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative z-10 mx-8 mb-5 grid grid-cols-3 divide-x divide-white/15 bg-white/8 border border-white/12 rounded-2xl overflow-hidden">
          {STATS.map((s) => (
            <div key={s.label} className="px-4 py-3 text-center">
              <p className="text-white font-black text-lg leading-none">{s.value}</p>
              <p className="text-white/50 text-[10px] font-semibold mt-0.5 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="relative z-10 px-8 pb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white/70" />
            </div>
            <p className="text-white/70 text-xs font-semibold">More than a bag. A reason to hope.</p>
          </div>
          <p className="text-white/30 text-[11px]">© {new Date().getFullYear()} Ten Foundation Philippines Inc.</p>
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div className="flex-1 bg-white flex flex-col overflow-y-auto relative">

        {/* Red top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand to-brand-light z-10" />

        {/* Language selector */}
        <div className="flex justify-end px-8 pt-7">
          <button className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors font-medium">
            <Globe className="w-3.5 h-3.5" />
            English
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8 py-8">
          <div className="w-full max-w-sm">

            {/* App icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-pale to-red-100 border border-brand/15 flex items-center justify-center shadow-sm shadow-brand/10">
                <img src="/brand/logo.png" alt="TenPOS" className="w-9 h-9 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              </div>
            </div>

            <h2 className="text-2xl font-black text-gray-900 text-center mb-1.5">Welcome back!</h2>
            {/* Accent underline */}
            <div className="w-10 h-1 bg-gradient-to-r from-brand to-brand-light rounded-full mx-auto mb-2" />
            <p className="text-sm text-gray-400 text-center mb-6 font-medium">Sign in to your TenPOS account</p>

            {error && (
              <div className="flex items-center gap-2.5 bg-brand-pale border border-red-200 text-brand text-sm rounded-xl px-4 py-3 mb-4 shake">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    className="input-base pl-10"
                    placeholder="admin@tenpos.ph"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="input-base pl-10 pr-11"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 transition-colors" tabIndex={-1}>
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3.5 text-sm rounded-xl gap-2 mt-2">
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
                  : <>Sign In <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 mt-5 font-medium">
              Need access?{' '}
              <span className="text-gray-600 font-semibold">Contact your system administrator.</span>
            </p>
          </div>
        </div>

        {/* Security badge */}
        <div className="px-8 pb-8">
          <div className="w-full max-w-sm mx-auto">
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800 leading-none mb-0.5">Your data is secure</p>
                <p className="text-xs text-emerald-600/80 font-medium">Industry-standard encryption protects your account.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
