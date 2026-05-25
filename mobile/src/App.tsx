import { lazy, Suspense, useEffect, useState, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from './store/authStore'
import { usePOSStore } from './store/posStore'
import { startSyncLoop, stopSyncLoop, refreshProductCache, refreshInventoryCache, onSyncEvent, getPendingCount, isOnline, flushOfflineQueue } from './lib/sync'
import { apiLoadManagerPin } from './lib/api'
import { subscribeTransactions, subscribeStock, subscribeProducts, subscribeCategories, unsubscribeAll } from './lib/realtime'
import { useSettingsStore } from './store/settingsStore'
import { usePrinterStore } from './store/printerStore'
import { connectDevice, checkConnection } from './lib/bluetoothPrint'

// ── Eager: shown on first load — must be instant ──────────────────────────────
import { Login }   from './pages/auth/Login'
import { PinLock } from './pages/auth/PinLock'

// ── Lazy: loaded only when the route is first visited ─────────────────────────
// This slashes the initial JS parse from 1.3 MB down to ~200 kB.
const n = <T extends Record<string, unknown>>(p: Promise<T>, k: keyof T) =>
  p.then((m) => ({ default: m[k] as React.ComponentType }))

const AuthLayout    = lazy(() => n(import('./components/layout/AuthLayout'),   'AuthLayout'))
const AppLayout     = lazy(() => n(import('./components/layout/AppLayout'),    'AppLayout'))

const POSTerminal   = lazy(() => n(import('./pages/pos/POSTerminal'),          'POSTerminal'))
const Payment       = lazy(() => n(import('./pages/pos/Payment'),              'Payment'))
const Receipt       = lazy(() => n(import('./pages/pos/Receipt'),              'Receipt'))
const ShiftSummary  = lazy(() => n(import('./pages/pos/ShiftSummary'),         'ShiftSummary'))

const Dashboard     = lazy(() => n(import('./pages/dashboard/Dashboard'),      'Dashboard'))

const TransactionList   = lazy(() => n(import('./pages/transactions/TransactionList'),   'TransactionList'))
const TransactionDetail = lazy(() => n(import('./pages/transactions/TransactionDetail'), 'TransactionDetail'))

const Returns       = lazy(() => n(import('./pages/returns/Returns'),          'Returns'))

const InventoryList     = lazy(() => n(import('./pages/inventory/InventoryList'),     'InventoryList'))
const ProductForm       = lazy(() => n(import('./pages/inventory/ProductForm'),       'ProductForm'))
const ProductDetail     = lazy(() => n(import('./pages/inventory/ProductDetail'),     'ProductDetail'))
const StockAdjustments  = lazy(() => n(import('./pages/inventory/StockAdjustments'),  'StockAdjustments'))
const LowStock          = lazy(() => n(import('./pages/inventory/LowStock'),          'LowStock'))

const SalesReport     = lazy(() => n(import('./pages/reports/SalesReport'),     'SalesReport'))
const StaffReport     = lazy(() => n(import('./pages/reports/StaffReport'),     'StaffReport'))
const FinancialReport = lazy(() => n(import('./pages/reports/FinancialReport'), 'FinancialReport'))
const InventoryReport = lazy(() => n(import('./pages/reports/InventoryReport'), 'InventoryReport'))

const StaffList   = lazy(() => n(import('./pages/staff/StaffList'),   'StaffList'))
const StaffDetail = lazy(() => n(import('./pages/staff/StaffDetail'), 'StaffDetail'))
const StaffForm   = lazy(() => n(import('./pages/staff/StaffForm'),   'StaffForm'))

const Settings        = lazy(() => n(import('./pages/settings/Settings'),        'Settings'))
const PrinterSettings = lazy(() => n(import('./pages/settings/PrinterSettings'), 'PrinterSettings'))
const Branches        = lazy(() => n(import('./pages/settings/Branches'),        'Branches'))
const Categories      = lazy(() => n(import('./pages/settings/Categories'),      'Categories'))
const Vouchers        = lazy(() => n(import('./pages/settings/Vouchers'),        'Vouchers'))
const SyncLog         = lazy(() => n(import('./pages/settings/SyncLog'),         'SyncLog'))

const AuditLog        = lazy(() => n(import('./pages/audit/AuditLog'),           'AuditLog'))
const ProfileSettings = lazy(() => n(import('./pages/profile/ProfileSettings'),  'ProfileSettings'))

// ── Error boundary resets on every route change via the key prop ──────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e } }
  componentDidCatch(_: Error, info: ErrorInfo) { console.error('[TenPOS]', info.componentStack) }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 bg-brand-pale rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-400 mb-6 font-mono break-all">{(this.state.error as Error).message}</p>
            <button onClick={() => { this.setState({ error: null }); window.location.reload() }} className="btn-primary px-6 py-2.5 mx-auto">
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Page-level loading fallback ───────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-8 h-8 border-[3px] border-red-100 border-t-brand rounded-full animate-spin" />
        <span className="text-xs text-gray-300 font-medium">Loading…</span>
      </div>
    </div>
  )
}

// Wrapper so the ErrorBoundary gets a new key on every pathname change
// This forces it to unmount/remount, clearing any caught error
function BoundedRoutes() {
  const location = useLocation()
  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route element={<AuthLayout />}>
          <Route path="/pin" element={<PinLock />} />
        </Route>

        {/* POS Terminal — full screen, no sidebar */}
        <Route path="/pos" element={<RequireAuth><POSLayout><POSTerminal /></POSLayout></RequireAuth>} />
        <Route path="/pos/payment" element={<RequireAuth><POSLayout><Payment /></POSLayout></RequireAuth>} />
        <Route path="/pos/receipt/:id" element={<RequireAuth><POSLayout><div className="p-4 md:p-5"><Receipt /></div></POSLayout></RequireAuth>} />

        {/* Management pages with sidebar */}
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/pos/shift" element={<ShiftSummary />} />

          <Route path="/transactions" element={<TransactionList />} />
          <Route path="/transactions/:id" element={<TransactionDetail />} />

          <Route path="/returns" element={<Returns />} />

          <Route path="/inventory" element={<InventoryList />} />
          <Route path="/inventory/add" element={<ProductForm />} />
          <Route path="/inventory/edit/:id" element={<ProductForm />} />
          <Route path="/inventory/adjustments" element={<StockAdjustments />} />
          <Route path="/inventory/low-stock" element={<LowStock />} />
          <Route path="/inventory/:id" element={<ProductDetail />} />

          <Route path="/reports/sales" element={<SalesReport />} />
          <Route path="/reports/staff" element={<StaffReport />} />
          <Route path="/reports/financial" element={<FinancialReport />} />
          <Route path="/reports/inventory" element={<InventoryReport />} />

          <Route path="/staff" element={<StaffList />} />
          <Route path="/staff/new" element={<StaffForm />} />
          <Route path="/staff/:id" element={<StaffDetail />} />
          <Route path="/staff/edit/:id" element={<StaffForm />} />

          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/printer" element={<PrinterSettings />} />
          <Route path="/settings/branches" element={<Branches />} />
          <Route path="/settings/categories" element={<Categories />} />
          <Route path="/settings/vouchers" element={<Vouchers />} />
          <Route path="/settings/sync-log" element={<SyncLog />} />

          <Route path="/audit" element={<AuditLog />} />
          <Route path="/profile" element={<ProfileSettings />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, pinLocked } = useAuthStore()
  if (isLoading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-8 h-8 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400 font-medium">Loading…</span>
      </div>
    </div>
  )
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // PIN lock check — prevent direct URL access to protected pages while locked
  if (pinLocked) return <Navigate to="/pin" replace />
  return <>{children}</>
}

function POSLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col bg-gray-50"
      style={{
        minHeight: '100dvh',
        paddingTop:    'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',  // MOBILE-01: notch/gesture nav
      }}
    >
      {children}
    </div>
  )
}

function SessionRestorer() {
  const { restoreSession } = useAuthStore()
  useEffect(() => { restoreSession() }, [restoreSession])
  return null
}

function SyncBootstrap() {
  const isAuthenticated  = useAuthStore((s) => s.isAuthenticated)
  const setSyncStatus    = usePOSStore((s) => s.setSyncStatus)
  const setPendingCount  = usePOSStore((s) => s.setPendingCount)
  const autoSyncInterval = useSettingsStore((s) => s.autoSyncInterval)

  useEffect(() => {
    if (!isAuthenticated) return

    // Initial cache warm-up
    void refreshProductCache()
    void refreshInventoryCache()
    // Load manager PIN hash from DB into localStorage for offline use
    void apiLoadManagerPin()

    // Helper to re-evaluate current status (async-safe)
    const updateStatus = () => {
      void isOnline().then((online) => {
        if (!online) { setSyncStatus('offline'); return }
        void getPendingCount().then((n) => {
          setPendingCount(n)
          if (n > 0) {
            // Auto-flush instead of sitting "pending" forever
            setSyncStatus('syncing')
            void flushOfflineQueue().then(() => {
              void getPendingCount().then((remaining) => {
                setSyncStatus(remaining > 0 ? 'pending' : 'online')
                setPendingCount(remaining)
              })
            })
          } else {
            setSyncStatus('online')
          }
        })
      })
    }

    const handleOnline  = () => { setSyncStatus('syncing'); void flushOfflineQueue().then(updateStatus) }
    const handleOffline = () => setSyncStatus('offline')

    // Web fallback listeners (Capacitor replaces these natively in startSyncLoop)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    const u1 = onSyncEvent('sync:start',     () => setSyncStatus('syncing'))
    const u2 = onSyncEvent('sync:done',      updateStatus)
    const u3 = onSyncEvent('sync:failed',    () => void isOnline().then((online) => setSyncStatus(online ? 'pending' : 'offline')))
    const u4 = onSyncEvent('offline:queued', () => setSyncStatus('pending'))
    const u5 = onSyncEvent('cache:updated',  updateStatus)

    updateStatus()     // set initial status
    startSyncLoop(undefined, autoSyncInterval * 1000)  // interval from settings

    // MOBILE-02: refresh cache when app resumes from background (e.g. after being minimized)
    let resumeListener: { remove: () => Promise<void> } | null = null
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          // App came to foreground — check connectivity and refresh caches
          updateStatus()
          void refreshProductCache()
          void refreshInventoryCache()
        }
      }).then((handle) => { resumeListener = handle })
    }

    return () => {
      stopSyncLoop()
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      u1(); u2(); u3(); u4(); u5()
      void resumeListener?.remove()
    }
  }, [isAuthenticated, setSyncStatus, setPendingCount, autoSyncInterval])

  return null
}

/**
 * RealtimeBootstrap — subscribes to Supabase Realtime channels when online.
 * Each channel event refreshes the Dexie cache AND triggers a UI re-render.
 * This gives the APK true live updates just like the web dashboard.
 */
function RealtimeBootstrap() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return

    // We don't need to do anything on the event callbacks here — the
    // realtime.ts handlers already refresh the Dexie cache and the sync
    // event bus ('cache:updated') wakes up any subscribed components.
    const u1 = subscribeTransactions(() => {/* cache updated in realtime.ts */})
    const u2 = subscribeStock(() => {/* cache updated in realtime.ts */})
    const u3 = subscribeProducts(() => {/* cache updated in realtime.ts */})
    const u4 = subscribeCategories(() => {/* cache updated in realtime.ts */})

    return () => {
      u1(); u2(); u3(); u4()
      unsubscribeAll()
    }
  }, [isAuthenticated])

  return null
}

/**
 * KeyboardScrollFix — on Capacitor native (tablet/phone APK), when the soft
 * keyboard appears and shrinks the visual viewport, scroll the focused input
 * into view so it isn't hidden behind the keyboard.
 * Noop on web (adjustResize via AndroidManifest already handles phones).
 */
function KeyboardScrollFix() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const vv = window.visualViewport
    if (!vv) return
    const handleResize = () => {
      const el = document.activeElement
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      ) {
        // Small delay lets the browser finish resizing before we scroll
        setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60)
      }
    }
    vv.addEventListener('resize', handleResize)
    return () => vv.removeEventListener('resize', handleResize)
  }, [])
  return null
}

/** Android hardware back-button: navigate back, or minimize app if at root */
function AndroidBackHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = CapApp.addListener('backButton', ({ canGoBack }) => {
      // If browser history has a previous entry, go back
      if (canGoBack) {
        navigate(-1)
      } else if (location.pathname === '/pin' || location.pathname === '/login') {
        // At auth screens — minimize app instead of closing
        void CapApp.minimizeApp()
      } else {
        // At a root page — navigate to POS
        navigate('/pos', { replace: true })
      }
    })
    return () => { void listener.then((h) => h.remove()) }
  }, [navigate, location.pathname])

  return null
}

// ── Branded splash screen ─────────────────────────────────────────────────────
// Shows once per session (clears on app kill on Android).
// Overlays everything for 1.5 s then fades out in 400 ms.
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 1500)
    return () => clearTimeout(t1)
  }, [])

  useEffect(() => {
    if (!fading) return
    const t2 = setTimeout(onDone, 400)
    return () => clearTimeout(t2)
  }, [fading, onDone])

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-[400ms]"
      style={{
        background: '#E5484D',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {/* Decorative blobs */}
      <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />

      {/* Logo + wordmark */}
      <div className="relative z-10 flex flex-col items-center space-y-5">
        <div className="w-20 h-20 rounded-2xl bg-white shadow-xl flex items-center justify-center">
          <img
            src="/brand/logo.png"
            alt="TenPOS"
            className="w-14 h-14 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        <div className="text-center">
          <p className="text-white font-black text-3xl tracking-tight leading-none">TenPOS</p>
          <p className="text-white/60 text-xs font-semibold tracking-[0.2em] uppercase mt-2">
            Point of Sale
          </p>
        </div>
      </div>

      {/* Animated dots */}
      <div className="absolute bottom-14 flex items-center space-x-2">
        {[0, 150, 300].map((delay) => (
          <div
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * PrinterBootstrap — auto-reconnects the saved Bluetooth printer on app launch
 * and whenever the app returns to the foreground.
 * Only runs on Capacitor native (Android). No-op on web.
 */
function PrinterBootstrap() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { savedDevice, setStatus } = usePrinterStore()

  const tryReconnect = async () => {
    if (!savedDevice) return
    try {
      const ok = await checkConnection()
      if (ok) {
        setStatus('connected')
        return
      }
      setStatus('connecting')
      const result = await connectDevice(savedDevice.address)
      setStatus(result.isConnected || result.code === 0 ? 'connected' : 'idle')
    } catch {
      setStatus('idle')
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !Capacitor.isNativePlatform() || !savedDevice) return

    // Try to connect on mount (app launch / login)
    void tryReconnect()

    // Re-connect whenever the app comes back to foreground
    let listener: { remove: () => Promise<void> } | null = null
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void tryReconnect()
    }).then((h) => { listener = h })

    return () => { void listener?.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, savedDevice?.address])

  return null
}

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    try { return !sessionStorage.getItem('tenpos-splash-shown') } catch { return true }
  })

  const handleSplashDone = () => {
    try { sessionStorage.setItem('tenpos-splash-shown', '1') } catch {}
    setShowSplash(false)
  }

  return (
    <>
      {showSplash && <SplashScreen onDone={handleSplashDone} />}
      <BrowserRouter>
        <SessionRestorer />
        <SyncBootstrap />
        <RealtimeBootstrap />
        <PrinterBootstrap />
        <KeyboardScrollFix />
        <AndroidBackHandler />
        <BoundedRoutes />
      </BrowserRouter>
    </>
  )
}
