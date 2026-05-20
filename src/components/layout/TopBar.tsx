import { Menu, Wifi, WifiOff, RefreshCw } from 'lucide-react'
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
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="w-10 h-10 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors flex items-center justify-center"
        >
          <Menu className="w-5 h-5" />
        </button>
        {title && <h2 className="text-sm font-bold text-gray-800 hidden sm:block">{title}</h2>}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Sync status */}
        <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${
          syncStatus === 'online'
            ? 'bg-green-50 text-green-700'
            : syncStatus === 'offline'
            ? 'bg-red-50 text-brand'
            : 'bg-yellow-50 text-yellow-700'
        }`}>
          {syncStatus === 'online' && <Wifi className="w-3.5 h-3.5" />}
          {syncStatus === 'offline' && <WifiOff className="w-3.5 h-3.5" />}
          {syncStatus === 'syncing' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span className="capitalize hidden sm:inline">{syncStatus}</span>
        </div>

        {/* Avatar */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-800 leading-none">{user.name}</p>
              <p className="text-xs text-gray-500 capitalize leading-none mt-0.5">{user.role}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-brand-pale flex items-center justify-center cursor-pointer border-2 border-brand/20">
              <span className="text-sm font-black text-brand">{user.avatarInitials}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
