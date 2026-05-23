import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout() {
  // Desktop: sidebar is collapsed or expanded (64px / 220px)
  // Mobile (<md): sidebar is an overlay drawer, hidden by default
  const [collapsed,    setCollapsed]    = useState(false)
  const [mobileOpen,   setMobileOpen]   = useState(false)
  const location = useLocation()

  // Close mobile drawer on navigation
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  return (
    <div className="flex h-screen" style={{ background: '#F5F7FA' }}>
      {/* ── Mobile backdrop ─────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Content — full-width on mobile, shifted on desktop */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200
          ${collapsed ? 'md:ml-[64px]' : 'md:ml-[220px]'}`}
      >
        <TopBar
          onToggleSidebar={() => {
            // On mobile: toggle overlay drawer; on desktop: collapse/expand
            if (window.innerWidth < 768) setMobileOpen((o) => !o)
            else setCollapsed((c) => !c)
          }}
        />

        <main
          key={location.pathname}
          className="flex-1 overflow-y-auto animate-page"
          style={{ padding: 'clamp(16px, 3vw, 24px) clamp(12px, 3vw, 28px)' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
