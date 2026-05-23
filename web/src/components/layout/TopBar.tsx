import { Menu, Wifi, WifiOff, RefreshCw, ChevronRight, MapPin } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore } from '../../store/branchStore'
import { useNavigate } from 'react-router-dom'
import type { User } from '../../types'

interface TopBarProps {
  onToggleSidebar: () => void
  title?: string
}

// Route → breadcrumb label map
const ROUTE_LABELS: Record<string, string> = {
  '':              'Home',
  'dashboard':     'Dashboard',
  'pos':           'POS Terminal',
  'transactions':  'Transactions',
  'returns':       'Returns',
  'inventory':     'Inventory',
  'adjustments':   'Stock Adjustments',
  'low-stock':     'Low Stock',
  'reports':       'Reports',
  'sales':         'Sales',
  'staff':         'Staff',
  'financial':     'Financial',
  'settings':      'Settings',
  'branches':      'Branches',
  'categories':    'Categories',
  'vouchers':      'Vouchers',
  'sync-log':      'Sync Log',
  'audit':         'Audit Log',
  'profile':       'Profile',
}

function Breadcrumb() {
  const { pathname } = useLocation()
  const segments = pathname.split('/').filter(Boolean)

  // Skip UUIDs in breadcrumb
  const isUuid = (s: string) => /^[0-9a-f-]{20,}$/.test(s)
  const parts = segments.filter((s) => !isUuid(s))

  if (parts.length === 0) return null

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
      {parts.map((seg, i) => {
        const label = ROUTE_LABELS[seg] ?? seg
        const isLast = i === parts.length - 1
        return (
          <span key={seg} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
            <span
              className={`font-medium leading-none ${
                isLast
                  ? 'text-gray-800 text-sm'
                  : 'text-gray-400 text-sm hover:text-gray-600 transition-colors'
              }`}
            >
              {label}
            </span>
          </span>
        )
      })}
    </nav>
  )
}

type SyncStatus = 'online' | 'offline' | 'syncing' | 'pending'

function SyncIndicator({ status }: { status: SyncStatus }) {
  const cfg: Record<SyncStatus, { icon: React.ElementType; label: string; cls: string }> = {
    online:  { icon: Wifi,       label: 'Online',  cls: 'text-emerald-600' },
    offline: { icon: WifiOff,    label: 'Offline', cls: 'text-red-500' },
    syncing: { icon: RefreshCw,  label: 'Syncing', cls: 'text-blue-500' },
    pending: { icon: RefreshCw,  label: 'Pending', cls: 'text-amber-500' },
  }
  const c = cfg[status] ?? cfg.online   // safe fallback — never undefined
  const Icon = c.icon

  return (
    <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium ${c.cls}`} title={c.label}>
      <Icon className={`w-3.5 h-3.5 ${status === 'syncing' ? 'animate-spin' : ''}`} />
      <span className="hidden lg:inline">{c.label}</span>
    </div>
  )
}

function ProfileMenu({ user }: { user: User }) {
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="w-7 h-7 rounded-md overflow-hidden flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: '#E5484D' }}>
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            : <span>{user.avatarInitials}</span>
          }
        </div>
        <div className="hidden md:block text-left">
          <p className="text-sm font-semibold text-gray-800 leading-none">{user.name}</p>
          <p className="text-xs text-gray-400 capitalize leading-none mt-0.5">{user.role}</p>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-panel py-1.5 z-50 animate-slide-up">
          <div className="px-3 py-2 border-b border-gray-100 mb-1">
            <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user.role}</p>
          </div>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Profile Settings
          </Link>
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); logout(); navigate('/login') }}
              className="flex items-center gap-2.5 px-3 py-2 w-full text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const { syncStatus } = usePOSStore()
  const { user } = useAuthStore()
  const { activeBranchName } = useBranchStore()

  // Admins see the selected active branch (or their own if none set).
  // Managers & cashiers always see their own branch.
  const branchLabel =
    user?.role === 'admin'
      ? (activeBranchName ?? user?.branch)
      : user?.branch

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 gap-4 flex-shrink-0">

      {/* ── LEFT: toggle + breadcrumb ─────────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center flex-shrink-0"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>
        <Breadcrumb />
      </div>

      {/* ── RIGHT: status + notifications + profile ──────────────────── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <SyncIndicator status={syncStatus} />

        {/* Branch indicator */}
        {branchLabel && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500 font-medium px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
            <MapPin className="w-3 h-3 text-gray-400" />
            <span className="truncate max-w-[140px]">{branchLabel}</span>
          </div>
        )}

        {/* Profile */}
        {user && <ProfileMenu user={user} />}
      </div>
    </header>
  )
}
