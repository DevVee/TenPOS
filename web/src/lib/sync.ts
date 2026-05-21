// Activity log + transaction submission for the web (online-only).
// Dexie/IndexedDB is intentionally NOT used here — that layer belongs only in
// the Android APK. The web always reads/writes directly to Supabase.

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
  } catch { /* ignore storage errors */ }
}

export function getSyncLog(): SyncLogEntry[] {
  try { return JSON.parse(localStorage.getItem(SYNC_LOG_KEY) ?? '[]') } catch { return [] }
}

export function clearSyncLog() { localStorage.removeItem(SYNC_LOG_KEY) }

// ─── Minimal event bus (kept for Realtime subscription callbacks) ─────────────

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

// ─── Cache refresh (fetches from Supabase + logs the event) ──────────────────
// Used by SyncLog "Refresh" button to force a re-pull and record it in the log.

export async function refreshProductCache() {
  try {
    const { data, total } = await apiGetProducts({ limit: '500', active: 'true' })
    appendSyncLog({
      timestamp: Date.now(),
      type: 'cache',
      detail: 'Products refreshed from Supabase',
      count: total,
    })
    return data
  } catch {
    appendSyncLog({ timestamp: Date.now(), type: 'failed', detail: 'Product refresh failed' })
    return []
  }
}

export async function refreshInventoryCache(branchId?: string) {
  try {
    const rows = await apiGetInventory(branchId)
    appendSyncLog({
      timestamp: Date.now(),
      type: 'cache',
      detail: 'Inventory refreshed from Supabase',
      count: rows.length,
    })
    return rows
  } catch {
    appendSyncLog({ timestamp: Date.now(), type: 'failed', detail: 'Inventory refresh failed' })
    return []
  }
}

// ─── Transaction submission ───────────────────────────────────────────────────

export async function submitTransaction(
  payload: Parameters<typeof apiCreateTransaction>[0]
): Promise<{ receipt_no: string; id: string; offline: boolean }> {
  const result = await apiCreateTransaction(payload)
  appendSyncLog({
    timestamp: Date.now(),
    type: 'transaction',
    detail: `Transaction ${result.receipt_no} submitted`,
    count: payload.items.reduce((s, i) => s + i.quantity, 0),
  })
  emit('sync:done')
  return { ...result, offline: false }
}

// ─── No-op stubs (kept for import compatibility) ──────────────────────────────

export function startSyncLoop() { /* online-only: no background polling needed */ }
export function stopSyncLoop()  { /* no-op */ }
export async function getPendingCount(): Promise<number> { return 0 }
export async function flushOfflineQueue() { return { synced: 0, failed: 0 } }
