import { Menu, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'

interface TopBarProps {
  onToggleSidebar: () => void
  title?: string
}

export function TopBar({ onToggleSidebar, title }: TopBarProps) {
  const { syncStatus } = usePOSStore()
  const { user } = useAuthStore()

  return (
    <header className="h-16 bg-white border-b border-gray-100 shadow-sm flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
        >
          <Menu className="w-5 h-5" />
        </button>
        {title && <h2 className="text-base font-bold text-gray-900 hidden sm:block tracking-tight">{title}</h2>}
      </div>

      <div className="flex items-center gap-3">
        {/* Sync status pill */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
          syncStatus === 'online'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : syncStatus === 'offline'
            ? 'bg-red-50 text-red-700 border-red-100'
            : 'bg-amber-50 text-amber-700 border-amber-100'
        }`}>
          {syncStatus === 'online'  && <Wifi className="w-3.5 h-3.5" />}
          {syncStatus === 'offline' && <WifiOff className="w-3.5 h-3.5" />}
          {syncStatus === 'syncing' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span className="capitalize hidden sm:inline">{syncStatus}</span>
        </div>

        {/* User avatar — click → Profile Settings */}
        {user && (
          <Link to="/profile" className="flex items-center gap-2.5 group" title="Profile Settings">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900 leading-none">{user.name}</p>
              <p className="text-xs text-gray-400 capitalize leading-none mt-0.5 font-medium group-hover:text-brand transition-colors">{user.role}</p>
            </div>
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-brand/20 hover:border-brand/50 hover:shadow-sm transition-all flex items-center justify-center bg-gradient-to-br from-brand-pale to-red-100">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                : <span className="text-sm font-bold text-brand">{user.avatarInitials}</span>
              }
            </div>
          </Link>
        )}
      </div>
    </header>
  )
}
