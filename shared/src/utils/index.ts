// ============================================================
// @tenpos/shared — Pure Utility Functions
// No platform-specific code. Works in web + React Native.
// ============================================================

import type { CartItem } from '../types/index.js'
import {
  CURRENCY_SYMBOL,
  DEFAULT_VAT_MULTIPLIER,
  DEFAULT_VAT_RATE,
  SYNC_LOG_LIMIT,
  STORAGE_KEYS,
} from '../constants/index.js'

// ─── Currency formatting ──────────────────────────────────────────────────────

/**
 * Format a number as Philippine Peso (or any currency symbol).
 * e.g. formatCurrency(1234.5) → "₱1,234.50"
 */
export function formatCurrency(
  amount: number,
  symbol: string = CURRENCY_SYMBOL
): string {
  return `${symbol}${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/**
 * Format a number as a percentage string.
 * e.g. formatPercent(12) → "12%"
 */
export function formatPercent(value: number): string {
  return `${value}%`
}

// ─── Cart calculations ────────────────────────────────────────────────────────

/**
 * Calculate cart subtotal (before VAT, after per-item discounts).
 */
export function calcSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => {
    const price = item.product.price + (item.variant?.priceAdjustment ?? 0)
    return sum + price * item.quantity - item.discount
  }, 0)
}

/**
 * Calculate VAT amount from a subtotal.
 * vatRate is a percentage (e.g. 12 for 12%).
 */
export function calcTax(subtotal: number, vatRate: number = DEFAULT_VAT_RATE): number {
  return subtotal * (vatRate / 100)
}

/**
 * Calculate VAT-inclusive total after applying a cart-level discount.
 */
export function calcTotal(
  subtotal: number,
  discountAmount: number = 0,
  vatMultiplier: number = DEFAULT_VAT_MULTIPLIER
): number {
  return (subtotal - discountAmount) * vatMultiplier
}

/**
 * Calculate change given tendered amount and total due.
 */
export function calcChange(tendered: number, total: number): number {
  return Math.max(0, tendered - total)
}

// ─── Voucher calculation ──────────────────────────────────────────────────────

/**
 * Calculate discount amount for a voucher.
 */
export function calcVoucherDiscount(
  type: 'percent' | 'fixed',
  value: number,
  orderTotal: number
): number {
  return type === 'percent' ? orderTotal * (value / 100) : value
}

// ─── Receipt number ───────────────────────────────────────────────────────────

/**
 * Generate a receipt number in the format: TXN-YYYYMMDD-XXXX
 * e.g. TXN-20260520-4F2A
 */
export function generateReceiptNo(): string {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `TXN-${date}-${rand}`
}

// ─── Avatar / name helpers ────────────────────────────────────────────────────

/**
 * Generate 2-letter initials from a full name.
 * e.g. "Juan dela Cruz" → "JD"
 */
export function getAvatarInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// ─── ID generation ────────────────────────────────────────────────────────────

/**
 * Generate a simple unique ID using timestamp + random suffix.
 * Works in web and React Native without any library.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ─── Date / time helpers ──────────────────────────────────────────────────────

/**
 * Format a date string or Date object for display.
 * e.g. formatDate('2026-05-20') → "May 20, 2026"
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

/**
 * Format a timestamp for display in sync logs.
 * e.g. 1716220800000 → "May 20, 2026, 10:00 PM"
 */
export function formatTimestamp(ts: number): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts))
}

// ─── Sync log helpers (platform-agnostic logic) ───────────────────────────────

import type { SyncLogEntry, SyncLogEntryType } from '../types/index.js'

/** Build a new SyncLogEntry object (without persisting it). */
export function buildSyncLogEntry(
  type: SyncLogEntryType,
  detail: string,
  count?: number
): SyncLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    type,
    detail,
    count,
  }
}

/** Prepend a new entry to an existing array, respecting the max limit. */
export function appendToSyncLog(
  log: SyncLogEntry[],
  entry: SyncLogEntry,
  limit: number = SYNC_LOG_LIMIT
): SyncLogEntry[] {
  const next = [entry, ...log]
  if (next.length > limit) next.length = limit
  return next
}

// Re-export constants so callers can do a single import
export { STORAGE_KEYS }
