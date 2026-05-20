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
}

export interface ProductVariant {
  id: string
  label: string
  value: string
  priceAdjustment: number
  stock: number
}

export interface CartItem {
  product: Product
  quantity: number
  variant?: ProductVariant
  discount: number
  note?: string
}

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
  status: 'completed' | 'voided' | 'refunded'
  syncStatus: 'synced' | 'pending' | 'failed'
}

export interface Payment {
  method: 'cash' | 'gcash' | 'paymaya' | 'card'
  amount: number
  reference?: string
}

export interface StockAdjustment {
  id: string
  product: string
  type: 'add' | 'remove' | 'recount'
  quantity: number
  reason: string
  by: string
  date: string
}

export interface AuditEntry {
  id: string
  action: string
  user: string
  details: string
  ip: string
  timestamp: string
  severity: 'info' | 'warning' | 'critical'
}

export interface Branch {
  id: string
  name: string
  address: string
  managerName: string
  active: boolean
  terminalCount: number
}

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
