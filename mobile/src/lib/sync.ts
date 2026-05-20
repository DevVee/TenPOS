// Local-first sync — no server. Products and inventory come from localStorage via api.ts.

import { db, type CachedProduct, type CachedInventory } from './db'
import { apiCreateTransaction, apiGetProducts, apiGetInventory } from './api'

// ─── Sync log (localStorage) ──────────────────────────────────────────────────

const SYNC_LOG_KEY   = 'tenpos_sync_log'
const SYNC_LOG_LIMIT = 200

export type SyncLogEntryType = 'transaction' | 'cache' | 'failed'

export interface SyncLogEntry {
  id: string
  timestamp: number
  type: SyncLogEntryType
  detail: string
  count?: number
}

function appendSyncLog(entry: Omit<SyncLogEntry, 'id'>) {
  try {
    const log: SyncLogEntry[] = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) ?? '[]')
    log.unshift({ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
    if (log.length > SYNC_LOG_LIMIT) log.length = SYNC_LOG_LIMIT
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(log))
  } catch { /* ignore write errors */ }
}

export function getSyncLog(): SyncLogEntry[] {
  try { return JSON.parse(localStorage.getItem(SYNC_LOG_KEY) ?? '[]') } catch { return [] }
}

export function clearSyncLog() { localStorage.removeItem(SYNC_LOG_KEY) }

// ─── Event bus so posStore can react to cache refreshes ──────────────────────

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

// ─── Seed Dexie from localStorage data ───────────────────────────────────────

export async function refreshProductCache() {
  try {
    const res = await apiGetProducts({ limit: '500', active: 'true' })
    const products = (res.data as unknown as Record<string, unknown>[]).map((p) => ({
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
    await db.products.bulkPut(products)
    appendSyncLog({ timestamp: Date.now(), type: 'cache', detail: 'Products cache refreshed', count: products.length })
    return products
  } catch {
    appendSyncLog({ timestamp: Date.now(), type: 'failed', detail: 'Product cache refresh failed' })
    return db.products.toArray()
  }
}

export async function refreshInventoryCache(branchId?: string) {
  try {
    const rows = await apiGetInventory(branchId) as unknown as Record<string, unknown>[]
    const items = rows.map((r) => ({
      id: `${r.product_id}_${r.variant_id ?? 'base'}_${r.branch_id}`,
      product_id: r.product_id as string,
      branch_id: r.branch_id as string,
      variant_id: r.variant_id as string | undefined,
      stock: Number(r.stock),
      reorder_point: Number(r.reorder_point),
      cached_at: Date.now(),
    } satisfies CachedInventory))
    await db.inventory.bulkPut(items)
    appendSyncLog({ timestamp: Date.now(), type: 'cache', detail: 'Inventory cache refreshed', count: items.length })
    return items
  } catch {
    appendSyncLog({ timestamp: Date.now(), type: 'failed', detail: 'Inventory cache refresh failed' })
    return db.inventory.toArray()
  }
}

// ─── Transaction submission (always local, always "online") ──────────────────

export async function submitTransaction(
  payload: Parameters<typeof apiCreateTransaction>[0]
): Promise<{ receipt_no: string; id: string; offline: boolean }> {
  const result = await apiCreateTransaction(payload)
  // Keep Dexie stock in sync with localStorage
  for (const item of payload.items) {
    const key = `${item.product_id}_${item.variant_id ?? 'base'}_${payload.branch_id}`
    const cached = await db.inventory.get(key)
    if (cached) {
      await db.inventory.update(key, { stock: Math.max(0, cached.stock - item.quantity) })
    }
  }
  appendSyncLog({
    timestamp: Date.now(),
    type: 'transaction',
    detail: `Transaction ${result.receipt_no} submitted`,
    count: payload.items.reduce((s, i) => s + i.quantity, 0),
  })
  emit('sync:done')
  return { ...result, offline: false }
}

// ─── No-op loop (local-first needs no background sync) ───────────────────────

export function startSyncLoop() { /* local-first: no server sync needed */ }
export function stopSyncLoop()  { /* no-op */ }
export async function getPendingCount(): Promise<number> { return 0 }

// ─── Kept for legacy import compatibility ─────────────────────────────────────
export async function flushOfflineQueue() { return { synced: 0, failed: 0 } }
