/**
 * TenPOS Mobile — Supabase Realtime
 *
 * On mobile, realtime events don't just call a UI callback — they also
 * refresh the relevant Dexie cache so offline reads stay current.
 *
 * Falls back gracefully: if the Supabase dashboard hasn't enabled Realtime
 * for a table the subscription simply never fires — no error, no crash.
 */

import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  refreshProductCache,
  refreshInventoryCache,
  refreshTransactionCache,
  refreshCategoriesCache,
  refreshStaffCache,
  refreshVouchersCache,
} from './sync'

type Handler = () => void

// ─── Products channel ─────────────────────────────────────────────────────────

let productChannel: RealtimeChannel | null = null

export function subscribeProducts(onchange: Handler): () => void {
  productChannel?.unsubscribe()
  productChannel = supabase
    .channel('realtime:products')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
      await refreshProductCache()
      onchange()
    })
    .subscribe()
  return () => { productChannel?.unsubscribe(); productChannel = null }
}

// ─── Transactions channel ─────────────────────────────────────────────────────

let txChannel: RealtimeChannel | null = null

export function subscribeTransactions(onchange: Handler): () => void {
  txChannel?.unsubscribe()
  txChannel = supabase
    .channel('realtime:transactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, async () => {
      await refreshTransactionCache(30)
      onchange()
    })
    .subscribe()
  return () => { txChannel?.unsubscribe(); txChannel = null }
}

// ─── Stock levels channel ─────────────────────────────────────────────────────

let stockChannel: RealtimeChannel | null = null

export function subscribeStock(onchange: Handler): () => void {
  stockChannel?.unsubscribe()
  stockChannel = supabase
    .channel('realtime:stock_levels')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_levels' }, async () => {
      await refreshInventoryCache()
      onchange()
    })
    .subscribe()
  return () => { stockChannel?.unsubscribe(); stockChannel = null }
}

// ─── Categories channel ───────────────────────────────────────────────────────

let catChannel: RealtimeChannel | null = null

export function subscribeCategories(onchange: Handler): () => void {
  catChannel?.unsubscribe()
  catChannel = supabase
    .channel('realtime:categories')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, async () => {
      await refreshCategoriesCache()
      onchange()
    })
    .subscribe()
  return () => { catChannel?.unsubscribe(); catChannel = null }
}

// ─── Staff channel ────────────────────────────────────────────────────────────

let staffChannel: RealtimeChannel | null = null

export function subscribeStaff(onchange: Handler): () => void {
  staffChannel?.unsubscribe()
  staffChannel = supabase
    .channel('realtime:staff')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, async () => {
      await refreshStaffCache()
      onchange()
    })
    .subscribe()
  return () => { staffChannel?.unsubscribe(); staffChannel = null }
}

// ─── Vouchers channel ─────────────────────────────────────────────────────────

let voucherChannel: RealtimeChannel | null = null

export function subscribeVouchers(onchange: Handler): () => void {
  voucherChannel?.unsubscribe()
  voucherChannel = supabase
    .channel('realtime:vouchers')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vouchers' }, async () => {
      await refreshVouchersCache()
      onchange()
    })
    .subscribe()
  return () => { voucherChannel?.unsubscribe(); voucherChannel = null }
}

// ─── Unsubscribe all ──────────────────────────────────────────────────────────

export function unsubscribeAll() {
  productChannel?.unsubscribe();  productChannel  = null
  txChannel?.unsubscribe();       txChannel       = null
  stockChannel?.unsubscribe();    stockChannel    = null
  catChannel?.unsubscribe();      catChannel      = null
  staffChannel?.unsubscribe();    staffChannel    = null
  voucherChannel?.unsubscribe();  voucherChannel  = null
}
