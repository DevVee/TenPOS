// ============================================================
// @tenpos/shared — App-wide Constants
// ============================================================

// ─── Currency ─────────────────────────────────────────────────────────────────

export const CURRENCY        = 'PHP'
export const CURRENCY_SYMBOL = '₱'

// ─── Tax ──────────────────────────────────────────────────────────────────────

/** VAT rate as a percentage (e.g. 12 means 12%) */
export const DEFAULT_VAT_RATE    = 12
/** Multiplier to compute VAT-inclusive total (e.g. 1.12 for 12% VAT) */
export const DEFAULT_VAT_MULTIPLIER = 1.12

// ─── User roles ───────────────────────────────────────────────────────────────

export const USER_ROLES = ['admin', 'manager', 'cashier', 'viewer'] as const

// ─── Payment methods ──────────────────────────────────────────────────────────

export const PAYMENT_METHODS = ['cash', 'gcash', 'paymaya', 'card'] as const

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:    'Cash',
  gcash:   'GCash',
  paymaya: 'PayMaya',
  card:    'Credit/Debit Card',
}

// ─── Transaction / Sync statuses ─────────────────────────────────────────────

export const TRANSACTION_STATUSES = ['completed', 'voided', 'refunded'] as const
export const SYNC_STATUSES        = ['synced', 'pending', 'failed']     as const

// ─── localStorage / AsyncStorage keys ───────────────────────────────────────
// Centralised so web (localStorage) and mobile (AsyncStorage) use the same keys

export const STORAGE_KEYS = {
  categories:   'tenpos_categories',
  products:     'tenpos_products',
  inventory:    'tenpos_inventory',
  transactions: 'tenpos_transactions',
  users:        'tenpos_users',
  branches:     'tenpos_branches',
  vouchers:     'tenpos_vouchers',
  adjustments:  'tenpos_adjustments',
  audit:        'tenpos_audit',
  settings:     'tenpos_settings',
  syncLog:      'tenpos_sync_log',
  theme:        'tenpos-theme',
  authToken:    'tenpos_token',
  refreshToken: 'tenpos_refresh',
} as const

export const SYNC_LOG_LIMIT = 200

// ─── Pagination ───────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 20

// ─── Low stock ────────────────────────────────────────────────────────────────

export const DEFAULT_LOW_STOCK_THRESHOLD = 5

// ─── Locale ───────────────────────────────────────────────────────────────────

export const DEFAULT_LOCALE   = 'en-PH'
export const DEFAULT_TIMEZONE = 'Asia/Manila'
