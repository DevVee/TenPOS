import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ShoppingCart, ClipboardList, Package, LayoutDashboard,
  MoreHorizontal, ArrowLeftRight, Users, Shield, BarChart3, Settings2,
  ChevronDown, X, ArrowUpDown, AlertTriangle, Printer,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import { useLogoutConfirm } from '../../hooks/useLogoutConfirm'
import type { UserRole } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PrimaryTab {
  to: string
  icon: React.ElementType
  label: string
  roles: UserRole[]
  matchPrefix?: string
}

interface DrawerItem {
  label: string
  to: string
  icon: React.ElementType
  roles: UserRole[]
  children?: { label: string; to: string }[]
}

// ── Primary tabs (always visible) ────────────────────────────────────────────

const PRIMARY_TABS: PrimaryTab[] = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Home',   roles: ['admin', 'manager', 'viewer'] },
  { to: '/pos',          icon: ShoppingCart,    label: 'POS',    roles: ['admin', 'manager', 'cashier'] },
  { to: '/transactions', icon: ClipboardList,   label: 'Orders', roles: ['admin', 'manager', 'cashier', 'viewer'] },
  { to: '/inventory',    icon: Package,         label: 'Items',  roles: ['admin', 'manager'], matchPrefix: '/inventory' },
]

// ── More drawer sections ──────────────────────────────────────────────────────

const DRAWER_SECTIONS: { title: string; items: DrawerItem[] }[] = [
  {
    title: 'OPERATIONS',
    items: [
      {
        label: 'Returns',           to: '/returns',
        icon: ArrowLeftRight,       roles: ['admin', 'manager'],
      },
      {
        label: 'Stock Adjustments', to: '/inventory/adjustments',
        icon: ArrowUpDown,          roles: ['admin', 'manager'],
      },
      {
        label: 'Low Stock',         to: '/inventory/low-stock',
        icon: AlertTriangle,        roles: ['admin', 'manager', 'cashier'],
      },
      {
        label: 'Reports',           to: '/reports/sales',
        icon: BarChart3,            roles: ['admin', 'manager', 'viewer'],
        children: [
          { label: 'Sales',      to: '/reports/sales' },
          { label: 'Staff',      to: '/reports/staff' },
          { label: 'Financial',  to: '/reports/financial' },
          { label: 'Inventory',  to: '/reports/inventory' },
        ],
      },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      {
        label: 'Staff',     to: '/staff',
        icon: Users,        roles: ['admin'],
      },
      {
        label: 'Settings',  to: '/settings',
        icon: Settings2,    roles: ['admin', 'manager'],
        children: [
          { label: 'General',    to: '/settings' },
          { label: 'Branches',   to: '/settings/branches' },
          { label: 'Categories', to: '/settings/categories' },
          { label: 'Vouchers',   to: '/settings/vouchers' },
          { label: 'Sync Log',   to: '/settings/sync-log' },
          { label: 'Printer',    to: '/settings/printer' },
        ],
      },
      {
        label: 'Audit Log',    to: '/audit',
        icon: Shield,          roles: ['admin'],
      },
      // Cashier-only: access printer setup directly (admin/manager use Settings > Printer)
      {
        label: 'Printer Setup', to: '/settings/printer',
        icon: Printer,          roles: ['cashier'],
      },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPrimaryActive(tab: PrimaryTab, pathname: string): boolean {
  if (tab.to === '/pos') return pathname === '/pos'
  const prefix = tab.matchPrefix ?? tab.to
  return pathname === tab.to || pathname.startsWith(prefix + '/')
}

function isDrawerRouteActive(pathname: string): boolean {
  return DRAWER_SECTIONS.some((sec) =>
    sec.items.some((item) => {
      if (item.children) {
        return item.children.some(
          (c) => pathname === c.to || pathname.startsWith(c.to + '/'),
        )
      }
      return pathname === item.to || pathname.startsWith(item.to + '/')
    }),
  )
}

// ── More Drawer (full-screen, slides down from top) ───────────────────────────

function MoreDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuthStore()
  const { trigger: triggerLogout, modal: logoutModal } = useLogoutConfirm()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState<string[]>(['Reports', 'Settings'])

  const toggle = (label: string) =>
    setExpanded((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    )

  const isChildActive = (to: string) =>
    pathname === to || pathname.startsWith(to + '/')

  const isGroupActive = (children: { to: string }[]) =>
    children.some((c) => isChildActive(c.to))

  const handleNav = (to: string) => { navigate(to); onClose() }

  const handleLogout = () => { onClose(); triggerLogout() }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 md:hidden transition-opacity duration-300
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Full-screen panel — slides DOWN from top */}
      <div
        className={`fixed inset-0 z-50 md:hidden bg-white flex flex-col
          transition-transform duration-300 ease-out
          ${open ? 'translate-y-0' : '-translate-y-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 h-14 flex-shrink-0 border-b border-gray-100"
        >
          <p className="text-base font-bold text-gray-900">Menu</p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto px-3 py-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
        >
          {DRAWER_SECTIONS.map((sec) => {
            const visibleItems = sec.items.filter(
              (item) => user && item.roles.includes(user.role),
            )
            if (visibleItems.length === 0) return null

            return (
              <div key={sec.title} className="mb-2">
                <p className="text-[10px] font-bold tracking-widest text-gray-400 px-3 py-2">
                  {sec.title}
                </p>

                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const hasChildren = !!item.children
                  const isOpen = expanded.includes(item.label)
                  const groupActive = hasChildren && isGroupActive(item.children!)
                  const leafActive  = !hasChildren && isChildActive(item.to)
                  const active      = leafActive || groupActive

                  /* ── Expandable group ── */
                  if (hasChildren) {
                    return (
                      <div key={item.label}>
                        <button
                          onClick={() => toggle(item.label)}
                          className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium transition-colors
                            ${active ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                        >
                          <Icon
                            className="w-5 h-5 flex-shrink-0"
                            style={{ color: active ? '#E5484D' : '#6B7280' }}
                            strokeWidth={active ? 2.2 : 1.8}
                          />
                          <span className="flex-1 text-left" style={{ color: active ? '#E5484D' : '#374151' }}>
                            {item.label}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-gray-400 transition-transform duration-200
                              ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {isOpen && (
                          <div className="ml-11 mt-0.5 mb-1 space-y-0.5">
                            {item.children!.map((child) => {
                              const childActive = isChildActive(child.to)
                              return (
                                <button
                                  key={child.to}
                                  onClick={() => handleNav(child.to)}
                                  className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm transition-colors
                                    ${childActive
                                      ? 'text-brand font-semibold bg-red-50'
                                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                                    }`}
                                >
                                  {child.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }

                  /* ── Leaf link ── */
                  return (
                    <button
                      key={item.to}
                      onClick={() => handleNav(item.to)}
                      className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium transition-colors
                        ${active ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                    >
                      <Icon
                        className="w-5 h-5 flex-shrink-0"
                        style={{ color: active ? '#E5484D' : '#6B7280' }}
                        strokeWidth={active ? 2.2 : 1.8}
                      />
                      <span style={{ color: active ? '#E5484D' : '#374151' }}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {/* ── Profile + Logout ──────────────────────────────────────────── */}
          <div className="border-t border-gray-100 pt-3 mt-2">
            {user && (
              <button
                onClick={() => handleNav('/profile')}
                className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-colors
                  ${pathname === '/profile' ? 'bg-red-50' : 'hover:bg-gray-50'}`}
              >
                <div
                  className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-xs overflow-hidden"
                  style={{ background: '#E5484D' }}
                >
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                    : <span>{user.avatarInitials}</span>
                  }
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-none truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{user.role}</p>
                </div>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors mt-1"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Logout confirm modal — rendered outside the drawer so it overlays everything */}
      {logoutModal}
    </>
  )
}

// ── BottomNav ─────────────────────────────────────────────────────────────────

export function BottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const cart = usePOSStore((s) => s.cart)
  const [moreOpen, setMoreOpen] = useState(false)

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const onPOS = pathname === '/pos' || pathname.startsWith('/pos/')

  // Close drawer on route change
  useEffect(() => { setMoreOpen(false) }, [pathname])

  const visibleTabs = PRIMARY_TABS.filter((t) => user && t.roles.includes(user.role))
  const moreActive = isDrawerRouteActive(pathname) // don't highlight while open — it's obvious

  return (
    <>
      {/* ── Floating cart bar ─────────────────────────────────────────────── */}
      {cartCount > 0 && !onPOS && (
        <div
          className="fixed left-0 right-0 z-40 px-4 pb-1 md:hidden"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 60px)' }}
        >
          <button
            onClick={() => navigate('/pos')}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-white text-sm font-semibold shadow-lg active:scale-[0.98] transition-transform"
            style={{ background: '#E5484D' }}
          >
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="w-4 h-4" />
              <span>View Cart</span>
            </div>
            <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-bold">
              {cartCount > 99 ? '99+' : cartCount} {cartCount === 1 ? 'item' : 'items'}
            </span>
          </button>
        </div>
      )}

      {/* ── More drawer ───────────────────────────────────────────────────── */}
      <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} />

      {/* ── Bottom tab bar ────────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch h-[60px]">

          {visibleTabs.map((tab) => {
            const Icon   = tab.icon
            const active = isPrimaryActive(tab, pathname)
            const isPOS  = tab.to === '/pos'

            return (
              <Link
                key={tab.to}
                to={tab.to}
                className="flex-1 flex flex-col items-center justify-center gap-1 relative select-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2.5px] rounded-b-full"
                    style={{ background: '#E5484D' }}
                  />
                )}
                <div className="relative">
                  <Icon
                    className="w-[22px] h-[22px] transition-colors"
                    style={{ color: active ? '#E5484D' : '#9CA3AF' }}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  {isPOS && cartCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-2 min-w-[16px] h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none"
                      style={{ background: '#E5484D' }}
                    >
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px] font-medium leading-none transition-colors"
                  style={{ color: active ? '#E5484D' : '#9CA3AF' }}
                >
                  {tab.label}
                </span>
              </Link>
            )
          })}

          {/* More tab — toggles the drawer */}
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="flex-1 flex flex-col items-center justify-center gap-1 relative select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {moreActive && !moreOpen && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2.5px] rounded-b-full"
                style={{ background: '#E5484D' }}
              />
            )}
            <MoreHorizontal
              className="w-[22px] h-[22px] transition-colors"
              style={{ color: (moreActive || moreOpen) ? '#E5484D' : '#9CA3AF' }}
              strokeWidth={(moreActive || moreOpen) ? 2.2 : 1.8}
            />
            <span
              className="text-[10px] font-medium leading-none transition-colors"
              style={{ color: (moreActive || moreOpen) ? '#E5484D' : '#9CA3AF' }}
            >
              {moreOpen ? 'Close' : 'More'}
            </span>
          </button>

        </div>
      </nav>
    </>
  )
}
