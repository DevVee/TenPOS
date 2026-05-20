// Local-first data store — no backend required. All data persisted in localStorage.

import { v4 as uuid } from 'uuid'

// ─── Internal types ───────────────────────────────────────────────────────────

interface LocalCategory { id: string; name: string; description: string }

interface LocalProduct {
  id: string; sku: string; barcode?: string; name: string
  category_id: string; category_name: string; price: number; cost: number
  image_url?: string; active: boolean
  variants: { id: string; label: string; value: string; price_adjustment: number }[]
  created_at: string; updated_at: string
}

interface LocalInventory {
  id: string; product_id: string; product_name: string; sku: string
  category_name: string; price: number; cost: number
  branch_id: string; branch_name: string; variant_id?: string
  stock: number; reorder_point: number; active: boolean
}

interface LocalTxItem {
  id: string; product_id: string; product_name: string; sku: string
  variant_id?: string; quantity: number; unit_price: number; discount: number
  total: number; note?: string
}

interface LocalTransaction {
  id: string; receipt_no: string; branch_id: string; branch_name: string
  staff_id: string; staff_name: string; items: LocalTxItem[]
  payments: { method: string; amount: number; reference?: string }[]
  subtotal: number; discount: number; tax: number; total: number; change: number
  payment_method: string; status: 'completed' | 'voided' | 'returned'
  created_at: string; voided_at?: string; void_reason?: string
}

interface LocalUser {
  id: string; name: string; username: string; email: string; password: string; pin: string
  role: 'admin' | 'manager' | 'cashier' | 'viewer'
  branch_id: string | null; branch_name: string
  status: 'active' | 'inactive'; sales_count: number
  last_login?: string; created_at: string
}

interface LocalBranch {
  id: string; name: string; address: string; manager_name: string
  active: boolean; terminal_count: number
}

interface LocalVoucher {
  id: string; code: string; discount_type: 'percent' | 'fixed'
  discount_value: number; min_purchase: number; max_uses: number
  used_count: number; active: boolean; expires_at?: string; created_at: string
}

interface LocalAdjustment {
  id: string; product_id: string; product_name: string
  type: 'in' | 'out' | 'correction' | 'damage' | 'return'
  quantity: number; reason: string; by: string; branch_id: string; created_at: string
}

interface LocalAuditEntry {
  id: string; action: string; user: string; details: string
  ip: string; timestamp: string; severity: 'info' | 'warning' | 'critical'
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const K = {
  categories:   'tenpos_categories',
  products:     'tenpos_products',
  inventory:    'tenpos_inventory',
  transactions: 'tenpos_transactions',
  users:        'tenpos_users',
  branches:     'tenpos_branches',
  vouchers:     'tenpos_vouchers',
  adjustments:  'tenpos_adjustments',
  audit:        'tenpos_audit',
  currentUser:  'tenpos_current_user',
  receiptSeq:   'tenpos_receipt_seq',
  seeded:       'tenpos_seeded_v6',
}

function ls<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] } catch { return [] }
}
function lsGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T } catch { return null }
}
function lsSet(key: string, val: unknown) { localStorage.setItem(key, JSON.stringify(val)) }
function delay() { return new Promise<void>((r) => setTimeout(r, 0)) }

function nextReceiptNo(): string {
  const n = parseInt(localStorage.getItem(K.receiptSeq) ?? '1000', 10) + 1
  localStorage.setItem(K.receiptSeq, String(n))
  return `TEN-${String(n).padStart(5, '0')}`
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function addAudit(action: string, user: string, details: string, severity: LocalAuditEntry['severity'] = 'info') {
  const entries = ls<LocalAuditEntry>(K.audit)
  entries.unshift({ id: uuid(), action, user, details, ip: '127.0.0.1', timestamp: new Date().toISOString(), severity })
  lsSet(K.audit, entries.slice(0, 200))
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

function seed() {
  if (localStorage.getItem(K.seeded)) return

  const IMG = '/products/'

  const cats: LocalCategory[] = [
    { id: 'cat-1', name: 'Large Schoolbag',  description: 'Pagasa series large schoolbags' },
    { id: 'cat-2', name: 'Medium Schoolbag', description: 'Malakas series medium schoolbags' },
  ]

  const prods: LocalProduct[] = [
    { id: 'p-01', sku: 'PAG-L-BUT', barcode: '4880001', name: 'Pagasa Large Butterfly',          category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}butterfly-large.png`,  active: true, variants: [], created_at: daysAgo(60), updated_at: daysAgo(5) },
    { id: 'p-02', sku: 'PAG-L-HRT', barcode: '4880002', name: 'Pagasa Large Hearts',             category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}hearts-large.png`,    active: true, variants: [], created_at: daysAgo(60), updated_at: daysAgo(5) },
    { id: 'p-03', sku: 'PAG-L-BLS', barcode: '4880003', name: 'Pagasa Large Balls',              category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}balls-large.png`,     active: true, variants: [], created_at: daysAgo(55), updated_at: daysAgo(3) },
    { id: 'p-04', sku: 'PAG-L-CMO', barcode: '4880004', name: 'Pagasa Large Camo',               category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}camo-large.png`,      active: true, variants: [], created_at: daysAgo(52), updated_at: daysAgo(2) },
    { id: 'p-05', sku: 'PAG-L-TRI', barcode: '4880005', name: 'Pagasa Large Coloured Triangles', category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}triangles-large.png`, active: true, variants: [], created_at: daysAgo(50), updated_at: daysAgo(4) },
    { id: 'p-06', sku: 'MAL-M-DIN', barcode: '4880006', name: 'Malakas Medium Dinosaur',         category_id: 'cat-2', category_name: 'Medium Schoolbag', price: 750, cost: 380, image_url: `${IMG}dino-medium.png`,     active: true, variants: [], created_at: daysAgo(58), updated_at: daysAgo(2) },
    { id: 'p-07', sku: 'MAL-M-DAL', barcode: '4880007', name: 'Malakas Medium Dalmatian',        category_id: 'cat-2', category_name: 'Medium Schoolbag', price: 750, cost: 380, image_url: `${IMG}dalmatian-medium.png`,active: true, variants: [], created_at: daysAgo(55), updated_at: daysAgo(3) },
    { id: 'p-08', sku: 'MAL-M-RED', barcode: '4880008', name: 'Malakas Medium Firecracker Red',  category_id: 'cat-2', category_name: 'Medium Schoolbag', price: 750, cost: 380, image_url: `${IMG}red-medium.png`,      active: true, variants: [], created_at: daysAgo(50), updated_at: daysAgo(1) },
    { id: 'p-09', sku: 'MAL-M-LIM', barcode: '4880009', name: 'Malakas Medium Lime',             category_id: 'cat-2', category_name: 'Medium Schoolbag', price: 750, cost: 380, image_url: `${IMG}lime-medium.png`,     active: true, variants: [], created_at: daysAgo(48), updated_at: daysAgo(1) },
    { id: 'p-10', sku: 'MAL-M-MUS', barcode: '4880010', name: 'Malakas Medium Mustard',          category_id: 'cat-2', category_name: 'Medium Schoolbag', price: 750, cost: 380, image_url: `${IMG}mustard-medium.png`,  active: true, variants: [], created_at: daysAgo(45), updated_at: daysAgo(3) },
    { id: 'p-11', sku: 'PAG-L-BLK', barcode: '4880011', name: 'Pagasa Large Black',              category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}black-large.png`,     active: true, variants: [], created_at: daysAgo(40), updated_at: daysAgo(2) },
    { id: 'p-12', sku: 'PAG-L-BWW', barcode: '4880012', name: 'Pagasa Large B&W Weave',          category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}bw-weave-large.png`,  active: true, variants: [], created_at: daysAgo(38), updated_at: daysAgo(1) },
    { id: 'p-13', sku: 'PAG-L-UNI', barcode: '4880013', name: 'Pagasa Large Black Unicorn',      category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}unicorn-large.png`,   active: true, variants: [], created_at: daysAgo(35), updated_at: daysAgo(1) },
    { id: 'p-14', sku: 'PAG-L-BCM', barcode: '4880014', name: 'Pagasa Large Blue Camo',          category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}blue-camo-large.png`, active: true, variants: [], created_at: daysAgo(33), updated_at: daysAgo(2) },
    { id: 'p-15', sku: 'PAG-L-CAR', barcode: '4880015', name: 'Pagasa Large Carnival',           category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}carnival-large.png`,  active: true, variants: [], created_at: daysAgo(30), updated_at: daysAgo(3) },
    { id: 'p-16', sku: 'PAG-L-CSQ', barcode: '4880016', name: 'Pagasa Large Coloured Squares',   category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}squares-large.png`,   active: true, variants: [], created_at: daysAgo(28), updated_at: daysAgo(1) },
    { id: 'p-17', sku: 'PAG-L-CLV', barcode: '4880017', name: 'Pagasa Large Colourful Leaves',   category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}leaves-large.png`,    active: true, variants: [], created_at: daysAgo(25), updated_at: daysAgo(2) },
    { id: 'p-18', sku: 'PAG-L-DAL', barcode: '4880018', name: 'Pagasa Large Dalmatian',          category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}dalmatian-large.png`, active: true, variants: [], created_at: daysAgo(22), updated_at: daysAgo(1) },
    { id: 'p-19', sku: 'PAG-L-DDG', barcode: '4880019', name: 'Pagasa Large Doodles on Grey',    category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}doodles-large.png`,   active: true, variants: [], created_at: daysAgo(20), updated_at: daysAgo(1) },
    { id: 'p-20', sku: 'PAG-L-BRD', barcode: '4880020', name: 'Pagasa Large Blue and Red',       category_id: 'cat-1', category_name: 'Large Schoolbag',  price: 850, cost: 450, image_url: `${IMG}blue-red-large.png`,  active: true, variants: [], created_at: daysAgo(18), updated_at: daysAgo(1) },
  ]

  const inv: LocalInventory[] = [
    { id: 'p-01_base_br-1', product_id: 'p-01', product_name: 'Pagasa Large Butterfly',          sku: 'PAG-L-BUT', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 24, reorder_point: 5, active: true },
    { id: 'p-02_base_br-1', product_id: 'p-02', product_name: 'Pagasa Large Hearts',             sku: 'PAG-L-HRT', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 17, reorder_point: 5, active: true },
    { id: 'p-03_base_br-1', product_id: 'p-03', product_name: 'Pagasa Large Balls',              sku: 'PAG-L-BLS', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 11, reorder_point: 5, active: true },
    { id: 'p-04_base_br-1', product_id: 'p-04', product_name: 'Pagasa Large Camo',               sku: 'PAG-L-CMO', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 3,  reorder_point: 5, active: true },
    { id: 'p-05_base_br-1', product_id: 'p-05', product_name: 'Pagasa Large Coloured Triangles', sku: 'PAG-L-TRI', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 19, reorder_point: 5, active: true },
    { id: 'p-06_base_br-1', product_id: 'p-06', product_name: 'Malakas Medium Dinosaur',         sku: 'MAL-M-DIN', category_name: 'Medium Schoolbag', price: 750, cost: 380, branch_id: 'br-1', branch_name: 'Main Branch', stock: 28, reorder_point: 5, active: true },
    { id: 'p-07_base_br-1', product_id: 'p-07', product_name: 'Malakas Medium Dalmatian',        sku: 'MAL-M-DAL', category_name: 'Medium Schoolbag', price: 750, cost: 380, branch_id: 'br-1', branch_name: 'Main Branch', stock: 21, reorder_point: 5, active: true },
    { id: 'p-08_base_br-1', product_id: 'p-08', product_name: 'Malakas Medium Firecracker Red',  sku: 'MAL-M-RED', category_name: 'Medium Schoolbag', price: 750, cost: 380, branch_id: 'br-1', branch_name: 'Main Branch', stock: 2,  reorder_point: 5, active: true },
    { id: 'p-09_base_br-1', product_id: 'p-09', product_name: 'Malakas Medium Lime',             sku: 'MAL-M-LIM', category_name: 'Medium Schoolbag', price: 750, cost: 380, branch_id: 'br-1', branch_name: 'Main Branch', stock: 14, reorder_point: 5, active: true },
    { id: 'p-10_base_br-1', product_id: 'p-10', product_name: 'Malakas Medium Mustard',          sku: 'MAL-M-MUS', category_name: 'Medium Schoolbag', price: 750, cost: 380, branch_id: 'br-1', branch_name: 'Main Branch', stock: 0,  reorder_point: 5, active: true },
    { id: 'p-11_base_br-1', product_id: 'p-11', product_name: 'Pagasa Large Black',              sku: 'PAG-L-BLK', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 15, reorder_point: 5, active: true },
    { id: 'p-12_base_br-1', product_id: 'p-12', product_name: 'Pagasa Large B&W Weave',          sku: 'PAG-L-BWW', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 8,  reorder_point: 5, active: true },
    { id: 'p-13_base_br-1', product_id: 'p-13', product_name: 'Pagasa Large Black Unicorn',      sku: 'PAG-L-UNI', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 12, reorder_point: 5, active: true },
    { id: 'p-14_base_br-1', product_id: 'p-14', product_name: 'Pagasa Large Blue Camo',          sku: 'PAG-L-BCM', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 6,  reorder_point: 5, active: true },
    { id: 'p-15_base_br-1', product_id: 'p-15', product_name: 'Pagasa Large Carnival',           sku: 'PAG-L-CAR', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 9,  reorder_point: 5, active: true },
    { id: 'p-16_base_br-1', product_id: 'p-16', product_name: 'Pagasa Large Coloured Squares',   sku: 'PAG-L-CSQ', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 4,  reorder_point: 5, active: true },
    { id: 'p-17_base_br-1', product_id: 'p-17', product_name: 'Pagasa Large Colourful Leaves',   sku: 'PAG-L-CLV', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 11, reorder_point: 5, active: true },
    { id: 'p-18_base_br-1', product_id: 'p-18', product_name: 'Pagasa Large Dalmatian',          sku: 'PAG-L-DAL', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 7,  reorder_point: 5, active: true },
    { id: 'p-19_base_br-1', product_id: 'p-19', product_name: 'Pagasa Large Doodles on Grey',    sku: 'PAG-L-DDG', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 5,  reorder_point: 5, active: true },
    { id: 'p-20_base_br-1', product_id: 'p-20', product_name: 'Pagasa Large Blue and Red',       sku: 'PAG-L-BRD', category_name: 'Large Schoolbag',  price: 850, cost: 450, branch_id: 'br-1', branch_name: 'Main Branch', stock: 13, reorder_point: 5, active: true },
  ]

  const branches: LocalBranch[] = [
    { id: 'br-1', name: 'Main Branch', address: '123 Katipunan Ave, Quezon City', manager_name: 'Maria Santos', active: true, terminal_count: 2 },
    { id: 'br-2', name: 'BGC Branch',  address: '7th Ave, BGC, Taguig City',      manager_name: 'Jose Reyes',   active: true, terminal_count: 1 },
  ]

  const users: LocalUser[] = [
    { id: 'usr-1', name: 'Admin User',     username: 'admin',   email: 'admin@tenpos.ph',   password: 'admin123',   pin: '1234', role: 'admin',   branch_id: null,   branch_name: 'All Branches', status: 'active', sales_count: 0,   last_login: daysAgo(1),  created_at: daysAgo(60) },
    { id: 'usr-2', name: 'Maria Santos',   username: 'manager', email: 'manager@tenpos.ph', password: 'manager123', pin: '2345', role: 'manager', branch_id: 'br-1', branch_name: 'Main Branch',  status: 'active', sales_count: 68,  last_login: daysAgo(0),  created_at: daysAgo(45) },
    { id: 'usr-3', name: 'Juan Dela Cruz', username: 'cashier', email: 'cashier@tenpos.ph', password: 'cashier123', pin: '3456', role: 'cashier', branch_id: 'br-1', branch_name: 'Main Branch',  status: 'active', sales_count: 72,  last_login: daysAgo(0),  created_at: daysAgo(30) },
  ]

  const vouchers: LocalVoucher[] = [
    { id: 'vou-1', code: 'WELCOME10', discount_type: 'percent', discount_value: 10, min_purchase: 500,  max_uses: 100, used_count: 38, active: true, created_at: daysAgo(30) },
    { id: 'vou-2', code: 'SAVE100',   discount_type: 'fixed',   discount_value: 100, min_purchase: 1000, max_uses: 50,  used_count: 14, active: true, created_at: daysAgo(20) },
    { id: 'vou-3', code: 'GRAD2025',  discount_type: 'percent', discount_value: 15, min_purchase: 700,  max_uses: 200, used_count: 56, active: true, created_at: daysAgo(15) },
    { id: 'vou-4', code: 'SUMMER20',  discount_type: 'percent', discount_value: 20, min_purchase: 800,  max_uses: 80,  used_count: 80, active: false, expires_at: daysAgo(5), created_at: daysAgo(60) },
  ]

  // ── Generate 30 days of demo transactions ──────────────────────────────────
  const productPool = [
    { pid: 'p-01', name: 'Pagasa Large Butterfly',          sku: 'PAG-L-BUT', price: 850 },
    { pid: 'p-02', name: 'Pagasa Large Hearts',             sku: 'PAG-L-HRT', price: 850 },
    { pid: 'p-03', name: 'Pagasa Large Balls',              sku: 'PAG-L-BLS', price: 850 },
    { pid: 'p-04', name: 'Pagasa Large Camo',               sku: 'PAG-L-CMO', price: 850 },
    { pid: 'p-05', name: 'Pagasa Large Coloured Triangles', sku: 'PAG-L-TRI', price: 850 },
    { pid: 'p-06', name: 'Malakas Medium Dinosaur',         sku: 'MAL-M-DIN', price: 750 },
    { pid: 'p-07', name: 'Malakas Medium Dalmatian',        sku: 'MAL-M-DAL', price: 750 },
    { pid: 'p-08', name: 'Malakas Medium Firecracker Red',  sku: 'MAL-M-RED', price: 750 },
    { pid: 'p-09', name: 'Malakas Medium Lime',             sku: 'MAL-M-LIM', price: 750 },
    { pid: 'p-10', name: 'Malakas Medium Mustard',          sku: 'MAL-M-MUS', price: 750 },
  ]
  const payMethods = ['cash', 'cash', 'cash', 'gcash', 'gcash', 'card', 'paymaya']

  let seq = 1000
  const txns: LocalTransaction[] = []
  const staffUsers = [users[1], users[2]]

  for (let dayOff = 29; dayOff >= 0; dayOff--) {
    const baseDate = new Date()
    baseDate.setDate(baseDate.getDate() - dayOff)
    const dow = baseDate.getDay() // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6
    const isFriday  = dow === 5
    // Weekend 6 txns, Friday 5, weekdays alternate 3-4
    const dailyCount = isWeekend ? 6 : isFriday ? 5 : 3 + (dayOff % 2 === 0 ? 1 : 0)

    for (let t = 0; t < dailyCount; t++) {
      const txDate = new Date(baseDate)
      // Spread transactions across 9 AM – 6 PM
      txDate.setHours(9 + ((dayOff * 3 + t * 2) % 9), (dayOff * 7 + t * 13) % 60, 0, 0)

      const staffMember = staffUsers[(dayOff + t) % 2]
      const method      = payMethods[(dayOff * 2 + t * 3) % payMethods.length]
      // 1–3 distinct products per cart
      const numItems    = 1 + ((dayOff * 3 + t) % 3)

      const seenPids = new Set<string>()
      const items: LocalTxItem[] = []
      for (let i = 0; i < numItems; i++) {
        const prod = productPool[(dayOff * 3 + t * 5 + i * 7) % productPool.length]
        if (seenPids.has(prod.pid)) continue
        seenPids.add(prod.pid)
        const qty = 1 + ((dayOff + t + i) % 2)
        items.push({
          id:           `si-${dayOff}-${t}-${i}`,
          product_id:   prod.pid,
          product_name: prod.name,
          sku:          prod.sku,
          quantity:     qty,
          unit_price:   prod.price,
          discount:     0,
          total:        prod.price * qty,
        })
      }

      const subtotal    = items.reduce((s, i) => s + i.total, 0)
      const hasDiscount = (dayOff * 3 + t) % 8 === 0
      const discount    = hasDiscount ? Math.floor(subtotal * 0.1 / 50) * 50 : 0
      const total       = subtotal - discount
      const cashPaid    = method === 'cash' ? Math.ceil(total / 100) * 100 : total
      const change      = method === 'cash' ? cashPaid - total : 0

      seq++
      txns.push({
        id:             `txs-${dayOff}-${t}`,
        receipt_no:     `TEN-${String(seq).padStart(5, '0')}`,
        branch_id:      'br-1',
        branch_name:    'Main Branch',
        staff_id:       staffMember.id,
        staff_name:     staffMember.name,
        items,
        payments:       [{ method, amount: cashPaid }],
        subtotal,
        discount,
        tax:            0,
        total,
        change,
        payment_method: method,
        status:         'completed',
        created_at:     txDate.toISOString(),
      })
    }
  }

  // Mark a few historical transactions as voided/returned for demo variety
  txns[3].status    = 'voided'
  txns[3].voided_at = daysAgo(26)
  txns[3].void_reason = 'Customer changed mind at pickup'
  txns[10].status   = 'returned'

  // ── Stock adjustments ─────────────────────────────────────────────────────
  const adjustments: LocalAdjustment[] = [
    { id: 'adj-1', product_id: 'p-01', product_name: 'Pagasa Large Butterfly',         type: 'in',         quantity: 30, reason: 'Initial stock delivery from supplier',   by: 'Maria Santos',   branch_id: 'br-1', created_at: daysAgo(28) },
    { id: 'adj-2', product_id: 'p-06', product_name: 'Malakas Medium Dinosaur',         type: 'in',         quantity: 25, reason: 'Restocked — high demand season',         by: 'Maria Santos',   branch_id: 'br-1', created_at: daysAgo(22) },
    { id: 'adj-3', product_id: 'p-04', product_name: 'Pagasa Large Camo',               type: 'damage',     quantity: 3,  reason: 'Water damage during delivery',           by: 'Juan Dela Cruz', branch_id: 'br-1', created_at: daysAgo(19) },
    { id: 'adj-4', product_id: 'p-08', product_name: 'Malakas Medium Firecracker Red',  type: 'in',         quantity: 15, reason: 'Emergency restock — nearly out of stock', by: 'Maria Santos',   branch_id: 'br-1', created_at: daysAgo(15) },
    { id: 'adj-5', product_id: 'p-10', product_name: 'Malakas Medium Mustard',          type: 'correction', quantity: 8,  reason: 'Physical count correction after audit',  by: 'Admin User',     branch_id: 'br-1', created_at: daysAgo(12) },
    { id: 'adj-6', product_id: 'p-02', product_name: 'Pagasa Large Hearts',             type: 'in',         quantity: 20, reason: 'Regular supplier delivery',              by: 'Maria Santos',   branch_id: 'br-1', created_at: daysAgo(8) },
    { id: 'adj-7', product_id: 'p-09', product_name: 'Malakas Medium Lime',             type: 'out',        quantity: 4,  reason: 'Transferred to window display',          by: 'Juan Dela Cruz', branch_id: 'br-1', created_at: daysAgo(5) },
    { id: 'adj-8', product_id: 'p-07', product_name: 'Malakas Medium Dalmatian',        type: 'return',     quantity: 2,  reason: 'Customer return — manufacturing defect', by: 'Juan Dela Cruz', branch_id: 'br-1', created_at: daysAgo(2) },
    { id: 'adj-9', product_id: 'p-03', product_name: 'Pagasa Large Balls',              type: 'damage',     quantity: 1,  reason: 'Torn strap — cannot sell',               by: 'Juan Dela Cruz', branch_id: 'br-1', created_at: daysAgo(1) },
  ]

  // ── Pre-populated audit log ───────────────────────────────────────────────
  const auditSeed: LocalAuditEntry[] = [
    { id: 'aud-s-01', action: 'SYSTEM_INIT',     user: 'System',        details: 'TenPOS initialized with demo data',                          ip: '127.0.0.1',    timestamp: daysAgo(60), severity: 'info'     },
    { id: 'aud-s-02', action: 'STAFF_CREATED',   user: 'Admin User',    details: 'Created staff: Maria Santos (manager)',                       ip: '192.168.1.1',  timestamp: daysAgo(45), severity: 'info'     },
    { id: 'aud-s-03', action: 'STAFF_CREATED',   user: 'Admin User',    details: 'Created staff: Juan Dela Cruz (cashier)',                     ip: '192.168.1.1',  timestamp: daysAgo(30), severity: 'info'     },
    { id: 'aud-s-04', action: 'PRODUCT_CREATED', user: 'Admin User',    details: 'Created product: Pagasa Large Butterfly',                     ip: '192.168.1.1',  timestamp: daysAgo(60), severity: 'info'     },
    { id: 'aud-s-05', action: 'PRODUCT_CREATED', user: 'Admin User',    details: 'Created product: Malakas Medium Dinosaur',                    ip: '192.168.1.1',  timestamp: daysAgo(60), severity: 'info'     },
    { id: 'aud-s-06', action: 'PRODUCT_CREATED', user: 'Admin User',    details: 'Created product: Pagasa Large Hearts',                        ip: '192.168.1.1',  timestamp: daysAgo(60), severity: 'info'     },
    { id: 'aud-s-07', action: 'LOGIN',           user: 'Admin User',    details: 'User signed in',                                              ip: '192.168.1.1',  timestamp: daysAgo(30), severity: 'info'     },
    { id: 'aud-s-08', action: 'STOCK_ADJUSTMENT',user: 'Maria Santos',  details: 'IN 30 × Pagasa Large Butterfly: Initial stock delivery',      ip: '192.168.1.5',  timestamp: daysAgo(28), severity: 'info'     },
    { id: 'aud-s-09', action: 'LOGIN',           user: 'Maria Santos',  details: 'User signed in',                                              ip: '192.168.1.5',  timestamp: daysAgo(27), severity: 'info'     },
    { id: 'aud-s-10', action: 'VOID',            user: 'Maria Santos',  details: 'Voided TEN-01004: Customer changed mind at pickup',           ip: '192.168.1.5',  timestamp: daysAgo(26), severity: 'warning'  },
    { id: 'aud-s-11', action: 'STOCK_ADJUSTMENT',user: 'Maria Santos',  details: 'IN 25 × Malakas Medium Dinosaur: Restocked high demand',      ip: '192.168.1.5',  timestamp: daysAgo(22), severity: 'info'     },
    { id: 'aud-s-12', action: 'RETURN',          user: 'Juan Dela Cruz',details: 'Return on TEN-01011 (1 item(s))',                             ip: '192.168.1.8',  timestamp: daysAgo(20), severity: 'warning'  },
    { id: 'aud-s-13', action: 'STOCK_ADJUSTMENT',user: 'Juan Dela Cruz',details: 'DAMAGE 3 × Pagasa Large Camo: Water damage during delivery',  ip: '192.168.1.8',  timestamp: daysAgo(19), severity: 'warning'  },
    { id: 'aud-s-14', action: 'LOGIN',           user: 'Juan Dela Cruz',details: 'User signed in',                                              ip: '192.168.1.8',  timestamp: daysAgo(15), severity: 'info'     },
    { id: 'aud-s-15', action: 'STOCK_ADJUSTMENT',user: 'Maria Santos',  details: 'IN 15 × Malakas Medium Firecracker Red: Emergency restock',   ip: '192.168.1.5',  timestamp: daysAgo(15), severity: 'info'     },
    { id: 'aud-s-16', action: 'STOCK_ADJUSTMENT',user: 'Admin User',    details: 'CORRECTION 8 × Malakas Medium Mustard: Physical count',       ip: '192.168.1.1',  timestamp: daysAgo(12), severity: 'info'     },
    { id: 'aud-s-17', action: 'PRODUCT_UPDATED', user: 'Admin User',    details: 'Updated product pricing: Pagasa Large Camo',                  ip: '192.168.1.1',  timestamp: daysAgo(10), severity: 'info'     },
    { id: 'aud-s-18', action: 'STOCK_ADJUSTMENT',user: 'Maria Santos',  details: 'IN 20 × Pagasa Large Hearts: Regular supplier delivery',      ip: '192.168.1.5',  timestamp: daysAgo(8),  severity: 'info'     },
    { id: 'aud-s-19', action: 'LOGIN',           user: 'Maria Santos',  details: 'User signed in',                                              ip: '192.168.1.5',  timestamp: daysAgo(5),  severity: 'info'     },
    { id: 'aud-s-20', action: 'STOCK_ADJUSTMENT',user: 'Juan Dela Cruz',details: 'OUT 4 × Malakas Medium Lime: Transferred to window display',  ip: '192.168.1.8',  timestamp: daysAgo(5),  severity: 'info'     },
    { id: 'aud-s-21', action: 'LOGIN',           user: 'Juan Dela Cruz',details: 'User signed in',                                              ip: '192.168.1.8',  timestamp: daysAgo(3),  severity: 'info'     },
    { id: 'aud-s-22', action: 'STOCK_ADJUSTMENT',user: 'Juan Dela Cruz',details: 'RETURN 2 × Malakas Medium Dalmatian: Manufacturing defect',   ip: '192.168.1.8',  timestamp: daysAgo(2),  severity: 'warning'  },
    { id: 'aud-s-23', action: 'STOCK_ADJUSTMENT',user: 'Juan Dela Cruz',details: 'DAMAGE 1 × Pagasa Large Balls: Torn strap — cannot sell',     ip: '192.168.1.8',  timestamp: daysAgo(1),  severity: 'warning'  },
    { id: 'aud-s-24', action: 'LOGIN',           user: 'Admin User',    details: 'User signed in',                                              ip: '192.168.1.1',  timestamp: daysAgo(1),  severity: 'info'     },
  ]

  localStorage.setItem(K.receiptSeq, String(seq))
  lsSet(K.categories,   cats)
  lsSet(K.products,     prods)
  lsSet(K.inventory,    inv)
  lsSet(K.branches,     branches)
  lsSet(K.users,        users)
  lsSet(K.vouchers,     vouchers)
  lsSet(K.transactions, [...txns].reverse())
  lsSet(K.adjustments,  [...adjustments].reverse())
  lsSet(K.audit,        [...auditSeed].reverse())
  localStorage.setItem(K.seeded, '1')
}

// Run seed on module load
seed()

// ─── Auth exports (legacy compat) ────────────────────────────────────────────

export const BASE_URL = 'local'

export function getToken(): string | null {
  return localStorage.getItem('tenpos_access_token')
}
export function getRefreshToken(): string | null {
  return localStorage.getItem('tenpos_refresh_token')
}
export function saveTokens(access: string, refresh: string) {
  localStorage.setItem('tenpos_access_token', access)
  localStorage.setItem('tenpos_refresh_token', refresh)
}
export function clearTokens() {
  localStorage.removeItem('tenpos_access_token')
  localStorage.removeItem('tenpos_refresh_token')
  localStorage.removeItem(K.currentUser)
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function apiLogin(username: string, password: string) {
  await delay()
  const users = ls<LocalUser>(K.users)
  const user = users.find(u => (u.username ?? u.email).toLowerCase() === username.toLowerCase() && u.password === password)
  if (!user) throw new Error('Incorrect username or password.')
  if (user.status === 'inactive') throw new Error('Your account has been deactivated.')
  const token = `local_${uuid()}`
  saveTokens(token, token)
  lsSet(K.currentUser, user)
  addAudit('LOGIN', user.name, `User signed in`, 'info')
  return {
    accessToken: token, refreshToken: token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, branch_id: user.branch_id },
  }
}

export async function apiLogout() {
  await delay()
  const user = lsGet<LocalUser>(K.currentUser)
  if (user) addAudit('LOGOUT', user.name, 'User signed out', 'info')
  clearTokens()
}

export async function apiMe() {
  await delay()
  const user = lsGet<LocalUser>(K.currentUser)
  if (!user) throw new Error('Not authenticated')
  return { id: user.id, name: user.name, email: user.email, role: user.role, branch_id: user.branch_id }
}

export async function apiVerifyPin(pin: string) {
  await delay()
  const user = lsGet<LocalUser>(K.currentUser)
  if (!user) return { valid: false }
  return { valid: user.pin === pin }
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function apiGetProducts(params?: Record<string, string>) {
  await delay()
  let products = ls<LocalProduct>(K.products)
  if (params?.active === 'true') products = products.filter(p => p.active)
  if (params?.q) {
    const q = params.q.toLowerCase()
    products = products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
  }
  if (params?.category_id) products = products.filter(p => p.category_id === params.category_id)
  const total = products.length
  const limit = parseInt(params?.limit ?? '100', 10)
  const offset = parseInt(params?.offset ?? '0', 10)
  return { data: products.slice(offset, offset + limit), total }
}

export async function apiGetProduct(id: string) {
  await delay()
  const product = ls<LocalProduct>(K.products).find(p => p.id === id)
  if (!product) throw new Error('Product not found')
  const inv = ls<LocalInventory>(K.inventory).find(i => i.product_id === id)
  return { ...product, stock: inv?.stock ?? 0, reorder_point: inv?.reorder_point ?? 5 }
}

export async function apiGetProductByBarcode(barcode: string) {
  await delay()
  const product = ls<LocalProduct>(K.products).find(p => p.barcode === barcode)
  if (!product) throw new Error('Product not found')
  return product
}

export async function apiCreateProduct(data: Record<string, unknown>) {
  await delay()
  const products = ls<LocalProduct>(K.products)
  const cats = ls<LocalCategory>(K.categories)
  const cat = cats.find(c => c.id === data.category_id)
  const product: LocalProduct = {
    id: uuid(), sku: data.sku as string, barcode: data.barcode as string | undefined,
    name: data.name as string, category_id: data.category_id as string,
    category_name: cat?.name ?? '', price: Number(data.price), cost: Number(data.cost ?? 0),
    image_url: data.image_url as string | undefined, active: data.active !== false,
    variants: (data.variants as LocalProduct['variants']) ?? [],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
  products.push(product)
  lsSet(K.products, products)
  // Create inventory entry
  const inv = ls<LocalInventory>(K.inventory)
  inv.push({
    id: `${product.id}_base_br-1`, product_id: product.id, product_name: product.name,
    sku: product.sku, category_name: product.category_name, price: product.price,
    cost: product.cost, branch_id: 'br-1', branch_name: 'Main Branch',
    stock: Number(data.stock ?? 0), reorder_point: Number(data.reorder_point ?? 5), active: true,
  })
  lsSet(K.inventory, inv)
  const user = lsGet<LocalUser>(K.currentUser)
  addAudit('PRODUCT_CREATED', user?.name ?? 'System', `Created product: ${product.name}`, 'info')
  return product
}

export async function apiUpdateProduct(id: string, data: Record<string, unknown>) {
  await delay()
  const products = ls<LocalProduct>(K.products)
  const idx = products.findIndex(p => p.id === id)
  if (idx === -1) throw new Error('Product not found')
  const cats = ls<LocalCategory>(K.categories)
  const cat = data.category_id ? cats.find(c => c.id === data.category_id) : null
  products[idx] = {
    ...products[idx],
    ...(data as Partial<LocalProduct>),
    category_name: cat?.name ?? products[idx].category_name,
    updated_at: new Date().toISOString(),
  }
  lsSet(K.products, products)
  // Update inventory price/cost
  if (data.price !== undefined || data.cost !== undefined || data.reorder_point !== undefined) {
    const inv = ls<LocalInventory>(K.inventory)
    const invIdx = inv.findIndex(i => i.product_id === id)
    if (invIdx !== -1) {
      if (data.price !== undefined) inv[invIdx].price = Number(data.price)
      if (data.cost !== undefined) inv[invIdx].cost = Number(data.cost)
      if (data.reorder_point !== undefined) inv[invIdx].reorder_point = Number(data.reorder_point)
      lsSet(K.inventory, inv)
    }
  }
  return products[idx]
}

export async function apiDeleteProduct(id: string) {
  await delay()
  const products = ls<LocalProduct>(K.products)
  const product = products.find(p => p.id === id)
  lsSet(K.products, products.filter(p => p.id !== id))
  lsSet(K.inventory, ls<LocalInventory>(K.inventory).filter(i => i.product_id !== id))
  const user = lsGet<LocalUser>(K.currentUser)
  addAudit('PRODUCT_DELETED', user?.name ?? 'System', `Deleted product: ${product?.name ?? id}`, 'warning')
  return { ok: true }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function apiGetCategories() {
  await delay()
  return ls<LocalCategory>(K.categories)
}

export async function apiCreateCategory(data: { name: string; description?: string }) {
  await delay()
  const cats = ls<LocalCategory>(K.categories)
  const cat: LocalCategory = { id: uuid(), name: data.name, description: data.description ?? '' }
  cats.push(cat)
  lsSet(K.categories, cats)
  return cat
}

export async function apiUpdateCategory(id: string, data: { name?: string; description?: string }) {
  await delay()
  const cats = ls<LocalCategory>(K.categories)
  const idx = cats.findIndex(c => c.id === id)
  if (idx === -1) throw new Error('Category not found')
  cats[idx] = { ...cats[idx], ...data }
  lsSet(K.categories, cats)
  return cats[idx]
}

export async function apiDeleteCategory(id: string) {
  await delay()
  lsSet(K.categories, ls<LocalCategory>(K.categories).filter(c => c.id !== id))
  return { ok: true }
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export async function apiGetInventory(branchId?: string) {
  await delay()
  let inv = ls<LocalInventory>(K.inventory)
  if (branchId) inv = inv.filter(i => i.branch_id === branchId)
  return inv
}

export async function apiGetLowStock(branchId?: string) {
  await delay()
  let inv = ls<LocalInventory>(K.inventory)
  if (branchId) inv = inv.filter(i => i.branch_id === branchId)
  return inv
    .filter(i => i.stock <= i.reorder_point)
    .map(i => ({
      product_id: i.product_id, product_name: i.product_name, sku: i.sku,
      category_name: i.category_name, stock: i.stock, reorder_point: i.reorder_point, cost: i.cost,
    }))
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function apiCreateTransaction(payload: {
  branch_id: string
  items: { product_id: string; variant_id?: string; quantity: number; unit_price: number; discount: number; note?: string }[]
  payments: { method: string; amount: number; reference?: string }[]
  discount: number
  voucher_code?: string
}) {
  await delay()
  const products = ls<LocalProduct>(K.products)
  const currentUser = lsGet<LocalUser>(K.currentUser)
  const branches = ls<LocalBranch>(K.branches)
  const branch = branches.find(b => b.id === payload.branch_id) ?? branches[0]

  const txItems: LocalTxItem[] = payload.items.map(item => {
    const prod = products.find(p => p.id === item.product_id)
    return {
      id: uuid(),
      product_id: item.product_id,
      product_name: prod?.name ?? item.product_id,
      sku: prod?.sku ?? '',
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      total: item.unit_price * item.quantity - item.discount,
      note: item.note,
    }
  })

  const subtotal = txItems.reduce((s, i) => s + i.total, 0)
  const total = Math.max(0, subtotal - payload.discount)
  const cashPaid = payload.payments.find(p => p.method === 'cash')?.amount ?? total
  const change = Math.max(0, cashPaid - total)

  const txn: LocalTransaction = {
    id: uuid(),
    receipt_no: nextReceiptNo(),
    branch_id: branch?.id ?? 'br-1',
    branch_name: branch?.name ?? 'Main Branch',
    staff_id: currentUser?.id ?? 'usr-3',
    staff_name: currentUser?.name ?? 'Cashier',
    items: txItems,
    payments: payload.payments,
    subtotal,
    discount: payload.discount,
    tax: 0,
    total,
    change,
    payment_method: payload.payments[0]?.method ?? 'cash',
    status: 'completed',
    created_at: new Date().toISOString(),
  }

  const txns = ls<LocalTransaction>(K.transactions)
  txns.unshift(txn)
  lsSet(K.transactions, txns)

  // Deduct inventory
  const inv = ls<LocalInventory>(K.inventory)
  for (const item of payload.items) {
    const key = `${item.product_id}_${item.variant_id ?? 'base'}_${payload.branch_id}`
    const idx = inv.findIndex(i => i.id === key)
    if (idx !== -1) inv[idx].stock = Math.max(0, inv[idx].stock - item.quantity)
  }
  lsSet(K.inventory, inv)

  // Update staff sales count
  if (currentUser) {
    const users = ls<LocalUser>(K.users)
    const uIdx = users.findIndex(u => u.id === currentUser.id)
    if (uIdx !== -1) { users[uIdx].sales_count += 1; lsSet(K.users, users) }
  }

  addAudit('TRANSACTION', currentUser?.name ?? 'Cashier', `Sale ${txn.receipt_no} · ₱${total.toFixed(2)}`, 'info')
  return { id: txn.id, receipt_no: txn.receipt_no, total: txn.total }
}

export async function apiGetTransactions(params?: Record<string, string>) {
  await delay()
  let txns = ls<LocalTransaction>(K.transactions)
  if (params?.status) txns = txns.filter(t => t.status === params.status)
  if (params?.from) txns = txns.filter(t => t.created_at >= params.from)
  if (params?.to)   txns = txns.filter(t => t.created_at <= params.to)
  if (params?.search) {
    const q = params.search.toLowerCase()
    txns = txns.filter(t =>
      t.receipt_no.toLowerCase().includes(q) ||
      t.staff_name.toLowerCase().includes(q)
    )
  }
  if (params?.sort === 'asc') txns = [...txns].sort((a, b) => a.created_at.localeCompare(b.created_at))
  else txns = [...txns].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const total = txns.length
  const limit = parseInt(params?.limit ?? '50', 10)
  const offset = parseInt(params?.offset ?? '0', 10)
  return { data: txns.slice(offset, offset + limit), total }
}

export async function apiGetTransaction(id: string) {
  await delay()
  const txn = ls<LocalTransaction>(K.transactions).find(t => t.id === id)
  if (!txn) throw new Error('Transaction not found')
  return { ...txn, hash: `sha256-${txn.id.slice(0, 16)}` }
}

export async function apiVoidTransaction(id: string, reason: string) {
  await delay()
  const txns = ls<LocalTransaction>(K.transactions)
  const idx = txns.findIndex(t => t.id === id)
  if (idx === -1) throw new Error('Transaction not found')
  if (txns[idx].status !== 'completed') throw new Error('Transaction already voided or returned')
  txns[idx].status = 'voided'
  txns[idx].voided_at = new Date().toISOString()
  txns[idx].void_reason = reason
  lsSet(K.transactions, txns)
  // Restore inventory
  const inv = ls<LocalInventory>(K.inventory)
  for (const item of txns[idx].items) {
    const key = `${item.product_id}_${item.variant_id ?? 'base'}_${txns[idx].branch_id}`
    const iIdx = inv.findIndex(i => i.id === key)
    if (iIdx !== -1) inv[iIdx].stock += item.quantity
  }
  lsSet(K.inventory, inv)
  const user = lsGet<LocalUser>(K.currentUser)
  addAudit('VOID', user?.name ?? 'System', `Voided ${txns[idx].receipt_no}: ${reason}`, 'warning')
  return { ok: true }
}

export async function apiReturnTransaction(
  id: string,
  items: { item_id: string; quantity: number; reason?: string }[]
) {
  await delay()
  const txns = ls<LocalTransaction>(K.transactions)
  const idx = txns.findIndex(t => t.id === id)
  if (idx === -1) throw new Error('Transaction not found')
  txns[idx].status = 'returned'
  lsSet(K.transactions, txns)
  const user = lsGet<LocalUser>(K.currentUser)
  addAudit('RETURN', user?.name ?? 'System', `Return on ${txns[idx].receipt_no} (${items.length} item(s))`, 'warning')
  return { ok: true }
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

export async function apiValidateVoucher(code: string, subtotal: number) {
  await delay()
  const vouchers = ls<LocalVoucher>(K.vouchers)
  const v = vouchers.find(v => v.code.toUpperCase() === code.toUpperCase() && v.active)
  if (!v) return { valid: false, error: 'Voucher code not found or inactive.' }
  if (v.expires_at && new Date(v.expires_at) < new Date()) return { valid: false, error: 'Voucher has expired.' }
  if (v.used_count >= v.max_uses) return { valid: false, error: 'Voucher usage limit reached.' }
  if (subtotal < v.min_purchase) return { valid: false, error: `Minimum purchase of ₱${v.min_purchase} required.` }
  const discount_amount = v.discount_type === 'percent'
    ? (subtotal * v.discount_value) / 100
    : v.discount_value
  return { valid: true, discount_amount, discount_type: v.discount_type, discount_value: v.discount_value }
}

export async function apiGetVouchers(params?: Record<string, string>) {
  await delay()
  let vouchers = ls<LocalVoucher>(K.vouchers)
  if (params?.active === 'true') vouchers = vouchers.filter(v => v.active)
  const total = vouchers.length
  const limit = parseInt(params?.limit ?? '50', 10)
  return { data: vouchers.slice(0, limit), total }
}

export async function apiCreateVoucher(data: Record<string, unknown>) {
  await delay()
  const vouchers = ls<LocalVoucher>(K.vouchers)
  const v: LocalVoucher = {
    id: uuid(), code: (data.code as string).toUpperCase(),
    discount_type: data.discount_type as 'percent' | 'fixed',
    discount_value: Number(data.discount_value),
    min_purchase: Number(data.min_purchase ?? 0),
    max_uses: Number(data.max_uses ?? 9999),
    used_count: 0, active: data.active !== false,
    expires_at: data.expires_at as string | undefined,
    created_at: new Date().toISOString(),
  }
  vouchers.push(v)
  lsSet(K.vouchers, vouchers)
  return v
}

export async function apiUpdateVoucherById(id: string, data: Record<string, unknown>) {
  await delay()
  const vouchers = ls<LocalVoucher>(K.vouchers)
  const idx = vouchers.findIndex(v => v.id === id)
  if (idx === -1) throw new Error('Voucher not found')
  vouchers[idx] = { ...vouchers[idx], ...(data as Partial<LocalVoucher>) }
  lsSet(K.vouchers, vouchers)
  return vouchers[idx]
}

export async function apiDeleteVoucher(id: string) {
  await delay()
  lsSet(K.vouchers, ls<LocalVoucher>(K.vouchers).filter(v => v.id !== id))
  return { ok: true }
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function apiSalesReport(params: Record<string, string>) {
  await delay()
  let txns = ls<LocalTransaction>(K.transactions).filter(t => t.status === 'completed')
  if (params.from) txns = txns.filter(t => t.created_at >= params.from)
  if (params.to)   txns = txns.filter(t => t.created_at <= params.to)

  const total_revenue = txns.reduce((s, t) => s + t.total, 0)
  const transaction_count = txns.length
  const total_items_sold = txns.reduce((s, t) => s + t.items.reduce((is, i) => is + i.quantity, 0), 0)
  const avg_order_value = transaction_count > 0 ? total_revenue / transaction_count : 0

  // Sales by day (last 7 days)
  const dayMap = new Map<string, { revenue: number; count: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    dayMap.set(d.toISOString().slice(0, 10), { revenue: 0, count: 0 })
  }
  for (const t of txns) {
    const day = t.created_at.slice(0, 10)
    if (dayMap.has(day)) {
      dayMap.get(day)!.revenue += t.total
      dayMap.get(day)!.count += 1
    }
  }
  const salesByPeriod = [...dayMap.entries()].map(([date, v]) => ({ date, ...v }))

  // Top products
  const productMap = new Map<string, { product_name: string; quantity_sold: number; revenue: number }>()
  for (const t of txns) {
    for (const item of t.items) {
      if (!productMap.has(item.product_id)) {
        productMap.set(item.product_id, { product_name: item.product_name, quantity_sold: 0, revenue: 0 })
      }
      productMap.get(item.product_id)!.quantity_sold += item.quantity
      productMap.get(item.product_id)!.revenue += item.total
    }
  }
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  return { summary: { total_revenue, transaction_count, total_items_sold, avg_order_value }, salesByPeriod, topProducts }
}

export async function apiFinancialReport(params: Record<string, string>) {
  await delay()
  let txns = ls<LocalTransaction>(K.transactions).filter(t => t.status === 'completed')
  if (params.from) txns = txns.filter(t => t.created_at >= params.from)
  if (params.to)   txns = txns.filter(t => t.created_at <= params.to)
  const inv = ls<LocalInventory>(K.inventory)

  const revenue = txns.reduce((s, t) => s + t.total, 0)
  const products = ls<LocalProduct>(K.products)
  const cogs = txns.reduce((s, t) =>
    s + t.items.reduce((is, item) => {
      const p = products.find(p => p.id === item.product_id)
      return is + (p?.cost ?? 0) * item.quantity
    }, 0), 0)
  const gross_profit = revenue - cogs
  const gross_margin = revenue > 0 ? (gross_profit / revenue) * 100 : 0
  const stock_value = inv.reduce((s, i) => s + i.cost * i.stock, 0)

  const paymentBreakdown: Record<string, number> = {}
  for (const t of txns) {
    for (const p of t.payments) {
      paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + p.amount
    }
  }

  return { revenue, cogs, gross_profit, gross_margin: gross_margin.toFixed(1), stock_value, transaction_count: txns.length, paymentBreakdown }
}

export async function apiStaffReport(params: Record<string, string>) {
  await delay()
  let txns = ls<LocalTransaction>(K.transactions).filter(t => t.status === 'completed')
  if (params.from) txns = txns.filter(t => t.created_at >= params.from)
  if (params.to)   txns = txns.filter(t => t.created_at <= params.to)
  const users = ls<LocalUser>(K.users)

  const staffMap = new Map<string, { name: string; transaction_count: number; revenue: number; items_sold: number }>()
  for (const t of txns) {
    if (!staffMap.has(t.staff_id)) {
      staffMap.set(t.staff_id, { name: t.staff_name, transaction_count: 0, revenue: 0, items_sold: 0 })
    }
    const s = staffMap.get(t.staff_id)!
    s.transaction_count++
    s.revenue += t.total
    s.items_sold += t.items.reduce((is, i) => is + i.quantity, 0)
  }
  const staffPerformance = users.map(u => ({
    staff_id: u.id, name: u.name, role: u.role,
    ...(staffMap.get(u.id) ?? { transaction_count: 0, revenue: 0, items_sold: 0 }),
  }))

  return { staffPerformance }
}

export async function apiInventoryReport(params?: Record<string, string>) {
  await delay()
  const inv = ls<LocalInventory>(K.inventory)
  const products = ls<LocalProduct>(K.products)
  let filtered = inv
  if (params?.branch_id) filtered = filtered.filter(i => i.branch_id === params.branch_id)

  // stockSummary — one row per inventory item
  const stockSummary = filtered.map(i => ({
    id: i.id,
    name: i.product_name,
    sku: i.sku,
    price: String(i.price),
    cost: String(i.cost),
    category_name: i.category_name,
    total_stock: i.stock,
    reorder_point: i.reorder_point,
    stock_value: String(i.cost * i.stock),
  }))

  // fastMovers — top selling products over last 30 days
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  const recentTxns = ls<LocalTransaction>(K.transactions).filter(t => t.status === 'completed' && t.created_at >= cutoff)
  const moverMap = new Map<string, { product_id: string; product_name: string; quantity_sold: number; revenue: number }>()
  for (const t of recentTxns) {
    for (const item of t.items) {
      if (!moverMap.has(item.product_id)) moverMap.set(item.product_id, { product_id: item.product_id, product_name: item.product_name, quantity_sold: 0, revenue: 0 })
      const m = moverMap.get(item.product_id)!
      m.quantity_sold += item.quantity
      m.revenue += item.total
    }
  }
  const fastMovers = [...moverMap.values()]
    .sort((a, b) => b.quantity_sold - a.quantity_sold)
    .map(m => ({ ...m, revenue: String(m.revenue) }))

  // stockMovement — summarise adjustments into add/remove buckets
  const adjustments = ls<LocalAdjustment>(K.adjustments)
  const movMap = new Map<string, { type: string; count: number; total_quantity: number }>()
  for (const adj of adjustments) {
    const bucket = adj.type === 'in' || adj.type === 'return' ? 'add' : 'remove'
    if (!movMap.has(bucket)) movMap.set(bucket, { type: bucket, count: 0, total_quantity: 0 })
    const m = movMap.get(bucket)!
    m.count++
    m.total_quantity += adj.quantity
  }
  const stockMovement = [...movMap.values()]

  // valueByCategory
  const catMap = new Map<string, { category: string; products: number; total_stock: number; total_value: number }>()
  for (const item of filtered) {
    if (!catMap.has(item.category_name)) catMap.set(item.category_name, { category: item.category_name, products: 0, total_stock: 0, total_value: 0 })
    const c = catMap.get(item.category_name)!
    c.products++
    c.total_stock += item.stock
    c.total_value += item.cost * item.stock
  }
  const valueByCategory = [...catMap.values()].map(c => ({ ...c, total_value: String(c.total_value) }))

  void products
  return { stockSummary, fastMovers, stockMovement, valueByCategory }
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function apiGetStaff(params?: Record<string, string>) {
  await delay()
  let users = ls<LocalUser>(K.users)
  if (params?.role) users = users.filter(u => u.role === params.role)
  if (params?.status) users = users.filter(u => u.status === params.status)
  if (params?.q) {
    const q = params.q.toLowerCase()
    users = users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }
  const total = users.length
  const limit = parseInt(params?.limit ?? '50', 10)
  const data = users.slice(0, limit).map(u => ({
    id: u.id, name: u.name, email: u.email, role: u.role,
    branch: u.branch_name, branch_id: u.branch_id,
    status: u.status, lastLogin: u.last_login ?? daysAgo(1), salesCount: u.sales_count,
    created_at: u.created_at,
  }))
  return { data, total }
}

export async function apiGetStaffMember(id: string) {
  await delay()
  const user = ls<LocalUser>(K.users).find(u => u.id === id)
  if (!user) throw new Error('Staff member not found')
  const txns = ls<LocalTransaction>(K.transactions).filter(t => t.staff_id === id && t.status === 'completed')
  return {
    id: user.id, name: user.name, email: user.email, role: user.role,
    branch: user.branch_name, branch_id: user.branch_id,
    status: user.status, lastLogin: user.last_login ?? daysAgo(1),
    salesCount: user.sales_count, created_at: user.created_at,
    recent_transactions: txns.slice(0, 5),
    total_revenue: txns.reduce((s, t) => s + t.total, 0),
  }
}

export async function apiCreateStaff(data: Record<string, unknown>) {
  await delay()
  const users = ls<LocalUser>(K.users)
  if (users.find(u => u.email.toLowerCase() === (data.email as string).toLowerCase())) {
    throw new Error('A staff member with that email already exists.')
  }
  const branches = ls<LocalBranch>(K.branches)
  const branch = branches.find(b => b.id === data.branch_id)
  const user: LocalUser = {
    id: uuid(), name: data.name as string, email: data.email as string,
    password: data.password as string ?? 'changeme123',
    pin: data.pin as string ?? '0000',
    role: data.role as LocalUser['role'],
    branch_id: data.branch_id as string | null,
    branch_name: branch?.name ?? 'Main Branch',
    status: 'active', sales_count: 0, created_at: new Date().toISOString(),
  }
  users.push(user)
  lsSet(K.users, users)
  const currentUser = lsGet<LocalUser>(K.currentUser)
  addAudit('STAFF_CREATED', currentUser?.name ?? 'Admin', `Created staff: ${user.name} (${user.role})`, 'info')
  return { id: user.id, name: user.name, email: user.email, role: user.role, branch: user.branch_name, status: user.status }
}

export async function apiUpdateStaff(id: string, data: Record<string, unknown>) {
  await delay()
  const users = ls<LocalUser>(K.users)
  const idx = users.findIndex(u => u.id === id)
  if (idx === -1) throw new Error('Staff member not found')
  const branches = ls<LocalBranch>(K.branches)
  const branch = data.branch_id ? branches.find(b => b.id === data.branch_id) : null
  users[idx] = {
    ...users[idx],
    ...(data as Partial<LocalUser>),
    branch_name: branch?.name ?? users[idx].branch_name,
  }
  lsSet(K.users, users)
  return { id: users[idx].id, name: users[idx].name, email: users[idx].email, role: users[idx].role, branch: users[idx].branch_name, status: users[idx].status }
}

export async function apiDeleteStaff(id: string) {
  await delay()
  const users = ls<LocalUser>(K.users)
  const user = users.find(u => u.id === id)
  lsSet(K.users, users.filter(u => u.id !== id))
  const currentUser = lsGet<LocalUser>(K.currentUser)
  addAudit('STAFF_DELETED', currentUser?.name ?? 'Admin', `Deleted staff: ${user?.name ?? id}`, 'warning')
  return { ok: true }
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function apiGetBranches() {
  await delay()
  return ls<LocalBranch>(K.branches).map(b => ({
    id: b.id, name: b.name, address: b.address,
    managerName: b.manager_name, active: b.active, terminalCount: b.terminal_count,
  }))
}

export async function apiCreateBranch(data: Record<string, unknown>) {
  await delay()
  const branches = ls<LocalBranch>(K.branches)
  const branch: LocalBranch = {
    id: uuid(), name: data.name as string, address: data.address as string ?? '',
    manager_name: data.manager_name as string ?? '', active: true, terminal_count: 1,
  }
  branches.push(branch)
  lsSet(K.branches, branches)
  return { id: branch.id, name: branch.name, address: branch.address, managerName: branch.manager_name, active: branch.active, terminalCount: branch.terminal_count }
}

export async function apiUpdateBranch(id: string, data: Record<string, unknown>) {
  await delay()
  const branches = ls<LocalBranch>(K.branches)
  const idx = branches.findIndex(b => b.id === id)
  if (idx === -1) throw new Error('Branch not found')
  branches[idx] = { ...branches[idx], ...(data as Partial<LocalBranch>) }
  lsSet(K.branches, branches)
  return { id: branches[idx].id, name: branches[idx].name, address: branches[idx].address, managerName: branches[idx].manager_name, active: branches[idx].active, terminalCount: branches[idx].terminal_count }
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function apiGetAuditLog(params?: Record<string, string>) {
  await delay()
  let entries = ls<LocalAuditEntry>(K.audit)
  if (params?.severity) entries = entries.filter(e => e.severity === params.severity)
  if (params?.q) {
    const q = params.q.toLowerCase()
    entries = entries.filter(e => e.action.toLowerCase().includes(q) || e.user.toLowerCase().includes(q) || e.details.toLowerCase().includes(q))
  }
  const total = entries.length
  const page = parseInt(params?.page ?? '1', 10)
  const limit = parseInt(params?.limit ?? '30', 10)
  const offset = (page - 1) * limit
  return { data: entries.slice(offset, offset + limit), total, page, limit }
}

// ─── Inventory adjustments ────────────────────────────────────────────────────

export async function apiGetAdjustments(params?: Record<string, string>) {
  await delay()
  let adjustments = ls<LocalAdjustment>(K.adjustments)
  if (params?.product_id) adjustments = adjustments.filter(a => a.product_id === params.product_id)
  if (params?.branch_id)  adjustments = adjustments.filter(a => a.branch_id === params.branch_id)
  const total = adjustments.length
  const limit = parseInt(params?.limit ?? '50', 10)
  return { data: adjustments.slice(0, limit), total }
}

export async function apiCreateAdjustment(data: {
  product_id: string; type: 'in' | 'out' | 'correction' | 'damage' | 'return'
  quantity: number; reason: string; branch_id: string
}) {
  await delay()
  const products = ls<LocalProduct>(K.products)
  const product = products.find(p => p.id === data.product_id)
  const user = lsGet<LocalUser>(K.currentUser)
  const adj: LocalAdjustment = {
    id: uuid(), product_id: data.product_id, product_name: product?.name ?? data.product_id,
    type: data.type, quantity: data.quantity, reason: data.reason,
    by: user?.name ?? 'System', branch_id: data.branch_id, created_at: new Date().toISOString(),
  }
  const adjustments = ls<LocalAdjustment>(K.adjustments)
  adjustments.unshift(adj)
  lsSet(K.adjustments, adjustments)

  // Update inventory stock
  const inv = ls<LocalInventory>(K.inventory)
  const key = `${data.product_id}_base_${data.branch_id}`
  const idx = inv.findIndex(i => i.id === key)
  if (idx !== -1) {
    if (data.type === 'in' || data.type === 'return') inv[idx].stock += data.quantity
    else if (data.type === 'out' || data.type === 'damage') inv[idx].stock = Math.max(0, inv[idx].stock - data.quantity)
    else if (data.type === 'correction') inv[idx].stock = data.quantity
    lsSet(K.inventory, inv)
  }

  addAudit('STOCK_ADJUSTMENT', user?.name ?? 'System', `${data.type.toUpperCase()} ${data.quantity} × ${product?.name ?? data.product_id}: ${data.reason}`, 'info')
  return adj
}
