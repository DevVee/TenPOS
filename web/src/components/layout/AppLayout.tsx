import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar collapsed={collapsed} />
      {/* ml matches sidebar widths: 68px collapsed, 220px expanded */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${collapsed ? 'ml-[68px]' : 'ml-[220px]'}`}>
        <TopBar onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main key={location.pathname} className="flex-1 overflow-y-auto p-5 lg:p-7 animate-page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
