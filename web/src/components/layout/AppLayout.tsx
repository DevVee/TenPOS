import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  return (
    <div className="flex h-screen" style={{ background: '#F5F7FA' }}>
      <Sidebar collapsed={collapsed} />

      {/* Sidebar widths: 64px collapsed · 220px expanded */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          collapsed ? 'ml-[64px]' : 'ml-[220px]'
        }`}
      >
        <TopBar onToggleSidebar={() => setCollapsed((c) => !c)} />

        <main
          key={location.pathname}
          className="flex-1 overflow-y-auto animate-page"
          style={{ padding: '24px 28px' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
