// ─────────────────────────────────────────────────────────────────────────────
// TenPOS — Backup utility
// Exports all operational data as a branded multi-sheet .xlsx file.
// Auto-backup preference and last-run metadata are stored in localStorage.
// ─────────────────────────────────────────────────────────────────────────────

import {
  apiGetProducts,
  apiGetCategories,
  apiGetStaff,
  apiGetTransactions,
  apiGetVouchers,
} from './api'
import { downloadXLSX } from './xlsxExport'

const BACKUP_KEY           = 'tenpos_last_backup'
const AUTO_BACKUP_KEY      = 'tenpos_auto_backup'
const BACKUP_INTERVAL_DAYS = 7

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BackupMeta {
  date: string       // ISO string of when the backup was taken
  filename: string   // e.g. tenpos-backup-2026-05-22.xlsx
  records: number    // total rows exported
  tables: {
    transactions: number
    products:     number
    categories:   number
    staff:        number
    vouchers:     number
  }
}

// ── localStorage helpers ──────────────────────────────────────────────────────

export function getLastBackup(): BackupMeta | null {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) ?? 'null') }
  catch { return null }
}

function setLastBackup(meta: BackupMeta) {
  localStorage.setItem(BACKUP_KEY, JSON.stringify(meta))
}

export function isAutoBackupEnabled(): boolean {
  return localStorage.getItem(AUTO_BACKUP_KEY) === 'true'
}

export function setAutoBackupEnabled(enabled: boolean) {
  localStorage.setItem(AUTO_BACKUP_KEY, String(enabled))
}

/** Days since last backup, or null if never backed up. */
export function daysSinceLastBackup(): number | null {
  const last = getLastBackup()
  if (!last) return null
  return Math.floor((Date.now() - new Date(last.date).getTime()) / 86_400_000)
}

/** True when auto-backup is on and the weekly interval has elapsed. */
export function isAutoBackupDue(): boolean {
  if (!isAutoBackupEnabled()) return false
  const days = daysSinceLastBackup()
  return days === null || days >= BACKUP_INTERVAL_DAYS
}

// ── Core backup runner ────────────────────────────────────────────────────────

export async function runBackup(): Promise<BackupMeta> {
  const now     = new Date()
  const dateStr = now.toISOString().slice(0, 10)

  // Fetch all tables in parallel
  const [txnRes, productsRes, categories, staffRes, vouchersRes] = await Promise.all([
    apiGetTransactions({ limit: '99999', sort: 'desc' }) as Promise<{
      data: Array<{
        id: string; receipt_no: string; created_at: string; staff_name: string
        subtotal: number; discount: number; total: number
        payment_method: string; status: string
        items: Array<{ product_name: string; quantity: number; unit_price: number; total: number }>
      }>
    }>,
    apiGetProducts({ limit: '99999' }) as unknown as Promise<{
      data: Array<{
        id: string; product_name: string; sku: string; category_name: string
        price: number; cost: number; stock: number; reorder_point: number; active: boolean
      }>
    }>,
    apiGetCategories() as Promise<Array<{ id: string; name: string; description?: string }>>,
    apiGetStaff({ limit: '9999' }) as Promise<{
      data: Array<{ id: string; name: string; email: string; role: string; branch: string; status: string; created_at: string }>
    }>,
    apiGetVouchers({ limit: '9999' }) as unknown as Promise<{
      data: Array<{
        id: string; code: string; discount_type: string; discount_value: number
        min_purchase: number; max_uses: number; used_count: number
        active: boolean; expires_at?: string; created_at: string
      }>
    }>,
  ])

  const transactions = txnRes.data      ?? []
  const products     = productsRes.data ?? []
  const staff        = staffRes.data    ?? []
  const vouchers     = vouchersRes.data ?? []
  const cats         = Array.isArray(categories) ? categories : []

  // Flatten transaction line items for the Items sheet
  const lineItems = transactions.flatMap((t) =>
    (t.items ?? []).map((item) => ({ ...item, receipt_no: t.receipt_no, date: t.created_at }))
  )

  const tables = {
    transactions: transactions.length,
    products:     products.length,
    categories:   cats.length,
    staff:        staff.length,
    vouchers:     vouchers.length,
  }
  const totalRecords = Object.values(tables).reduce((a, b) => a + b, 0)
  const filename     = `TenPOS-Backup-${dateStr}.xlsx`

  // ── Build multi-sheet workbook ────────────────────────────────────────────

  downloadXLSX(
    `TenPOS-Backup-${dateStr}`,
    [
      // ── Sheet 1: Summary ─────────────────────────────────────────────────
      {
        name: 'Backup Summary',
        columns: [
          { header: 'Field',  width: 28 },
          { header: 'Value',  width: 36 },
        ],
        rows: [
          ['Application',       'TenPOS — Ten Foundation Philippines Inc.'],
          ['Backup Date',       now.toLocaleString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })],
          ['Total Records',     totalRecords],
          ['', ''],
          ['Transactions',      transactions.length],
          ['Transaction Items', lineItems.length],
          ['Products',          products.length],
          ['Categories',        cats.length],
          ['Staff Members',     staff.length],
          ['Vouchers',          vouchers.length],
        ],
      },

      // ── Sheet 2: Transactions ────────────────────────────────────────────
      {
        name: 'Transactions',
        columns: [
          { header: 'Receipt #',      width: 16 },
          { header: 'Date',           type: 'date',   width: 14 },
          { header: 'Time',           width: 10 },
          { header: 'Cashier',        width: 24 },
          { header: 'Subtotal',       type: 'money',  width: 16 },
          { header: 'Discount',       type: 'money',  width: 14 },
          { header: 'Total',          type: 'money',  width: 16, bold: true },
          { header: 'Payment Method', width: 18 },
          { header: 'Status',         width: 12 },
        ],
        rows: transactions.map((t) => [
          t.receipt_no,
          new Date(t.created_at).toLocaleDateString('en-PH'),
          new Date(t.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          t.staff_name,
          Number(t.subtotal ?? 0),
          Number(t.discount ?? 0),
          Number(t.total),
          t.payment_method,
          t.status,
        ]),
        totalsRow: [
          `${transactions.length} transactions`, '', '', '',
          transactions.reduce((s, t) => s + Number(t.subtotal ?? 0), 0),
          transactions.reduce((s, t) => s + Number(t.discount ?? 0), 0),
          transactions.reduce((s, t) => s + Number(t.total), 0),
          '', '',
        ],
      },

      // ── Sheet 3: Transaction Items ────────────────────────────────────────
      {
        name: 'Transaction Items',
        columns: [
          { header: 'Receipt #',  width: 16 },
          { header: 'Date',       type: 'date',   width: 14 },
          { header: 'Product',    width: 32 },
          { header: 'Qty',        type: 'number', width: 8  },
          { header: 'Unit Price', type: 'money',  width: 14 },
          { header: 'Line Total', type: 'money',  width: 14, bold: true },
        ],
        rows: lineItems.map((i) => [
          i.receipt_no,
          new Date(i.date).toLocaleDateString('en-PH'),
          i.product_name,
          Number(i.quantity),
          Number(i.unit_price),
          Number(i.total),
        ]),
        totalsRow: [
          `${lineItems.length} line items`, '',  '',
          lineItems.reduce((s, i) => s + Number(i.quantity), 0),
          '',
          lineItems.reduce((s, i) => s + Number(i.total), 0),
        ],
      },

      // ── Sheet 4: Products ─────────────────────────────────────────────────
      {
        name: 'Products',
        columns: [
          { header: 'ID',            width: 14 },
          { header: 'Product Name',  width: 32 },
          { header: 'SKU',           width: 16 },
          { header: 'Category',      width: 20 },
          { header: 'Cost',          type: 'money',  width: 14 },
          { header: 'Price',         type: 'money',  width: 14 },
          { header: 'Stock',         type: 'number', width: 10 },
          { header: 'Reorder Point', type: 'number', width: 14 },
          { header: 'Stock Value',   type: 'money',  width: 16 },
          { header: 'Status',        width: 10 },
        ],
        rows: products.map((p) => [
          p.id,
          p.product_name,
          p.sku,
          p.category_name,
          Number(p.cost),
          Number(p.price),
          Number(p.stock),
          Number(p.reorder_point),
          Number(p.cost) * Number(p.stock),
          p.active ? 'Active' : 'Inactive',
        ]),
        totalsRow: [
          `${products.length} products`, '', '', '',
          '', '',
          products.reduce((s, p) => s + Number(p.stock), 0),
          '',
          products.reduce((s, p) => s + Number(p.cost) * Number(p.stock), 0),
          '',
        ],
      },

      // ── Sheet 5: Staff ────────────────────────────────────────────────────
      {
        name: 'Staff',
        columns: [
          { header: 'ID',      width: 14 },
          { header: 'Name',    width: 24 },
          { header: 'Email',   width: 30 },
          { header: 'Role',    width: 14 },
          { header: 'Branch',  width: 20 },
          { header: 'Status',  width: 10 },
          { header: 'Created', type: 'date', width: 14 },
        ],
        rows: staff.map((u) => [
          u.id, u.name, u.email, u.role,
          u.branch ?? 'Unknown Branch',
          u.status,
          new Date(u.created_at).toLocaleDateString('en-PH'),
        ]),
      },

      // ── Sheet 6: Categories ───────────────────────────────────────────────
      {
        name: 'Categories',
        columns: [
          { header: 'ID',          width: 14 },
          { header: 'Name',        width: 24 },
          { header: 'Description', width: 40 },
        ],
        rows: cats.map((c) => [c.id, c.name, c.description ?? '']),
      },

      // ── Sheet 7: Vouchers ─────────────────────────────────────────────────
      {
        name: 'Vouchers',
        columns: [
          { header: 'ID',            width: 14 },
          { header: 'Code',          width: 18, bold: true },
          { header: 'Type',          width: 12 },
          { header: 'Value',         type: 'number', width: 10 },
          { header: 'Min Purchase',  type: 'money',  width: 14 },
          { header: 'Max Uses',      type: 'number', width: 10 },
          { header: 'Used',          type: 'number', width: 8  },
          { header: 'Active',        width: 10 },
          { header: 'Expires At',    type: 'date',   width: 14 },
        ],
        rows: vouchers.map((v) => [
          v.id, v.code,
          v.discount_type === 'percent' ? 'Percent %' : 'Fixed ₱',
          Number(v.discount_value),
          Number(v.min_purchase),
          v.max_uses, v.used_count,
          v.active ? 'Yes' : 'No',
          v.expires_at ? new Date(v.expires_at).toLocaleDateString('en-PH') : 'No expiry',
        ]),
      },
    ],
    'Full Data Backup'
  )

  // Persist metadata
  const meta: BackupMeta = { date: now.toISOString(), filename, records: totalRecords, tables }
  setLastBackup(meta)
  return meta
}
