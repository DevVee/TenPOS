// ─────────────────────────────────────────────────────────────────────────────
// TenPOS Mobile — Offline-first sync engine
//
// Strategy:
//   • PULL:  Supabase → Dexie on login and every 5 minutes
//   • PUSH:  Dexie offlineQueue → Supabase when back online
//   • READS: Always from Dexie (instant, works offline)
//   • WRITES: Dexie first (immediate feedback), then Supabase when online
// ─────────────────────────────────────────────────────────────────────────────

import { Network } from '@capacitor/network'
import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'
import {
  db,
  type CachedProduct,
  type CachedInventory,
  type CachedCategory,
  type CachedVoucher,
  type CachedStaff,
  type LocalTransaction,
  getPendingTransactions,
  markTransactionSynced,
  markTransactionFailed,
  markTransactionSyncing,
} from './db'
import { v4 as uuid } from 'uuid'

// ─── Native network helpers ───────────────────────────────────────────────────

/** Check connectivity — uses Capacitor Network plugin on Android, navigator.onLine on web */
export async function isOnline(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const status = await Network.getStatus()
    return status.connected
  }
  return navigator.onLine
}

// ─── Sync log ─────────────────────────────────────────────────────────────────

const SYNC_LOG_KEY   = 'tenpos_sync_log'
const SYNC_LOG_LIMIT = 200

export type SyncLogEntryType = 'transaction' | 'cache' | 'failed' | 'info'

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

// ─── Event bus ────────────────────────────────────────────────────────────────

type SyncEvent = 'sync:start' | 'sync:done' | 'sync:failed' | 'offline:queued' | 'cache:updated'
const listeners = new Map<SyncEvent, Set<() => void>>()

export function onSyncEvent(event: SyncEvent, cb: () => void) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(cb)
  return () => listeners.get(event)!.delete(cb)
}

function emit(event: SyncEvent) {
  listeners.get(event)?.forEach((cb) => cb())
}

// ─── Pull: Supabase → Dexie ───────────────────────────────────────────────────

export async function refreshProductCache(): Promise<CachedProduct[]> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, barcode, name, category_id, price, cost, image_url, active, categories(name), product_variants(id, label, value, price_adjustment)')
      .eq('active', true)
      .order('name')
      .limit(500)

    if (error) throw error

    const products: CachedProduct[] = ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      id:            p.id as string,
      sku:           p.sku as string,
      barcode:       (p.barcode as string | null) ?? undefined,
      name:          p.name as string,
      category_id:   (p.category_id as string | null) ?? undefined,
      category_name: ((p.categories as { name: string } | null)?.name) ?? '',
      price:         Number(p.price),
      cost:          p.cost ? Number(p.cost) : undefined,
      image_url:     (p.image_url as string | null) ?? undefined,
      active:        Boolean(p.active),
      variants:      (p.product_variants as { id: string; label: string; value: string; price_adjustment: number }[]) ?? [],
      cached_at:     Date.now(),
    }))

    await db.products.bulkPut(products)
    appendSyncLog({ timestamp: Date.now(), type: 'cache', detail: 'Products refreshed', count: products.length })
    emit('cache:updated')
    return products
  } catch (err) {
    appendSyncLog({ timestamp: Date.now(), type: 'failed', detail: `Product sync failed: ${(err as Error).message}` })
    return db.products.toArray()
  }
}

export async function refreshInventoryCache(branchId?: string): Promise<CachedInventory[]> {
  try {
    let q = supabase
      .from('stock_levels')
      .select('id, product_id, branch_id, variant_id, stock, reorder_point')
    if (branchId) q = q.eq('branch_id', branchId)

    const { data, error } = await q
    if (error) throw error

    const items: CachedInventory[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id:            `${r.product_id}_${(r.variant_id as string | null) ?? 'base'}_${r.branch_id}`,
      product_id:    r.product_id as string,
      branch_id:     r.branch_id as string,
      variant_id:    (r.variant_id as string | null) ?? undefined,
      stock:         Number(r.stock),
      reorder_point: Number(r.reorder_point),
      cached_at:     Date.now(),
    }))

    await db.inventory.bulkPut(items)
    appendSyncLog({ timestamp: Date.now(), type: 'cache', detail: 'Inventory refreshed', count: items.length })
    emit('cache:updated')
    return items
  } catch (err) {
    appendSyncLog({ timestamp: Date.now(), type: 'failed', detail: `Inventory sync failed: ${(err as Error).message}` })
    return db.inventory.toArray()
  }
}

export async function refreshCategoriesCache(): Promise<CachedCategory[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, icon')
      .eq('active', true)
      .order('sort_order')
    if (error) throw error

    const cats: CachedCategory[] = ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      id:        c.id as string,
      name:      c.name as string,
      icon:      (c.icon as string | null) ?? undefined,
      cached_at: Date.now(),
    }))

    await db.categories.bulkPut(cats)
    emit('cache:updated')
    return cats
  } catch {
    return db.categories.toArray()
  }
}

export async function refreshVouchersCache(): Promise<CachedVoucher[]> {
  try {
    const { data, error } = await supabase
      .from('vouchers')
      .select('id, code, type, value, min_purchase, max_uses, used_count, active, expires_at')
      .eq('active', true)
    if (error) throw error

    const vouchers: CachedVoucher[] = ((data ?? []) as Record<string, unknown>[]).map((v) => ({
      id:             v.id as string,
      code:           v.code as string,
      discount_type:  v.type as 'percent' | 'fixed',
      discount_value: Number(v.value),
      min_purchase:   Number(v.min_purchase ?? 0),
      max_uses:       Number(v.max_uses ?? 9999),
      used_count:     Number(v.used_count ?? 0),
      active:         Boolean(v.active),
      expires_at:     (v.expires_at as string | null) ?? undefined,
      cached_at:      Date.now(),
    }))

    await db.vouchers.bulkPut(vouchers)
    emit('cache:updated')
    return vouchers
  } catch {
    return db.vouchers.toArray()
  }
}

export async function refreshStaffCache(): Promise<CachedStaff[]> {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('id, auth_id, name, email, role, branch_id, status, sales_count, branches(name)')
      .eq('status', 'active')
    if (error) throw error

    const staff: CachedStaff[] = ((data ?? []) as Record<string, unknown>[]).map((s) => ({
      id:          s.id as string,
      auth_id:     s.auth_id as string,
      name:        s.name as string,
      email:       (s.email as string | null) ?? '',
      role:        s.role as string,
      branch_id:   (s.branch_id as string | null),
      branch_name: ((s.branches as { name: string } | null)?.name) ?? undefined,
      status:      s.status as string,
      sales_count: Number(s.sales_count ?? 0),
      cached_at:   Date.now(),
    }))

    await db.staff.bulkPut(staff)
    emit('cache:updated')
    return staff
  } catch {
    return db.staff.toArray()
  }
}

/** Pull recent transactions from Supabase into Dexie (for offline history) */
export async function refreshTransactionCache(limitDays = 30): Promise<void> {
  try {
    const since = new Date(Date.now() - limitDays * 86400000).toISOString()
    const { data, error } = await supabase
      .from('transactions')
      .select('id, receipt_no, branch_id, staff_id, subtotal, discount, tax, total, amount_tendered, change_given, payment_method, status, void_reason, voided_at, created_at, staff(name), transaction_items(id, product_id, product_name, sku, variant_id, unit_price, quantity, discount, subtotal, note), transaction_payments(method, amount, reference), branches(name)')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) throw error

    const txns: LocalTransaction[] = ((data ?? []) as Record<string, unknown>[]).map((t) => {
      const items = ((t.transaction_items as Record<string, unknown>[]) ?? []).map((i) => ({
        id:           i.id as string,
        product_id:   (i.product_id as string | null) ?? '',
        product_name: i.product_name as string,
        sku:          i.sku as string,
        variant_id:   (i.variant_id as string | null) ?? undefined,
        quantity:     Number(i.quantity),
        unit_price:   Number(i.unit_price),
        discount:     Number(i.discount),
        total:        Number(i.subtotal),
        note:         (i.note as string | null) ?? undefined,
      }))
      const payments = ((t.transaction_payments as Record<string, unknown>[]) ?? []).map((p) => ({
        method:    p.method as string,
        amount:    Number(p.amount),
        reference: (p.reference as string | null) ?? undefined,
      }))
      const status = (t.status as string) === 'refunded' ? 'returned' : (t.status as string)
      return {
        id:             t.id as string,
        receipt_no:     t.receipt_no as string,
        branch_id:      t.branch_id as string,
        branch_name:    ((t.branches as { name: string } | null)?.name) ?? 'Unknown Branch',
        staff_id:       (t.staff_id as string | null) ?? '',
        staff_name:     ((t.staff as { name: string } | null)?.name) ?? 'Staff',
        items,
        payments,
        subtotal:        Number(t.subtotal),
        discount:        Number(t.discount),
        tax:             Number(t.tax),
        total:           Number(t.total),
        change:          Number(t.change_given),
        payment_method:  t.payment_method as string,
        status:          status as 'completed' | 'voided' | 'returned',
        void_reason:     (t.void_reason as string | null) ?? undefined,
        voided_at:       (t.voided_at as string | null) ?? undefined,
        created_at:      t.created_at as string,
        is_offline:      false,
        synced:          true,
      }
    })

    // Only replace synced transactions; keep any is_offline=true ones
    const offlineTxns = await db.transactions.filter((t) => t.is_offline === true).toArray()
    await db.transactions.bulkPut([...txns, ...offlineTxns])
    appendSyncLog({ timestamp: Date.now(), type: 'cache', detail: 'Transactions refreshed', count: txns.length })
    emit('cache:updated')
  } catch (err) {
    appendSyncLog({ timestamp: Date.now(), type: 'failed', detail: `Transaction sync failed: ${(err as Error).message}` })
  }
}

// ─── Full pull: run all caches ────────────────────────────────────────────────

export async function pullAll(branchId?: string): Promise<void> {
  emit('sync:start')
  await Promise.all([
    refreshProductCache(),
    refreshInventoryCache(branchId),
    refreshCategoriesCache(),
    refreshVouchersCache(),
    refreshStaffCache(),
    refreshTransactionCache(30),
  ])
  emit('sync:done')
}

// ─── Push: submit transaction ─────────────────────────────────────────────────

export async function submitTransaction(
  payload: {
    branch_id: string
    items: { product_id: string; variant_id?: string; quantity: number; unit_price: number; discount: number; note?: string }[]
    payments: { method: string; amount: number; reference?: string }[]
    discount: number
    voucher_code?: string
  }
): Promise<{ receipt_no: string; id: string; offline: boolean }> {
  const online = await isOnline()

  if (online) {
    // Generate a stable key before the try block so retries on network failure
    // hit the idempotency guard instead of creating duplicate transactions.
    const onlineKey = uuid()
    try {
      const { data, error } = await supabase.rpc('create_transaction', {
        p_branch_id:       payload.branch_id,
        p_items:           payload.items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          quantity:   i.quantity,
          discount:   i.discount,
          note:       i.note ?? null,
        })),
        p_payments:        payload.payments.map((p) => ({
          method:    p.method,
          amount:    p.amount,
          reference: p.reference ?? null,
        })),
        p_discount:        payload.discount,
        p_voucher_code:    payload.voucher_code ?? null,
        p_idempotency_key: onlineKey,
      })

      if (error) throw error

      const result = data as { id: string; receipt_no: string; total: number }

      // Keep local stock in sync immediately
      await _deductLocalStock(payload)

      // Save to local transaction cache
      await _saveLocalTransaction(result.id, result.receipt_no, payload, false)

      appendSyncLog({
        timestamp: Date.now(),
        type: 'transaction',
        detail: `Online: ${result.receipt_no} submitted`,
        count: payload.items.reduce((s, i) => s + i.quantity, 0),
      })
      emit('sync:done')
      return { id: result.id, receipt_no: result.receipt_no, offline: false }
    } catch (err) {
      // Fall through to offline queue if RPC fails
      console.warn('[TenPOS] Online submit failed, queuing offline:', err)
    }
  }

  // ── Offline path: queue locally ────────────────────────────────────────────
  const localId    = uuid()
  // Append 4 chars of the UUID to prevent millisecond collisions across devices
  const receiptNo  = `OFF-${Date.now().toString(36).toUpperCase()}-${localId.slice(0, 4).toUpperCase()}`

  await db.offlineQueue.add({
    localId,
    payload,
    status: 'pending',
    attempts: 0,
    created_at: Date.now(),
  })

  // Optimistically deduct stock from Dexie
  await _deductLocalStock(payload)

  // Save to local transaction cache for offline history
  await _saveLocalTransaction(localId, receiptNo, payload, true)

  appendSyncLog({
    timestamp: Date.now(),
    type: 'transaction',
    detail: `Offline queued: ${receiptNo}`,
    count: payload.items.reduce((s, i) => s + i.quantity, 0),
  })
  emit('offline:queued')
  return { id: localId, receipt_no: receiptNo, offline: true }
}

async function _deductLocalStock(payload: { branch_id: string; items: { product_id: string; variant_id?: string; quantity: number }[] }) {
  for (const item of payload.items) {
    const key = `${item.product_id}_${item.variant_id ?? 'base'}_${payload.branch_id}`
    const cached = await db.inventory.get(key)
    if (cached) {
      await db.inventory.update(key, { stock: Math.max(0, cached.stock - item.quantity) })
    }
  }
}

async function _saveLocalTransaction(
  id: string,
  receipt_no: string,
  payload: Parameters<typeof submitTransaction>[0],
  is_offline: boolean
) {
  // Get staff from current Supabase session
  const { data: { session } } = await supabase.auth.getSession()
  const authId = session?.user?.id ?? ''
  const staffRow = authId ? await db.staff.where('auth_id').equals(authId).first() : null

  // Get product names from Dexie
  const productIds = [...new Set(payload.items.map((i) => i.product_id))]
  const products   = await db.products.bulkGet(productIds)
  const prodMap    = new Map(products.filter(Boolean).map((p) => [p!.id, p!]))

  const subtotal = payload.items.reduce((s, i) => s + i.unit_price * i.quantity - i.discount, 0)
  const total    = Math.max(0, subtotal - payload.discount)
  const cashAmt  = payload.payments.find((p) => p.method === 'cash')?.amount ?? total
  const change   = Math.max(0, cashAmt - total)

  const txn: LocalTransaction = {
    id,
    receipt_no,
    branch_id:      payload.branch_id,
    branch_name:    staffRow?.branch_name ?? 'Unknown Branch',
    staff_id:       staffRow?.id ?? '',
    staff_name:     staffRow?.name ?? 'Cashier',
    items: payload.items.map((item, idx) => {
      const prod = prodMap.get(item.product_id)
      return {
        id:           `${id}-item-${idx}`,
        product_id:   item.product_id,
        product_name: prod?.name ?? item.product_id,
        sku:          prod?.sku ?? '',
        variant_id:   item.variant_id,
        quantity:     item.quantity,
        unit_price:   item.unit_price,
        discount:     item.discount,
        total:        item.unit_price * item.quantity - item.discount,
        note:         item.note,
      }
    }),
    payments:        payload.payments,
    subtotal,
    discount:        payload.discount,
    tax:             0,
    total,
    change,
    payment_method:  payload.payments[0]?.method ?? 'cash',
    status:          'completed',
    created_at:      new Date().toISOString(),
    is_offline,
    synced:          !is_offline,
  }

  await db.transactions.put(txn)
}

// ─── Flush offline queue → Supabase ──────────────────────────────────────────

export async function flushOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingTransactions()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  emit('sync:start')
  let synced = 0
  let failed = 0

  for (const txn of pending) {
    if (txn.id === undefined) continue
    await markTransactionSyncing(txn.id)

    try {
      // Pass localId as the idempotency key so that if the app crashes and
      // retries, the server returns the already-created result instead of
      // creating a duplicate transaction.
      const { data, error } = await supabase.rpc('create_transaction', {
        p_branch_id:       txn.payload.branch_id,
        p_items:           txn.payload.items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          quantity:   i.quantity,
          discount:   i.discount,
          note:       i.note ?? null,
        })),
        p_payments:        txn.payload.payments.map((p) => ({
          method:    p.method,
          amount:    p.amount,
          reference: p.reference ?? null,
        })),
        p_discount:        txn.payload.discount,
        p_voucher_code:    txn.payload.voucher_code ?? null,
        p_idempotency_key: txn.localId,   // ← idempotency key = stable offline UUID
      })

      if (error) throw error

      const result = data as { id: string; receipt_no: string }
      await markTransactionSynced(txn.id)

      // Remove from queue — no unbounded growth
      await db.offlineQueue.delete(txn.id)

      // Update local transaction cache: replace localId with real Supabase ID
      const localTxn = await db.transactions.get(txn.localId)
      if (localTxn) {
        await db.transactions.delete(txn.localId)
        await db.transactions.put({
          ...localTxn,
          id:         result.id,
          receipt_no: result.receipt_no,
          is_offline: false,
          synced:     true,
        })
      }

      appendSyncLog({
        timestamp: Date.now(),
        type: 'transaction',
        detail: `Synced offline txn → ${result.receipt_no}`,
      })
      synced++
    } catch (err) {
      const attempts = (txn.attempts ?? 0) + 1
      await markTransactionFailed(txn.id, (err as Error).message, attempts)
      appendSyncLog({
        timestamp: Date.now(),
        type: 'failed',
        detail: `Failed to sync ${txn.localId}: ${(err as Error).message}`,
      })
      failed++
    }
  }

  emit(failed === 0 ? 'sync:done' : 'sync:failed')
  return { synced, failed }
}

// ─── Pending count ─────────────────────────────────────────────────────────────

export async function getPendingCount(): Promise<number> {
  return db.offlineQueue.where('status').anyOf(['pending', 'failed']).count()
}

// ─── Sync loop ────────────────────────────────────────────────────────────────

let _syncTimer: ReturnType<typeof setInterval> | null = null
let _syncRunning = false
// Native Capacitor network listener handle (Android only)
let _nativeNetworkListener: { remove: () => Promise<void> } | null = null

async function _onOnline() {
  appendSyncLog({ timestamp: Date.now(), type: 'info', detail: 'Back online — flushing queue & refreshing cache' })
  await flushOfflineQueue()
  await pullAll()
}

/**
 * Start the background sync loop.
 * @param branchId     Optional branch to scope inventory pulls
 * @param intervalMs   Polling interval in milliseconds (default: 5 minutes).
 *                     Pass `useSettingsStore.getState().autoSyncInterval * 1000` from App.tsx.
 */
export function startSyncLoop(branchId?: string, intervalMs = 5 * 60 * 1000) {
  if (_syncRunning) return   // idempotent — safe to call multiple times
  _syncRunning = true

  // Initial pull if online
  void isOnline().then((online) => {
    if (online) void pullAll(branchId)
  })

  // Network change listener — native (Capacitor) or web fallback
  if (Capacitor.isNativePlatform()) {
    void Network.addListener('networkStatusChange', (status) => {
      if (status.connected) void _onOnline()
    }).then((handle) => { _nativeNetworkListener = handle })
  } else {
    window.addEventListener('online', _onOnline)
  }

  // Periodic pull at configured interval
  _syncTimer = setInterval(async () => {
    if (await isOnline()) {
      await flushOfflineQueue()
      await refreshProductCache()
      await refreshInventoryCache(branchId)
      await refreshTransactionCache(30)
    }
  }, intervalMs)

  appendSyncLog({ timestamp: Date.now(), type: 'info', detail: `Sync loop started (interval: ${intervalMs / 1000}s)` })
}

export function stopSyncLoop() {
  if (!_syncRunning) return
  _syncRunning = false

  if (Capacitor.isNativePlatform()) {
    void _nativeNetworkListener?.remove()
    _nativeNetworkListener = null
  } else {
    window.removeEventListener('online', _onOnline)
  }

  if (_syncTimer !== null) {
    clearInterval(_syncTimer)
    _syncTimer = null
  }
  appendSyncLog({ timestamp: Date.now(), type: 'info', detail: 'Sync loop stopped' })
}
