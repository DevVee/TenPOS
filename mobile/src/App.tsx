import { useEffect, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from './store/authStore'
import { usePOSStore } from './store/posStore'
import { startSyncLoop, stopSyncLoop, refreshProductCache, refreshInventoryCache, onSyncEvent, getPendingCount, isOnline } from './lib/sync'
import { subscribeTransactions, subscribeStock, subscribeProducts, subscribeCategories, unsubscribeAll } from './lib/realtime'
import { useSettingsStore } from './store/settingsStore'

import { AuthLayout } from './components/layout/AuthLayout'
import { AppLayout } from './components/layout/AppLayout'

import { Login } from './pages/auth/Login'
import { PinLock } from './pages/auth/PinLock'

import { POSTerminal } from './pages/pos/POSTerminal'
import { Payment } from './pages/pos/Payment'
import { Receipt } from './pages/pos/Receipt'
import { ShiftSummary } from './pages/pos/ShiftSummary'

import { Dashboard } from './pages/dashboard/Dashboard'

import { TransactionList } from './pages/transactions/TransactionList'
import { TransactionDetail } from './pages/transactions/TransactionDetail'

import { Returns } from './pages/returns/Returns'

import { InventoryList } from './pages/inventory/InventoryList'
import { ProductForm } from './pages/inventory/ProductForm'
import { ProductDetail } from './pages/inventory/ProductDetail'
import { StockAdjustments } from './pages/inventory/StockAdjustments'
import { LowStock } from './pages/inventory/LowStock'

import { SalesReport } from './pages/reports/SalesReport'
import { StaffReport } from './pages/reports/StaffReport'
import { FinancialReport } from './pages/reports/FinancialReport'
import { InventoryReport } from './pages/reports/InventoryReport'

import { StaffList } from './pages/staff/StaffList'
import { StaffDetail } from './pages/staff/StaffDetail'
import { StaffForm } from './pages/staff/StaffForm'

import { Settings } from './pages/settings/Settings'
import { Branches } from './pages/settings/Branches'
import { Categories } from './pages/settings/Categories'
import { Vouchers } from './pages/settings/Vouchers'
import { SyncLog } from './pages/settings/SyncLog'

import { AuditLog } from './pages/audit/AuditLog'
import { ProfileSettings } from './pages/profile/ProfileSettings'

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

// Wrapper so the ErrorBoundary gets a new key on every pathname change
// This forces it to unmount/remount, clearing any caught error
function BoundedRoutes() {
  const location = useLocation()
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route element={<AuthLayout />}>
          <Route path="/pin" element={<PinLock />} />
        </Route>

        {/* POS Terminal — full screen, no sidebar */}
        <Route path="/pos" element={<RequireAuth><POSLayout><POSTerminal /></POSLayout></RequireAuth>} />
        <Route path="/pos/payment" element={<RequireAuth><div className="min-h-screen bg-gray-50"><Payment /></div></RequireAuth>} />
        <Route path="/pos/receipt/:id" element={<RequireAuth><div className="min-h-screen bg-gray-50 p-5"><Receipt /></div></RequireAuth>} />

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
    </ErrorBoundary>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, pinLocked } = useAuthStore()
  if (isLoading) return <div className="min-h-screen bg-white" />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // PIN lock check — prevent direct URL access to protected pages while locked
  if (pinLocked) return <Navigate to="/pin" replace />
  return <>{children}</>
}

function POSLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>
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

    // Helper to re-evaluate current status (async-safe)
    const updateStatus = () => {
      void isOnline().then((online) => {
        if (!online) { setSyncStatus('offline'); return }
        void getPendingCount().then((n) => {
          setSyncStatus(n > 0 ? 'pending' : 'online')
          setPendingCount(n)
        })
      })
    }

    const handleOnline  = () => { setSyncStatus('syncing'); updateStatus() }
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

    return () => {
      stopSyncLoop()
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      u1(); u2(); u3(); u4(); u5()
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

export default function App() {
  return (
    <BrowserRouter>
      <SessionRestorer />
      <SyncBootstrap />
      <RealtimeBootstrap />
      <AndroidBackHandler />
      <BoundedRoutes />
    </BrowserRouter>
  )
}
