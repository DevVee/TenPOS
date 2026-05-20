/**
 * TenPOS Realtime — thin wrappers around Supabase Realtime channels.
 *
 * Requires Migration 005 to have been run (ALTER PUBLICATION … ADD TABLE).
 * If Realtime is not enabled in the Supabase dashboard for a table,
 * the callback simply never fires — no error, no crash.
 */

import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

type Handler = () => void

// ─── Products channel ─────────────────────────────────────────────────────────
// Subscribe to product INSERT / UPDATE / DELETE. Useful for the POS terminal
// so cashiers see new products added by the manager without refreshing.

let productChannel: RealtimeChannel | null = null

export function subscribeProducts(onchange: Handler): () => void {
  productChannel?.unsubscribe()
  productChannel = supabase
    .channel('realtime:products')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onchange)
    .subscribe()
  return () => { productChannel?.unsubscribe(); productChannel = null }
}

// ─── Transactions channel ─────────────────────────────────────────────────────
// Subscribe to new / updated transactions. Useful for the manager dashboard
// to see sales coming in live across terminals.

let txChannel: RealtimeChannel | null = null

export function subscribeTransactions(onchange: Handler): () => void {
  txChannel?.unsubscribe()
  txChannel = supabase
    .channel('realtime:transactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onchange)
    .subscribe()
  return () => { txChannel?.unsubscribe(); txChannel = null }
}

// ─── Stock levels channel ─────────────────────────────────────────────────────
// Subscribe to stock changes. Useful for the dashboard low-stock widget.

let stockChannel: RealtimeChannel | null = null

export function subscribeStock(onchange: Handler): () => void {
  stockChannel?.unsubscribe()
  stockChannel = supabase
    .channel('realtime:stock_levels')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_levels' }, onchange)
    .subscribe()
  return () => { stockChannel?.unsubscribe(); stockChannel = null }
}
