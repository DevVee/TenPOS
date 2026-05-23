/**
 * TenPOS Realtime — thin wrappers around Supabase Realtime channels.
 *
 * Requires Migration 005 to have been run (ALTER PUBLICATION … ADD TABLE).
 * If Realtime is not enabled in the Supabase dashboard for a table,
 * the callback simply never fires — no error, no crash.
 *
 * FIX: each subscribe* function now captures the channel reference in a
 * local variable before the closure is built.  This prevents the stale-closure
 * bug where a subsequent subscribe call would overwrite the module-level
 * variable before the previous cleanup ran, causing the new channel to be
 * accidentally unsubscribed.
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

  // Capture in a local variable so the cleanup closure always refers to THIS
  // specific channel instance, even if subscribeProducts is called again.
  const channel = supabase
    .channel('realtime:products')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onchange)
    .subscribe()

  productChannel = channel

  return () => {
    channel.unsubscribe()
    if (productChannel === channel) productChannel = null
  }
}

// ─── Transactions channel ─────────────────────────────────────────────────────
// Subscribe to new / updated transactions. Useful for the manager dashboard
// to see sales coming in live across terminals.

let txChannel: RealtimeChannel | null = null

export function subscribeTransactions(onchange: Handler): () => void {
  txChannel?.unsubscribe()

  const channel = supabase
    .channel('realtime:transactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, onchange)
    .subscribe()

  txChannel = channel

  return () => {
    channel.unsubscribe()
    if (txChannel === channel) txChannel = null
  }
}

// ─── Stock levels channel ─────────────────────────────────────────────────────
// Subscribe to stock changes. Useful for the dashboard low-stock widget.

let stockChannel: RealtimeChannel | null = null

export function subscribeStock(onchange: Handler): () => void {
  stockChannel?.unsubscribe()

  const channel = supabase
    .channel('realtime:stock_levels')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_levels' }, onchange)
    .subscribe()

  stockChannel = channel

  return () => {
    channel.unsubscribe()
    if (stockChannel === channel) stockChannel = null
  }
}
