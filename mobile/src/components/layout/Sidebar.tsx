import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, BarChart3,
  Users, Settings2, ClipboardList, ArrowLeftRight,
  Shield, LogOut, ChevronDown, ChevronRight, Printer, AlertTriangle,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useLogoutConfirm } from '../../hooks/useLogoutConfirm'
import type { UserRole } from '../../types'

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
  roles: UserRole[]
  children?: { label: string; to: string }[]
  section?: string
}

const NAV: NavItem[] = [
  // GENERAL
  { label: 'Dashboard',      to: '/dashboard',    icon: LayoutDashboard, roles: ['admin', 'manager', 'viewer'],           section: 'GENERAL' },
  { label: 'POS Terminal',   to: '/pos',          icon: ShoppingCart,    roles: ['admin', 'manager', 'cashier'],           section: 'GENERAL' },
  // Cashier-only shortcuts (admin/manager access these via Settings & Inventory sub-menus)
  { label: 'Low Stock',      to: '/inventory/low-stock', icon: AlertTriangle, roles: ['cashier'],                         section: 'GENERAL' },
  { label: 'Printer Setup',  to: '/settings/printer',    icon: Printer,       roles: ['cashier'],                         section: 'GENERAL' },

  // OPERATIONS
  { label: 'Transactions',   to: '/transactions', icon: ClipboardList,   roles: ['admin', 'manager', 'viewer'],            section: 'OPERATIONS' },
  { label: 'Returns',        to: '/returns',      icon: ArrowLeftRight,  roles: ['admin', 'manager'],                      section: 'OPERATIONS' },
  {
    label: 'Inventory', to: '/inventory', icon: Package, roles: ['admin', 'manager'], section: 'OPERATIONS',
    children: [
      { label: 'Products',          to: '/inventory' },
      { label: 'Stock Adjustments', to: '/inventory/adjustments' },
      { label: 'Low Stock',         to: '/inventory/low-stock' },
    ],
  },
  {
    label: 'Reports', to: '/reports/sales', icon: BarChart3, roles: ['admin', 'manager', 'viewer'], section: 'OPERATIONS',
    children: [
      { label: 'Sales',          to: '/reports/sales' },
      { label: 'Staff',          to: '/reports/staff' },
      { label: 'Financial',      to: '/reports/financial' },
      { label: 'Inventory',      to: '/reports/inventory' },
    ],
  },

  // MANAGEMENT
  { label: 'Staff',          to: '/staff',        icon: Users,           roles: ['admin'],                                 section: 'MANAGEMENT' },
  {
    label: 'Settings', to: '/settings', icon: Settings2, roles: ['admin', 'manager'], section: 'MANAGEMENT',
    children: [
      { label: 'General',    to: '/settings' },
      { label: 'Branches',   to: '/settings/branches' },
      { label: 'Categories', to: '/settings/categories' },
      { label: 'Vouchers',   to: '/settings/vouchers' },
      { label: 'Sync Log',   to: '/settings/sync-log' },
      { label: 'Printer',    to: '/settings/printer' },
    ],
  },
  { label: 'Audit Log',      to: '/audit',        icon: Shield,          roles: ['admin'],                                 section: 'MANAGEMENT' },
]

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuthStore()
  const { pathname } = useLocation()
  const { trigger: triggerLogout, modal: logoutModal } = useLogoutConfirm()

  const [openMenus, setOpenMenus] = useState<string[]>(['Inventory', 'Reports', 'Settings'])

  const visible = NAV.filter((n) => user && n.roles.includes(user.role))

  const toggleMenu = (label: string) =>
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )

  const isActive = (to: string): boolean => {
    if (to === '/inventory' || to === '/settings') return pathname === to
    return pathname === to || pathname.startsWith(to + '/')
  }

  const isGroupActive = (children: { to: string }[]): boolean =>
    children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))

  // Group items by section
  const sections = ['GENERAL', 'OPERATIONS', 'MANAGEMENT']
  const bySection = (s: string) => visible.filter((n) => n.section === s)

  return (
    <aside
      className={`fixed top-0 left-0 h-screen flex flex-col z-30 transition-all duration-200 shadow-panel
        ${collapsed ? 'w-[64px]' : 'w-[240px]'}`}
      style={{ background: '#111318' }}
    >
      {/* Safe-area spacer — pushes logo below Android/iOS status bar */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />

      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div
        className={`flex items-center h-14 flex-shrink-0 border-b ${collapsed ? 'justify-center px-0' : 'px-4 gap-3'}`}
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className={`flex-shrink-0 rounded-lg overflow-hidden ${collapsed ? 'w-8 h-8' : 'w-7 h-7'}`}>
          <img
            src="/brand/logo.png"
            alt="TenPOS"
            className="w-full h-full object-contain"
            onError={(e) => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              // show fallback text sibling
              const sib = el.nextElementSibling as HTMLElement | null
              if (sib) sib.style.display = 'flex'
            }}
          />
          <div
            className="w-full h-full items-center justify-center rounded-lg hidden"
            style={{ background: '#E5484D', display: 'none' }}
          >
            <span className="text-white font-black text-xs">T</span>
          </div>
        </div>

        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-none tracking-tight">TenPOS</p>
            <p className="text-[10px] font-medium leading-tight mt-0.5" style={{ color: '#6B7280' }}>Point of Sale</p>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 sidebar-scroll" style={{ scrollbarWidth: 'thin' }}>
        <div className={`${collapsed ? 'px-2' : 'px-3'} space-y-0.5`}>
          {sections.map((section) => {
            const items = bySection(section)
            if (items.length === 0) return null

            return (
              <div key={section}>
                {/* Section label */}
                {!collapsed && (
                  <p className="sidebar-section">{section}</p>
                )}
                {collapsed && <div className="mt-4 mb-1" />}

                {items.map((item) => {
                  const Icon        = item.icon
                  const hasChildren = !!item.children && !collapsed
                  const isOpen      = openMenus.includes(item.label)
                  const active      = isActive(item.to)
                  const groupActive = hasChildren && isGroupActive(item.children!)

                  /* ── Expandable group ── */
                  if (hasChildren) {
                    return (
                      <div key={item.label}>
                        <button
                          onClick={() => toggleMenu(item.label)}
                          className={`sidebar-link w-full ${groupActive ? 'active' : ''}`}
                        >
                          <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                          {!collapsed && (
                            <>
                              <span className="flex-1 text-left">{item.label}</span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                                style={{ color: '#4B5563' }}
                              />
                            </>
                          )}
                        </button>

                        {/* Children */}
                        {isOpen && !collapsed && (
                          <div className="ml-4 mt-0.5 mb-1 space-y-0.5 border-l pl-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                            {item.children!.map((child) => {
                              const childActive = pathname === child.to || pathname.startsWith(child.to + '/')
                              return (
                                <Link
                                  key={child.to}
                                  to={child.to}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all duration-100
                                    ${childActive
                                      ? 'text-white font-medium'
                                      : 'font-normal hover:text-white'
                                    }`}
                                  style={{ color: childActive ? '#fff' : '#6B7280' }}
                                >
                                  {childActive && (
                                    <ChevronRight className="w-3 h-3 flex-shrink-0 text-brand" />
                                  )}
                                  {!childActive && <span className="w-3 flex-shrink-0" />}
                                  <span className="text-[13px]">{child.label}</span>
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }

                  /* ── Leaf link ── */
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={`sidebar-link ${active ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`}
                    >
                      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </div>
      </nav>

      {/* ── User card + Logout ────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-t"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {user && (
          <Link
            to="/profile"
            title={collapsed ? `${user.name} — Profile` : undefined}
            className={`flex items-center gap-3 px-3 py-3 transition-all duration-150 hover:bg-white/[0.05]
              ${collapsed ? 'justify-center' : ''}`}
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-[11px] text-white"
              style={{ background: '#E5484D' }}
            >
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                : <span>{user.avatarInitials}</span>
              }
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white truncate leading-none">{user.name}</p>
                <p className="text-[11px] mt-0.5 capitalize leading-none" style={{ color: '#6B7280' }}>{user.role}</p>
              </div>
            )}
          </Link>
        )}

        <button
          onClick={triggerLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex items-center gap-3 w-full px-3 py-2.5 text-sm transition-all duration-150
            hover:bg-red-500/10 group ${collapsed ? 'justify-center' : ''}`}
          style={{ color: '#6B7280' }}
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0 group-hover:text-red-400 transition-colors" />
          {!collapsed && (
            <span className="text-[13px] group-hover:text-red-400 transition-colors">Sign out</span>
          )}
        </button>
        {logoutModal}
      </div>
    </aside>
  )
}
