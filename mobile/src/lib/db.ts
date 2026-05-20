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
  id: string            // product_id + branch_id composite key
  product_id: string
  branch_id: string
  variant_id?: string
  stock: number
  reorder_point: number
  cached_at: number
}

// ─── Dexie database ───────────────────────────────────────────────────────────
class TenPOSDatabase extends Dexie {
  offlineQueue!: Table<OfflineTransaction, number>
  products!: Table<CachedProduct, string>
  inventory!: Table<CachedInventory, string>

  constructor() {
    super('tenpos_offline')
    this.version(1).stores({
      offlineQueue: '++id, localId, status, created_at',
      products:     'id, sku, barcode, category_id, active',
      inventory:    'id, product_id, branch_id',
    })
  }
}

export const db = new TenPOSDatabase()

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

export async function cacheProducts(products: CachedProduct[]) {
  return db.products.bulkPut(products.map((p) => ({ ...p, cached_at: Date.now() })))
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  return db.products.where('active').equals(1).toArray()
}

export async function cacheInventory(items: CachedInventory[]) {
  return db.inventory.bulkPut(items.map((i) => ({ ...i, cached_at: Date.now() })))
}

export async function getCachedStock(productId: string, branchId: string, variantId?: string) {
  const id = `${productId}_${variantId ?? 'base'}_${branchId}`
  return db.inventory.get(id)
}
