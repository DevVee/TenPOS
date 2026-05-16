import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, BarChart2,
  Users, Settings, ClipboardList, ArrowLeftRight,
  AlertTriangle, LogOut, ChevronDown,
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
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'viewer'] },
  { label: 'POS Terminal', to: '/pos', icon: ShoppingCart, roles: ['admin', 'manager', 'cashier'] },
  { label: 'Transactions', to: '/transactions', icon: ClipboardList, roles: ['admin', 'manager', 'viewer'] },
  { label: 'Returns & Voids', to: '/returns', icon: ArrowLeftRight, roles: ['admin', 'manager'] },
  {
    label: 'Inventory', to: '/inventory', icon: Package, roles: ['admin', 'manager'],
    children: [
      { label: 'Products', to: '/inventory' },
      { label: 'Stock Adjustments', to: '/inventory/adjustments' },
      { label: 'Low Stock', to: '/inventory/low-stock' },
    ],
  },
  {
    label: 'Reports', to: '/reports/sales', icon: BarChart2, roles: ['admin', 'manager', 'viewer'],
    children: [
      { label: 'Sales', to: '/reports/sales' },
      { label: 'Staff Performance', to: '/reports/staff' },
      { label: 'Financial / Z-Report', to: '/reports/financial' },
      { label: 'Inventory Report', to: '/reports/inventory' },
    ],
  },
  { label: 'Staff', to: '/staff', icon: Users, roles: ['admin'] },
  {
    label: 'Settings', to: '/settings', icon: Settings, roles: ['admin'],
    children: [
      { label: 'General', to: '/settings' },
      { label: 'Branches', to: '/settings/branches' },
      { label: 'Categories', to: '/settings/categories' },
      { label: 'Vouchers', to: '/settings/vouchers' },
    ],
  },
  { label: 'Audit Log', to: '/audit', icon: AlertTriangle, roles: ['admin'] },
]

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [openMenus, setOpenMenus] = useState<string[]>(['Inventory', 'Reports', 'Settings'])

  const visible = NAV.filter((n) => user && n.roles.includes(user.role))

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <aside className={`fixed top-0 left-0 h-screen bg-white border-r border-gray-100 flex flex-col z-30 transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 h-16 border-b border-gray-100 flex-shrink-0">
        <div className="w-9 h-9 bg-brand rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
          <span className="text-white font-black text-base">T</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <img
              src="https://carryhopebags.com/cdn/shop/files/Ten_Foundations_TEN_-_Red.png?v=1751749937&width=200"
              alt="TEN"
              className="h-5 object-contain object-left"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            <p className="text-[10px] text-gray-400 font-medium leading-tight mt-0.5">Point of Sale</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {visible.map((item) => {
          const Icon = item.icon
          const hasChildren = item.children && !collapsed
          const isOpen = openMenus.includes(item.label)

          if (hasChildren) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
                  className="sidebar-link w-full justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                  {!collapsed && (
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  )}
                </button>
                {isOpen && !collapsed && (
                  <div className="ml-7 mt-0.5 space-y-0.5">
                    {item.children!.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        end={child.to === '/inventory' || child.to === '/settings'}
                        className={({ isActive }) =>
                          `block px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'text-brand font-medium bg-brand-pale'
                              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                          }`
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-2 py-3 border-t border-gray-100 flex-shrink-0">
        {!collapsed && user && (
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-brand-pale flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-brand">{user.avatarInitials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{user.name}</p>
              <p className="text-[10px] text-gray-400 capitalize">{user.role}</p>
            </div>
          </div>
        )}
        <button onClick={handleLogout} className="sidebar-link text-gray-500 hover:text-red-600" title={collapsed ? 'Logout' : undefined}>
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
