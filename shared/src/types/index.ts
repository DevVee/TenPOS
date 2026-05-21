// ============================================================
// @tenpos/shared — Core Business Types
// Used by both web (React) and mobile (React Native)
// ============================================================

// ─── Auth / Users ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'cashier' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatarInitials: string
  branch: string
  branch_id: string | null
}

// ─── Products ────────────────────────────────────────────────────────────────

export interface ProductVariant {
  id: string
  label: string
  value: string
  priceAdjustment: number
  stock: number
}

export interface Product {
  id: string
  name: string
  sku: string
  barcode: string
  category: string
  price: number
  cost: number
  stock: number
  reorderPoint: number
  imageUrl?: string
  variants?: ProductVariant[]
  // Extended optional fields
  description?: string
  brand?: string
  material?: string
  color?: string
  weightGrams?: number
  lengthCm?: number
  widthCm?: number
  heightCm?: number
  tags?: string[]
  notes?: string
}

// ─── Cart & POS ───────────────────────────────────────────────────────────────

export interface CartItem {
  product: Product
  quantity: number
  variant?: ProductVariant
  discount: number
  note?: string
}

export type PaymentMethod = 'cash' | 'gcash' | 'paymaya' | 'card'

export interface Payment {
  method: PaymentMethod
  amount: number
  reference?: string
}

export type TransactionStatus = 'completed' | 'voided' | 'refunded'
export type SyncStatus = 'synced' | 'pending' | 'failed'
export type POSSyncStatus = 'online' | 'offline' | 'syncing' | 'pending'

export interface Transaction {
  id: string
  receiptNo: string
  date: string
  cashier: string
  items: CartItem[]
  subtotal: number
  discount: number
  tax: number
  total: number
  payment: Payment[]
  change: number
  status: TransactionStatus
  syncStatus: SyncStatus
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface StockAdjustment {
  id: string
  product: string
  type: 'add' | 'remove' | 'recount'
  quantity: number
  reason: string
  by: string
  date: string
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: string
  name: string
  email: string
  role: UserRole
  branch: string
  status: 'active' | 'inactive'
  lastLogin: string
  salesCount: number
}

// ─── Branch ───────────────────────────────────────────────────────────────────

export interface Branch {
  id: string
  name: string
  address: string
  managerName: string
  active: boolean
  terminalCount: number
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  action: string
  user: string
  details: string
  ip: string
  timestamp: string
  severity: 'info' | 'warning' | 'critical'
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  icon: string
  active: boolean
}

export interface Voucher {
  id: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  minOrder: number
  maxUses: number
  usedCount: number
  active: boolean
  expiry: string
  description: string
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export type SyncLogEntryType = 'transaction' | 'cache' | 'failed'

export interface SyncLogEntry {
  id: string
  timestamp: number
  type: SyncLogEntryType
  detail: string
  count?: number
}
