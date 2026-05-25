import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'

export function AppLayout() {
  // Persist collapse state across navigation (ErrorBoundary remounts AppLayout on every route change)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Auto-close the mobile sidebar overlay whenever the user navigates
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const handleToggle = () => {
    // TopBar is only rendered at lg:+, so this always runs on desktop
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem('sidebar-collapsed', String(next)) } catch {}
      return next
    })
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        background: '#F5F7FA',
        // Push content below the status bar on mobile (no-op on desktop)
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* ── Desktop sidebar — shown only on true desktop (≥1024px) ─────────── */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} />
      </div>

      {/* ── Tablet/mobile sidebar — overlay, shown only when mobileOpen ───── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <Sidebar collapsed={false} />
        </div>
      )}

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          collapsed ? 'lg:ml-16' : 'lg:ml-[240px]'
        }`}
      >
        {/* TopBar — desktop only (≥1024px); BottomNav handles tablet/mobile */}
        <div className="hidden lg:block">
          <TopBar onToggleSidebar={handleToggle} />
        </div>

        <main
          key={location.pathname}
          className="flex-1 overflow-y-auto animate-page p-4 lg:px-6 lg:pt-6"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          }}
        >
          <div className="max-w-screen-xl">
            <Outlet />
          </div>
          {/* Spacer so content clears the fixed BottomNav on tablet/mobile */}
          <div className="h-16 lg:hidden" />
        </main>
      </div>

      {/* ── Mobile bottom navigation ──────────────────────────────────────── */}
      <BottomNav />
    </div>
  )
}
