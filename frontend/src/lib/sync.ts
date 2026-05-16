import { v4 as uuid } from 'uuid'
import {
  db,
  queueTransaction,
  getPendingTransactions,
  markTransactionSynced,
  markTransactionFailed,
  markTransactionSyncing,
  cacheProducts,
  cacheInventory,
  type CachedProduct,
  type CachedInventory,
} from './db'
import { apiCreateTransaction, apiGetProducts, apiGetInventory } from './api'

const MAX_ATTEMPTS = 5
const SYNC_INTERVAL_MS = 30_000  // check every 30s when online

let syncTimer: ReturnType<typeof setInterval> | null = null
let isSyncing = false

// ─── Listeners so the posStore can react to sync events ───────────────────────
type SyncEvent = 'sync:start' | 'sync:done' | 'sync:failed' | 'offline:queued'
const listeners = new Map<SyncEvent, Set<() => void>>()

export function onSyncEvent(event: SyncEvent, cb: () => void) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(cb)
  return () => listeners.get(event)!.delete(cb)
}

function emit(event: SyncEvent) {
  listeners.get(event)?.forEach((cb) => cb())
}

// ─── Product & inventory cache refresh ────────────────────────────────────────

export async function refreshProductCache() {
  try {
    const res = await apiGetProducts({ limit: '500', active: 'true' })
    const products = (res.data as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      sku: p.sku as string,
      barcode: p.barcode as string | undefined,
      name: p.name as string,
      category_id: p.category_id as string | undefined,
      category_name: p.category_name as string | undefined,
      price: Number(p.price),
      cost: p.cost ? Number(p.cost) : undefined,
      image_url: p.image_url as string | undefined,
      active: Boolean(p.active),
      variants: (p.variants as { id: string; label: string; value: string; price_adjustment: number }[]) ?? [],
      cached_at: Date.now(),
    } satisfies CachedProduct))
    await cacheProducts(products)
    return products
  } catch {
    // offline — return cached
    return db.products.toArray()
  }
}

export async function refreshInventoryCache(branchId?: string) {
  try {
    const rows = await apiGetInventory(branchId) as Record<string, unknown>[]
    const items = rows.map((r) => ({
      id: `${r.product_id}_${r.variant_id ?? 'base'}_${r.branch_id}`,
      product_id: r.product_id as string,
      branch_id: r.branch_id as string,
      variant_id: r.variant_id as string | undefined,
      stock: Number(r.stock),
      reorder_point: Number(r.reorder_point),
      cached_at: Date.now(),
    } satisfies CachedInventory))
    await cacheInventory(items)
    return items
  } catch {
    return db.inventory.toArray()
  }
}

// ─── Offline transaction: create or queue ────────────────────────────────────

export async function submitTransaction(
  payload: Parameters<typeof apiCreateTransaction>[0]
): Promise<{ receipt_no: string; id: string; offline: boolean }> {
  if (navigator.onLine) {
    try {
      const result = await apiCreateTransaction(payload)
      // Update local stock cache immediately after a successful online sale
      for (const item of payload.items) {
        const key = `${item.product_id}_${item.variant_id ?? 'base'}_${payload.branch_id}`
        const cached = await db.inventory.get(key)
        if (cached) {
          await db.inventory.update(key, { stock: Math.max(0, cached.stock - item.quantity) })
        }
      }
      return { ...result, offline: false }
    } catch (err) {
      // Server is online but returned an error (e.g. stock conflict) — don't queue, rethrow
      if (err instanceof Error && !err.message.includes('Failed to fetch')) {
        throw err
      }
      // Network error — fall through to offline queue
    }
  }

  // ── Offline path ─────────────────────────────────────────────────────────
  const localId = uuid()
  await queueTransaction(payload, localId)

  // Optimistically deduct local stock
  for (const item of payload.items) {
    const key = `${item.product_id}_${item.variant_id ?? 'base'}_${payload.branch_id}`
    const cached = await db.inventory.get(key)
    if (cached) {
      await db.inventory.update(key, { stock: Math.max(0, cached.stock - item.quantity) })
    }
  }

  emit('offline:queued')
  return { receipt_no: `OFFLINE-${localId.slice(0, 8).toUpperCase()}`, id: localId, offline: true }
}

// ─── Flush the offline queue ──────────────────────────────────────────────────

export async function flushOfflineQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 }
  const pending = await getPendingTransactions()
  if (!pending.length) return { synced: 0, failed: 0 }

  isSyncing = true
  emit('sync:start')

  let synced = 0
  let failed = 0

  for (const item of pending) {
    if (item.attempts >= MAX_ATTEMPTS) {
      await markTransactionFailed(item.id!, 'Max retry attempts reached', item.attempts)
      failed++
      continue
    }

    await markTransactionSyncing(item.id!)
    try {
      await apiCreateTransaction(item.payload)
      await markTransactionSynced(item.id!)
      synced++
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await markTransactionFailed(item.id!, msg, item.attempts + 1)
      failed++
    }
  }

  isSyncing = false
  emit(failed > 0 ? 'sync:failed' : 'sync:done')
  return { synced, failed }
}

// ─── Background sync loop ────────────────────────────────────────────────────

export function startSyncLoop() {
  stopSyncLoop()

  const trySync = async () => {
    if (navigator.onLine) {
      await flushOfflineQueue()
    }
  }

  window.addEventListener('online', trySync)
  syncTimer = setInterval(trySync, SYNC_INTERVAL_MS)

  // Immediate attempt
  trySync()
}

export function stopSyncLoop() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null }
}

export async function getPendingCount(): Promise<number> {
  return db.offlineQueue.where('status').anyOf(['pending', 'failed']).count()
}
