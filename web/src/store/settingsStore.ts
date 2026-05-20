import { create } from 'zustand'

interface Category {
  id: string
  name: string
  icon: string
  active: boolean
}

interface Voucher {
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

interface SettingsState {
  storeName: string
  address: string
  phone: string
  email: string
  website: string
  tin: string
  receiptHeader: string
  receiptFooter: string
  receiptShowLogo: boolean
  receiptShowTax: boolean
  requirePinForDiscount: boolean
  requirePinForVoid: boolean
  autoSyncInterval: number
  currency: string
  currencySymbol: string
  vatRate: number
  vatEnabled: boolean
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  timeFormat: '12h' | '24h'
  timezone: string
  lowStockThreshold: number
  printerEnabled: boolean
  printerWidth: '58mm' | '80mm'
  language: string
  categories: Category[]
  vouchers: Voucher[]
  // Actions
  update: (patch: Partial<Omit<SettingsState, 'update' | 'addCategory' | 'updateCategory' | 'deleteCategory' | 'addVoucher' | 'updateVoucher' | 'deleteVoucher' | 'applyVoucher'>>) => void
  addCategory: (cat: Omit<Category, 'id'>) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  deleteCategory: (id: string) => void
  addVoucher: (v: Omit<Voucher, 'id' | 'usedCount'>) => void
  updateVoucher: (id: string, patch: Partial<Voucher>) => void
  deleteVoucher: (id: string) => void
  applyVoucher: (code: string, orderTotal: number) => { valid: boolean; discount: number; message: string }
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'c1', name: 'Large Schoolbag', icon: 'LS', active: true },
  { id: 'c2', name: 'Medium Schoolbag', icon: 'MS', active: true },
  { id: 'c3', name: 'Super Large Schoolbag', icon: 'SL', active: true },
  { id: 'c4', name: 'Lunch Bag', icon: 'LB', active: true },
]

const DEFAULT_VOUCHERS: Voucher[] = [
  { id: 'v1', code: 'WELCOME10', type: 'percent', value: 10, minOrder: 200, maxUses: 100, usedCount: 12, active: true, expiry: '2024-12-31', description: '10% off for new customers' },
  { id: 'v2', code: 'SAVE50', type: 'fixed', value: 50, minOrder: 500, maxUses: 50, usedCount: 8, active: true, expiry: '2024-06-30', description: '₱50 off orders above ₱500' },
  { id: 'v3', code: 'SUMMER20', type: 'percent', value: 20, minOrder: 1000, maxUses: 30, usedCount: 30, active: false, expiry: '2024-03-31', description: 'Summer sale 20% off' },
]

export const useSettingsStore = create<SettingsState>((set, get) => ({
  storeName: 'Ten Foundation Philippines Inc.',
  address: '123 Katipunan Ave, Quezon City, Metro Manila',
  phone: '+63 2 8123 4567',
  email: 'info@tenfoundation.ph',
  website: 'www.carryhopebags.com',
  tin: '123-456-789-000',
  receiptHeader: 'Ten Foundation Philippines Inc.',
  receiptFooter: 'Thank you for your purchase! God bless you.',
  receiptShowLogo: true,
  receiptShowTax: true,
  requirePinForDiscount: true,
  requirePinForVoid: true,
  autoSyncInterval: 30,
  currency: 'PHP',
  currencySymbol: '₱',
  vatRate: 12,
  vatEnabled: true,
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  timezone: 'Asia/Manila',
  lowStockThreshold: 5,
  printerEnabled: false,
  printerWidth: '80mm',
  language: 'en-PH',
  categories: DEFAULT_CATEGORIES,
  vouchers: DEFAULT_VOUCHERS,

  update: (patch) => set((s) => ({ ...s, ...patch })),

  addCategory: (cat) => set((s) => ({
    categories: [...s.categories, { ...cat, id: `c${Date.now()}` }],
  })),
  updateCategory: (id, patch) => set((s) => ({
    categories: s.categories.map((c) => c.id === id ? { ...c, ...patch } : c),
  })),
  deleteCategory: (id) => set((s) => ({
    categories: s.categories.filter((c) => c.id !== id),
  })),

  addVoucher: (v) => set((s) => ({
    vouchers: [...s.vouchers, { ...v, id: `v${Date.now()}`, usedCount: 0 }],
  })),
  updateVoucher: (id, patch) => set((s) => ({
    vouchers: s.vouchers.map((v) => v.id === id ? { ...v, ...patch } : v),
  })),
  deleteVoucher: (id) => set((s) => ({
    vouchers: s.vouchers.filter((v) => v.id !== id),
  })),

  applyVoucher: (code, orderTotal) => {
    const { vouchers } = get()
    const v = vouchers.find((x) => x.code.toUpperCase() === code.toUpperCase())
    if (!v) return { valid: false, discount: 0, message: 'Invalid voucher code.' }
    if (!v.active) return { valid: false, discount: 0, message: 'This voucher is no longer active.' }
    if (new Date(v.expiry) < new Date()) return { valid: false, discount: 0, message: 'This voucher has expired.' }
    if (v.usedCount >= v.maxUses) return { valid: false, discount: 0, message: 'This voucher has reached its usage limit.' }
    if (orderTotal < v.minOrder) return { valid: false, discount: 0, message: `Minimum order of ₱${v.minOrder.toFixed(2)} required.` }
    const discount = v.type === 'percent' ? orderTotal * (v.value / 100) : v.value
    return { valid: true, discount, message: `${v.description} — ₱${discount.toFixed(2)} off!` }
  },
}))
