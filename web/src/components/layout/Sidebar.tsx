import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, BarChart3,
  Users, Settings2, ClipboardList, ArrowLeftRight,
  Shield, LogOut, ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../types'

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
  roles: UserRole[]
  children?: { label: string; to: string }[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard',      to: '/dashboard',     icon: LayoutDashboard, roles: ['admin', 'manager', 'viewer'] },
  { label: 'POS Terminal',   to: '/pos',           icon: ShoppingCart,    roles: ['admin', 'manager', 'cashier'] },
  { label: 'Transactions',   to: '/transactions',  icon: ClipboardList,   roles: ['admin', 'manager', 'viewer'] },
  { label: 'Returns & Voids',to: '/returns',       icon: ArrowLeftRight,  roles: ['admin', 'manager'] },
  {
    label: 'Inventory', to: '/inventory', icon: Package, roles: ['admin', 'manager'],
    children: [
      { label: 'Products',          to: '/inventory' },
      { label: 'Stock Adjustments', to: '/inventory/adjustments' },
      { label: 'Low Stock',         to: '/inventory/low-stock' },
    ],
  },
  {
    label: 'Reports', to: '/reports/sales', icon: BarChart3, roles: ['admin', 'manager', 'viewer'],
    children: [
      { label: 'Sales',                to: '/reports/sales' },
      { label: 'Staff Performance',    to: '/reports/staff' },
      { label: 'Financial / Z-Report', to: '/reports/financial' },
      { label: 'Inventory Report',     to: '/reports/inventory' },
    ],
  },
  { label: 'Staff',      to: '/staff',   icon: Users,     roles: ['admin'] },
  {
    label: 'Settings', to: '/settings', icon: Settings2, roles: ['admin', 'manager'],
    children: [
      { label: 'General',    to: '/settings' },
      { label: 'Branches',   to: '/settings/branches' },
      { label: 'Categories', to: '/settings/categories' },
      { label: 'Vouchers',   to: '/settings/vouchers' },
      { label: 'Sync Log',   to: '/settings/sync-log' },
    ],
  },
  { label: 'Audit Log', to: '/audit',   icon: Shield,    roles: ['admin'] },
]

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuthStore()
  const navigate  = useNavigate()
  const { pathname } = useLocation()

  const [openMenus, setOpenMenus] = useState<string[]>(['Inventory', 'Reports', 'Settings'])

  const visible = NAV.filter((n) => user && n.roles.includes(user.role))

  const toggleMenu = (label: string) =>
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )

  const handleLogout = () => { logout(); navigate('/login') }

  /**
   * Is a leaf route currently active?
   * Exact-match for pages whose path is a prefix of others (/inventory, /settings).
   */
  const isActive = (to: string): boolean => {
    if (to === '/inventory' || to === '/settings') return pathname === to
    return pathname === to || pathname.startsWith(to + '/')
  }

  /** Is any child of an expandable section active? */
  const isGroupActive = (children: { to: string }[]): boolean =>
    children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'))

  return (
    <aside className={`fixed top-0 left-0 h-screen bg-white border-r border-gray-100 flex flex-col z-30 transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-[220px]'}`}>

      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className={`flex items-center h-16 border-b border-gray-100 flex-shrink-0 ${collapsed ? 'justify-center px-2' : 'px-4 gap-3'}`}>
        <div className={`flex-shrink-0 ${collapsed ? 'w-9 h-9' : 'w-8 h-8'}`}>
          <img
            src="/brand/logo.png"
            alt="TenPOS"
            className="w-full h-full object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        {!collapsed && (
          <div className="min-w-0 border-l border-gray-100 pl-3">
            <p className="text-sm font-black text-gray-900 leading-none tracking-tight">TenPOS</p>
            <p className="text-[11px] text-gray-400 font-medium leading-tight mt-0.5">Point of Sale</p>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {visible.map((item) => {
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
                  className={`group flex items-center gap-3 w-full px-2 py-2 rounded-xl transition-all duration-150 hover:bg-gray-50 ${
                    groupActive ? 'bg-brand-pale hover:bg-brand-pale' : ''
                  } ${collapsed ? 'justify-center' : 'justify-between'}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className={`flex items-center justify-center rounded-xl flex-shrink-0 ${collapsed ? 'w-10 h-10' : 'w-8 h-8'}`}>
                      <Icon className={`w-5 h-5 transition-colors ${
                        groupActive ? 'text-brand' : 'text-gray-400 group-hover:text-gray-600'
                      }`} />
                    </div>
                    {!collapsed && (
                      <span className={`text-[13px] font-medium transition-colors ${
                        groupActive ? 'text-brand font-semibold' : 'text-gray-600 group-hover:text-gray-900'
                      }`}>
                        {item.label}
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
                      groupActive ? 'text-brand' : 'text-gray-400'
                    } ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>

                {/* Child links */}
                {isOpen && !collapsed && (
                  <div className="ml-[44px] mt-0.5 space-y-0.5 pb-1">
                    {item.children!.map((child) => {
                      const childActive = pathname === child.to || pathname.startsWith(child.to + '/')
                      return (
                        <Link
                          key={child.to}
                          to={child.to}
                          className={`block px-3 py-2 rounded-lg text-[13px] transition-all font-medium ${
                            childActive
                              ? 'text-brand font-semibold bg-brand-pale'
                              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                          }`}
                        >
                          {child.label}
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
              className={`group flex items-center gap-3 px-2 py-2 rounded-xl transition-all duration-150 w-full ${
                active ? 'bg-brand-pale' : 'hover:bg-gray-50'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <div className={`flex items-center justify-center rounded-xl flex-shrink-0 ${collapsed ? 'w-10 h-10' : 'w-8 h-8'}`}>
                <Icon className={`w-5 h-5 transition-colors ${
                  active ? 'text-brand' : 'text-gray-400 group-hover:text-gray-600'
                }`} />
              </div>
              {!collapsed && (
                <span className={`text-[13px] transition-colors ${
                  active
                    ? 'text-brand font-semibold'
                    : 'text-gray-600 font-medium group-hover:text-gray-900'
                }`}>
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── User + Logout ─────────────────────────────────────────────────── */}
      <div className="px-2 py-3 border-t border-gray-100 flex-shrink-0 space-y-1">
        {!collapsed && user && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-0.5">
            <div className="w-8 h-8 rounded-xl bg-brand-pale flex items-center justify-center flex-shrink-0 border border-brand/20">
              <span className="text-xs font-bold text-brand">{user.avatarInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-800 truncate leading-none">{user.name}</p>
              <p className="text-[11px] text-gray-400 capitalize mt-0.5 font-medium">{user.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
          className={`group flex items-center gap-3 w-full px-2 py-2 rounded-xl transition-all duration-150 hover:bg-red-50 ${collapsed ? 'justify-center' : ''}`}
        >
          <div className={`flex items-center justify-center rounded-xl flex-shrink-0 ${collapsed ? 'w-10 h-10' : 'w-8 h-8'}`}>
            <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-600 transition-colors" />
          </div>
          {!collapsed && (
            <span className="text-[13px] font-medium text-gray-500 group-hover:text-red-600 transition-colors">
              Logout
            </span>
          )}
        </button>
      </div>
    </aside>
  )
}
