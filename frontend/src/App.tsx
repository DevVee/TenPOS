import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { startSyncLoop, stopSyncLoop, refreshProductCache, refreshInventoryCache } from './lib/sync'

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

import { AuditLog } from './pages/audit/AuditLog'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <div className="min-h-screen bg-white" />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function POSLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 transition-colors">{children}</div>
}

function SessionRestorer() {
  const { restoreSession } = useAuthStore()
  useEffect(() => { restoreSession() }, [restoreSession])
  return null
}

function SyncBootstrap() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return
    refreshProductCache()
    refreshInventoryCache()
    startSyncLoop()
    return () => stopSyncLoop()
  }, [isAuthenticated])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionRestorer />
      <SyncBootstrap />
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route element={<AuthLayout />}>
          <Route path="/pin" element={<PinLock />} />
        </Route>

        {/* POS Terminal — full screen, no sidebar */}
        <Route path="/pos" element={<RequireAuth><POSLayout><POSTerminal /></POSLayout></RequireAuth>} />
        <Route path="/pos/payment" element={<RequireAuth><div className="min-h-screen bg-gray-50 transition-colors"><Payment /></div></RequireAuth>} />
        <Route path="/pos/receipt/:id" element={<RequireAuth><div className="min-h-screen bg-gray-50 transition-colors p-5"><Receipt /></div></RequireAuth>} />

        {/* Management layout with sidebar */}
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

          <Route path="/audit" element={<AuditLog />} />
        </Route>

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
