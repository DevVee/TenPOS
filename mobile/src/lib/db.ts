import Dexie, { type Table } from 'dexie'

// ─── Offline transaction queue ────────────────────────────────────────────────
export interface OfflineTransaction {
  id?: number            // auto-increment local key
  localId: string        // uuid generated offline
  payload: {
    branch_id: string
    items: {
      product_id: string
      variant_id?: string
      quantity: number
      unit_price: number
      discount: number
      note?: string
    }[]
    payments: { method: string; amount: number; reference?: string }[]
    discount: number
    voucher_code?: string
  }
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  error?: string
  attempts: number
  created_at: number    // Date.now()
  synced_at?: number
}

// ─── Cached product for offline POS use ──────────────────────────────────────
export interface CachedProduct {
  id: string
  sku: string
  barcode?: string
  name: string
  category_id?: string
  category_name?: string
  price: number
  cost?: number
  image_url?: string
  active: boolean
  variants: { id: string; label: string; value: string; price_adjustment: number }[]
  cached_at: number
}

// ─── Cached inventory ─────────────────────────────────────────────────────────
export interface CachedInventory {
  id: string            // product_id + variant_id + branch_id composite key
  product_id: string
  branch_id: string
  variant_id?: string
  stock: number
  reorder_point: number
  cached_at: number
}

// ─── Cached categories ────────────────────────────────────────────────────────
export interface CachedCategory {
  id: string
  name: string
  icon?: string
  cached_at: number
}

// ─── Cached vouchers ──────────────────────────────────────────────────────────
export interface CachedVoucher {
  id: string
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  min_purchase: number
  max_uses: number
  used_count: number
  active: boolean
  expires_at?: string
  cached_at: number
}

// ─── Cached staff (for offline reports + PIN verify) ─────────────────────────
export interface CachedStaff {
  id: string
  auth_id: string
  name: string
  email: string
  role: string
  branch_id: string | null
  status: string
  sales_count: number
  cached_at: number
}

// ─── Local transaction (for offline history) ─────────────────────────────────
export interface LocalTransaction {
  id: string           // Supabase UUID when synced; localId when offline
  receipt_no: string
  branch_id: string
  branch_name: string
  staff_id: string
  staff_name: string
  items: {
    id: string
    product_id: string
    product_name: string
    sku: string
    variant_id?: string
    quantity: number
    unit_price: number
    discount: number
    total: number
    note?: string
  }[]
  payments: { method: string; amount: number; reference?: string }[]
  subtotal: number
  discount: number
  tax: number
  total: number
  change: number
  payment_method: string
  status: 'completed' | 'voided' | 'returned'
  void_reason?: string
  voided_at?: string
  created_at: string
  is_offline: boolean  // true = created offline, not yet in Supabase
  synced: boolean
}

// ─── Dexie database ───────────────────────────────────────────────────────────
class TenPOSDatabase extends Dexie {
  offlineQueue!: Table<OfflineTransaction, number>
  products!: Table<CachedProduct, string>
  inventory!: Table<CachedInventory, string>
  categories!: Table<CachedCategory, string>
  vouchers!: Table<CachedVoucher, string>
  staff!: Table<CachedStaff, string>
  transactions!: Table<LocalTransaction, string>

  constructor() {
    super('tenpos_offline')

    // v1 — original tables
    this.version(1).stores({
      offlineQueue: '++id, localId, status, created_at',
      products:     'id, sku, barcode, category_id, active',
      inventory:    'id, product_id, branch_id',
    })

    // v2 — added categories, vouchers, staff, transactions
    this.version(2).stores({
      offlineQueue: '++id, localId, status, created_at',
      products:     'id, sku, barcode, category_id, active',
      inventory:    'id, product_id, branch_id',
      categories:   'id, name',
      vouchers:     'id, code, active',
      staff:        'id, auth_id, role',
      transactions: 'id, receipt_no, status, created_at, staff_id',
    })

    // v3 — add is_offline + synced indexes so sync.ts queries work correctly
    this.version(3).stores({
      offlineQueue: '++id, localId, status, created_at',
      products:     'id, sku, barcode, category_id, active',
      inventory:    'id, product_id, branch_id',
      categories:   'id, name',
      vouchers:     'id, code, active',
      staff:        'id, auth_id, role',
      transactions: 'id, receipt_no, status, created_at, staff_id, is_offline, synced',
    })
  }
}

export const db = new TenPOSDatabase()

// ─── Offline queue helpers ────────────────────────────────────────────────────

export async function queueTransaction(payload: OfflineTransaction['payload'], localId: string) {
  return db.offlineQueue.add({
    localId,
    payload,
    status: 'pending',
    attempts: 0,
    created_at: Date.now(),
  })
}

export async function getPendingTransactions() {
  return db.offlineQueue.where('status').anyOf(['pending', 'failed']).toArray()
}

export async function markTransactionSynced(id: number) {
  return db.offlineQueue.update(id, { status: 'synced', synced_at: Date.now() })
}

export async function markTransactionFailed(id: number, error: string, attempts: number) {
  return db.offlineQueue.update(id, { status: 'failed', error, attempts })
}

export async function markTransactionSyncing(id: number) {
  return db.offlineQueue.update(id, { status: 'syncing' })
}

// ─── Product cache helpers ────────────────────────────────────────────────────

export async function cacheProducts(products: CachedProduct[]) {
  return db.products.bulkPut(products.map((p) => ({ ...p, cached_at: Date.now() })))
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  return db.products.where('active').equals(1).toArray()
}

// ─── Inventory cache helpers ──────────────────────────────────────────────────

export async function cacheInventory(items: CachedInventory[]) {
  return db.inventory.bulkPut(items.map((i) => ({ ...i, cached_at: Date.now() })))
}

export async function getCachedStock(productId: string, branchId: string, variantId?: string) {
  const id = `${productId}_${variantId ?? 'base'}_${branchId}`
  return db.inventory.get(id)
}

// ─── Device PIN helpers (PBKDF2 via Web Crypto API) ──────────────────────────
//
// Storage format: "<saltHex>:<hashHex>"
// Using PBKDF2-SHA256 with 100 000 iterations + 16-byte random salt.
// Legacy entries (no colon) are plain SHA-256 — they are migrated to PBKDF2
// automatically on the next successful verify.

const PIN_HASH_KEY     = 'tenpos_device_pin_hash'
const PBKDF2_ITER      = 100_000

/** Derive a PBKDF2 hash from a PIN, optionally reusing an existing salt. */
async function _pbkdf2(pin: string, salt?: Uint8Array): Promise<{ hash: string; salt: string }> {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: actualSalt, iterations: PBKDF2_ITER },
    keyMaterial,
    256,
  )
  const toHex = (buf: Uint8Array) =>
    Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')

  return { hash: toHex(new Uint8Array(bits)), salt: toHex(actualSalt) }
}

/** Hash with plain SHA-256 — only used to detect and migrate legacy entries. */
async function _sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function setDevicePin(pin: string): Promise<void> {
  const { hash, salt } = await _pbkdf2(pin)
  localStorage.setItem(PIN_HASH_KEY, `${salt}:${hash}`)
}

export async function verifyDevicePin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_HASH_KEY)
  if (!stored) return false

  const colonIdx = stored.indexOf(':')

  if (colonIdx === -1) {
    // ── Legacy path: plain unsalted SHA-256 ──────────────────────────────────
    const legacyHash = await _sha256(pin)
    if (legacyHash !== stored) return false
    // Correct PIN — silently upgrade to PBKDF2
    await setDevicePin(pin)
    return true
  }

  // ── PBKDF2 path ──────────────────────────────────────────────────────────
  const saltHex  = stored.slice(0, colonIdx)
  const hashHex  = stored.slice(colonIdx + 1)
  const saltBytes = new Uint8Array(
    (saltHex.match(/../g) ?? []).map((b) => parseInt(b, 16)),
  )
  const { hash } = await _pbkdf2(pin, saltBytes)
  return hash === hashHex
}

export function hasDevicePin(): boolean {
  return !!localStorage.getItem(PIN_HASH_KEY)
}

export function clearDevicePin(): void {
  localStorage.removeItem(PIN_HASH_KEY)
}
