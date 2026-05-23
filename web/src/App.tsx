import { lazy, Suspense, useEffect, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import type { UserRole } from './types'

import { AppLayout }  from './components/layout/AppLayout'

// ── Lazy page imports — each page becomes its own JS chunk ────────────────────
// Pattern: lazy(() => import('...').then(m => ({ default: m.ExportName })))

const Login           = lazy(() => import('./pages/auth/Login')                    .then(m => ({ default: m.Login })))

const POSTerminal     = lazy(() => import('./pages/pos/POSTerminal')               .then(m => ({ default: m.POSTerminal })))
const Payment         = lazy(() => import('./pages/pos/Payment')                   .then(m => ({ default: m.Payment })))
const Receipt         = lazy(() => import('./pages/pos/Receipt')                   .then(m => ({ default: m.Receipt })))
const ShiftSummary    = lazy(() => import('./pages/pos/ShiftSummary')               .then(m => ({ default: m.ShiftSummary })))

const Dashboard       = lazy(() => import('./pages/dashboard/Dashboard')           .then(m => ({ default: m.Dashboard })))

const TransactionList   = lazy(() => import('./pages/transactions/TransactionList')  .then(m => ({ default: m.TransactionList })))
const TransactionDetail = lazy(() => import('./pages/transactions/TransactionDetail').then(m => ({ default: m.TransactionDetail })))

const Returns           = lazy(() => import('./pages/returns/Returns')               .then(m => ({ default: m.Returns })))

const InventoryList     = lazy(() => import('./pages/inventory/InventoryList')       .then(m => ({ default: m.InventoryList })))
const ProductForm       = lazy(() => import('./pages/inventory/ProductForm')         .then(m => ({ default: m.ProductForm })))
const ProductDetail     = lazy(() => import('./pages/inventory/ProductDetail')       .then(m => ({ default: m.ProductDetail })))
const StockAdjustments  = lazy(() => import('./pages/inventory/StockAdjustments')   .then(m => ({ default: m.StockAdjustments })))
const LowStock          = lazy(() => import('./pages/inventory/LowStock')            .then(m => ({ default: m.LowStock })))

const SalesReport       = lazy(() => import('./pages/reports/SalesReport')           .then(m => ({ default: m.SalesReport })))
const StaffReport       = lazy(() => import('./pages/reports/StaffReport')           .then(m => ({ default: m.StaffReport })))
const FinancialReport   = lazy(() => import('./pages/reports/FinancialReport')       .then(m => ({ default: m.FinancialReport })))
const InventoryReport   = lazy(() => import('./pages/reports/InventoryReport')       .then(m => ({ default: m.InventoryReport })))

const StaffList         = lazy(() => import('./pages/staff/StaffList')               .then(m => ({ default: m.StaffList })))
const StaffDetail       = lazy(() => import('./pages/staff/StaffDetail')             .then(m => ({ default: m.StaffDetail })))
const StaffForm         = lazy(() => import('./pages/staff/StaffForm')               .then(m => ({ default: m.StaffForm })))

const Settings          = lazy(() => import('./pages/settings/Settings')             .then(m => ({ default: m.Settings })))
const Branches          = lazy(() => import('./pages/settings/Branches')             .then(m => ({ default: m.Branches })))
const Categories        = lazy(() => import('./pages/settings/Categories')           .then(m => ({ default: m.Categories })))
const Vouchers          = lazy(() => import('./pages/settings/Vouchers')             .then(m => ({ default: m.Vouchers })))
const SyncLog           = lazy(() => import('./pages/settings/SyncLog')              .then(m => ({ default: m.SyncLog })))

const AuditLog          = lazy(() => import('./pages/audit/AuditLog')                .then(m => ({ default: m.AuditLog })))
const ProfileSettings   = lazy(() => import('./pages/profile/ProfileSettings')      .then(m => ({ default: m.ProfileSettings })))

// ── Page loader shown while a lazy chunk is downloading ───────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400 font-medium">Loading…</span>
      </div>
    </div>
  )
}

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-400 mb-6 font-mono break-all">
              {(this.state.error as Error).message}
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload() }}
              className="btn-primary px-6 py-2.5 mx-auto"
            >
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
function BoundedRoutes() {
  const location = useLocation()
  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<Login />} />

          {/* POS Terminal — full screen, no sidebar */}
          <Route path="/pos"                  element={<RequireAuth><POSLayout><POSTerminal /></POSLayout></RequireAuth>} />
          <Route path="/pos/payment"          element={<RequireAuth><div className="min-h-screen bg-gray-50"><Payment /></div></RequireAuth>} />
          <Route path="/pos/receipt/:id"      element={<RequireAuth><div className="min-h-screen bg-gray-50 p-5"><Receipt /></div></RequireAuth>} />
          <Route path="/pos/shift-summary"    element={<RequireAuth><POSLayout><ShiftSummary /></POSLayout></RequireAuth>} />

          {/* Management pages with sidebar */}
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            {/* All authenticated staff can view the dashboard */}
            <Route path="/dashboard"        element={<Dashboard />} />

            {/* Transactions — all staff (cashiers see their own via RLS) */}
            <Route path="/transactions"     element={<TransactionList />} />
            <Route path="/transactions/:id" element={<TransactionDetail />} />

            {/* Returns & voids — managers and admins only */}
            <Route path="/returns" element={
              <RequireRole roles={['admin', 'manager']}>
                <Returns />
              </RequireRole>
            } />

            {/* Inventory — managers and admins can write; viewers can read */}
            <Route path="/inventory"             element={<InventoryList />} />
            <Route path="/inventory/low-stock"   element={<LowStock />} />
            <Route path="/inventory/:id"         element={<ProductDetail />} />
            <Route path="/inventory/add"         element={
              <RequireRole roles={['admin', 'manager']}>
                <ProductForm />
              </RequireRole>
            } />
            <Route path="/inventory/edit/:id"    element={
              <RequireRole roles={['admin', 'manager']}>
                <ProductForm />
              </RequireRole>
            } />
            <Route path="/inventory/adjustments" element={
              <RequireRole roles={['admin', 'manager']}>
                <StockAdjustments />
              </RequireRole>
            } />

            {/* Reports — managers, admins, and viewers */}
            <Route path="/reports/sales"      element={
              <RequireRole roles={['admin', 'manager', 'viewer']}>
                <SalesReport />
              </RequireRole>
            } />
            <Route path="/reports/staff"      element={
              <RequireRole roles={['admin', 'manager', 'viewer']}>
                <StaffReport />
              </RequireRole>
            } />
            <Route path="/reports/financial"  element={
              <RequireRole roles={['admin', 'manager', 'viewer']}>
                <FinancialReport />
              </RequireRole>
            } />
            <Route path="/reports/inventory"  element={
              <RequireRole roles={['admin', 'manager', 'viewer']}>
                <InventoryReport />
              </RequireRole>
            } />

            {/* Staff management — managers and admins only */}
            <Route path="/staff"          element={
              <RequireRole roles={['admin', 'manager']}>
                <StaffList />
              </RequireRole>
            } />
            <Route path="/staff/new"      element={
              <RequireRole roles={['admin', 'manager']}>
                <StaffForm />
              </RequireRole>
            } />
            <Route path="/staff/:id"      element={
              <RequireRole roles={['admin', 'manager']}>
                <StaffDetail />
              </RequireRole>
            } />
            <Route path="/staff/edit/:id" element={
              <RequireRole roles={['admin', 'manager']}>
                <StaffForm />
              </RequireRole>
            } />

            {/* Settings — managers and admins */}
            <Route path="/settings"           element={
              <RequireRole roles={['admin', 'manager']}>
                <Settings />
              </RequireRole>
            } />
            <Route path="/settings/categories" element={
              <RequireRole roles={['admin', 'manager']}>
                <Categories />
              </RequireRole>
            } />
            <Route path="/settings/vouchers"  element={
              <RequireRole roles={['admin', 'manager']}>
                <Vouchers />
              </RequireRole>
            } />
            <Route path="/settings/sync-log"  element={
              <RequireRole roles={['admin', 'manager']}>
                <SyncLog />
              </RequireRole>
            } />
            {/* Branches — admins only */}
            <Route path="/settings/branches"  element={
              <RequireRole roles={['admin']}>
                <Branches />
              </RequireRole>
            } />

            {/* Audit log — managers and admins */}
            <Route path="/audit" element={
              <RequireRole roles={['admin', 'manager']}>
                <AuditLog />
              </RequireRole>
            } />

            {/* Profile — all authenticated staff */}
            <Route path="/profile" element={<ProfileSettings />} />
          </Route>

          <Route path="/"  element={<Navigate to="/login" replace />} />
          <Route path="*"  element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400 font-medium">Loading…</span>
      </div>
    </div>
  )
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * Role-based guard. Redirects cashiers to /pos and viewers/unknown roles to
 * /dashboard when they try to access pages they are not allowed to see.
 */
function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role as UserRole)) {
    return <Navigate to={user.role === 'cashier' ? '/pos' : '/dashboard'} replace />
  }
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

export default function App() {
  return (
    <BrowserRouter>
      <SessionRestorer />
      <BoundedRoutes />
    </BrowserRouter>
  )
}
