// ─────────────────────────────────────────────────────────────────────────────
// TenPOS Mobile — Dexie-first API layer
//
// ALL reads come from Dexie (fast, offline-capable).
// Writes: transactions go to Dexie immediately + Supabase when online.
//         Admin ops (create product/staff/etc.) require online connection.
//
// Function signatures are identical to web/src/lib/api.ts so pages work
// in both contexts without changes.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, SESSION_KEY } from './supabase'
import { createClient } from '@supabase/supabase-js'
import { db } from './db'
import { submitTransaction as syncSubmitTransaction, refreshProductCache, refreshInventoryCache } from './sync'
import { v4 as uuid } from 'uuid'

/**
 * Separate Supabase client for staff creation — persistSession:false so
 * signing up a new user never overwrites the admin's active session.
 */
const _signupClient = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
)

// ─── Session token helpers ────────────────────────────────────────────────────

export const BASE_URL = 'supabase'

export function getToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Record<string, unknown>
    const session = (s?.currentSession ?? s) as Record<string, unknown>
    return (session?.access_token as string) ?? null
  } catch { return null }
}

export function getRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Record<string, unknown>
    const session = (s?.currentSession ?? s) as Record<string, unknown>
    return (session?.refresh_token as string) ?? null
  } catch { return null }
}

export function saveTokens(_access: string, _refresh: string) { /* managed by Supabase SDK */ }

export function clearTokens() {
  void supabase.auth.signOut()
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function apiLogin(usernameOrEmail: string, password: string) {
  const email = usernameOrEmail.includes('@')
    ? usernameOrEmail
    : `${usernameOrEmail}@tenpos.ph`

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(
      error.message.toLowerCase().includes('invalid')
        ? 'Incorrect email or password.'
        : error.message,
    )
  }

  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('id, name, email, role, branch_id, status, sales_count')
    .eq('auth_id', data.user.id)
    .single()

  if (staffErr || !staff) throw new Error('Staff account not found. Contact your administrator.')
  const staffRow = staff as Record<string, unknown>
  if (staffRow.status === 'inactive') throw new Error('Your account has been deactivated.')

  // Cache staff in Dexie for offline use
  await db.staff.put({
    id:          staffRow.id as string,
    auth_id:     data.user.id,
    name:        staffRow.name as string,
    email:       (staffRow.email as string | null) ?? email,
    role:        staffRow.role as string,
    branch_id:   staffRow.branch_id as string | null,
    status:      staffRow.status as string,
    sales_count: Number(staffRow.sales_count ?? 0),
    cached_at:   Date.now(),
  })

  void supabase.from('staff').update({ last_login: new Date().toISOString() }).eq('id', staffRow.id)

  return {
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: {
      id:        staffRow.id as string,
      name:      staffRow.name as string,
      email:     (staffRow.email as string | null) ?? email,
      role:      staffRow.role as 'admin' | 'manager' | 'cashier' | 'viewer',
      branch_id: staffRow.branch_id as string | null,
    },
  }
}

export async function apiLogout() {
  clearTokens()
}

export async function apiMe() {
  // Try Supabase session (local JWT validation — no network needed if cached)
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    // Try network first for fresh data
    if (navigator.onLine) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) throw new Error('Not authenticated')

        const { data: staff, error: staffErr } = await supabase
          .from('staff')
          .select('id, name, email, role, branch_id, status, sales_count')
          .eq('auth_id', user.id)
          .single()

        if (staffErr || !staff) throw new Error('Not authenticated')
        const s = staff as Record<string, unknown>

        // Update Dexie cache
        await db.staff.put({
          id:          s.id as string,
          auth_id:     user.id,
          name:        s.name as string,
          email:       (s.email as string | null) ?? '',
          role:        s.role as string,
          branch_id:   s.branch_id as string | null,
          status:      s.status as string,
          sales_count: Number(s.sales_count ?? 0),
          cached_at:   Date.now(),
        })

        return {
          id:        s.id as string,
          name:      s.name as string,
          email:     (s.email as string | null) ?? (user.email ?? ''),
          role:      s.role as string,
          branch_id: s.branch_id as string | null,
        }
      } catch { /* fall through to Dexie */ }
    }

    // Offline: return cached staff data from Dexie
    const cached = await db.staff.where('auth_id').equals(session.user.id).first()
    if (cached) {
      return {
        id:        cached.id,
        name:      cached.name,
        email:     cached.email,
        role:      cached.role,
        branch_id: cached.branch_id,
      }
    }
  }

  throw new Error('Not authenticated')
}

// NOTE: PIN verification is handled directly in PinLock.tsx via db helpers
// (setDevicePin / verifyDevicePin / hasDevicePin). No network call needed.

export async function apiUpdateProfile(data: { name?: string; email?: string }) {
  _requireOnline()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const cached = await db.staff.where('auth_id').equals(session.user.id).first()
  if (!cached) throw new Error('Not authenticated')

  const updates: Record<string, string> = {}
  if (data.name)  updates.name  = data.name
  if (data.email) updates.email = data.email

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('staff').update(updates).eq('id', cached.id)
    if (error) throw new Error(error.message)
    await db.staff.update(cached.id, updates)
  }

  if (data.email) {
    const { error } = await supabase.auth.updateUser({ email: data.email })
    if (error) throw new Error(error.message)
  }

  return true
}

export async function apiChangePassword(newPassword: string) {
  _requireOnline()
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.')
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message)
  return true
}

/**
 * Upload a profile picture to Supabase Storage (bucket: "avatars", public).
 * URL is saved in Supabase Auth user_metadata so it persists across devices.
 * Prerequisite: create a public "avatars" bucket in Supabase Storage.
 */
export async function apiUploadAvatar(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${user.id}/avatar.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadErr) {
    if (uploadErr.message.includes('Bucket not found') || uploadErr.message.includes('not found')) {
      throw new Error('Storage bucket "avatars" not found. Create a public bucket named "avatars" in Supabase Storage.')
    }
    throw new Error('Upload failed: ' + uploadErr.message)
  }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
  const avatarUrl = `${publicUrl}?v=${Date.now()}`

  // Persist URL in Auth metadata — survives sessions and syncs across devices
  await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } })

  return avatarUrl
}

export async function apiRemoveAvatar(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Remove all common extension variants — ignore errors (file may not exist)
  await supabase.storage.from('avatars')
    .remove(['jpg', 'png', 'gif', 'webp', 'jpeg'].map((e) => `${user.id}/avatar.${e}`))
    .catch(() => {})

  // Clear from Auth metadata
  await supabase.auth.updateUser({ data: { avatar_url: null } })
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function apiGetProducts(params?: Record<string, string>) {
  let products = await db.products.toArray()

  if (params?.active === 'true') products = products.filter((p) => p.active)
  if (params?.category_id) products = products.filter((p) => p.category_id === params.category_id)
  if (params?.q) {
    const q = params.q.toLowerCase()
    products = products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').includes(q)
    )
  }

  // Join with inventory for stock + reorder_point
  const invStockMap   = new Map<string, number>()
  const invReorderMap = new Map<string, number>()
  const invRows = await db.inventory.toArray()
  for (const row of invRows) {
    invStockMap.set(row.product_id, (invStockMap.get(row.product_id) ?? 0) + row.stock)
    // Use the highest reorder_point across variants/branches for this product
    invReorderMap.set(row.product_id, Math.max(invReorderMap.get(row.product_id) ?? 0, row.reorder_point))
  }

  const mapped = products.map((p) => ({
    id:            p.id,
    sku:           p.sku,
    barcode:       p.barcode,
    name:          p.name,
    category_id:   p.category_id ?? '',
    category_name: p.category_name ?? '',
    price:         p.price,
    cost:          p.cost ?? 0,
    image_url:     p.image_url,
    active:        p.active,
    variants:      p.variants,
    stock:         invStockMap.get(p.id) ?? 0,
    reorder_point: invReorderMap.get(p.id) ?? 5,
    created_at:    '',
    updated_at:    '',
  }))

  const total  = mapped.length
  const limit  = parseInt(params?.limit  ?? '100', 10)
  const offset = parseInt(params?.offset ?? '0',   10)

  return { data: mapped.slice(offset, offset + limit), total }
}

export async function apiGetProduct(id: string) {
  const p = await db.products.get(id)
  if (!p) throw new Error('Product not found')

  const invRows = await db.inventory.where('product_id').equals(id).toArray()
  const stock   = invRows.reduce((s, r) => s + r.stock, 0)
  const inv     = invRows[0]

  return {
    id: p.id, sku: p.sku, barcode: p.barcode, name: p.name,
    category_id:   p.category_id ?? '',
    category_name: p.category_name ?? '',
    price: p.price, cost: p.cost ?? 0,
    image_url: p.image_url, active: p.active, variants: p.variants,
    stock, reorder_point: inv?.reorder_point ?? 5,
    created_at: '', updated_at: '',
  }
}

export async function apiGetProductByBarcode(barcode: string) {
  const products = await db.products.where('barcode').equals(barcode).toArray()
  const p = products[0]
  if (!p) throw new Error('Product not found')
  return apiGetProduct(p.id)
}

export async function apiCreateProduct(data: Record<string, unknown>) {
  _requireOnline()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const cached = await db.staff.where('auth_id').equals(session.user.id).first()

  const { data: product, error } = await supabase
    .from('products')
    .insert({
      branch_id:   cached?.branch_id,
      category_id: (data.category_id as string | null) ?? null,
      name:        data.name as string,
      sku:         data.sku as string,
      barcode:     (data.barcode as string | undefined) || null,
      price:       Number(data.price),
      cost:        Number(data.cost ?? 0),
      image_url:   (data.image_url as string | undefined) || null,
      active:      data.active !== false,
    })
    .select('id, name, branch_id')
    .single()

  if (error) throw new Error(error.message)
  const p = product as { id: string; name: string; branch_id: string }

  await supabase.from('stock_levels').insert({
    product_id:    p.id,
    branch_id:     p.branch_id,
    variant_id:    null,
    stock:         Number(data.stock ?? 0),
    reorder_point: Number(data.reorder_point ?? 5),
  })

  // Refresh product cache to include new product
  await Promise.all([refreshProductCache(), refreshInventoryCache(cached?.branch_id ?? undefined)])

  return apiGetProduct(p.id)
}

export async function apiUpdateProduct(id: string, data: Record<string, unknown>) {
  _requireOnline()
  const col: Record<string, unknown> = {}
  const fields = ['name', 'sku', 'barcode', 'category_id', 'price', 'cost', 'image_url', 'active'] as const
  for (const f of fields) if (data[f] !== undefined) col[f] = f === 'price' || f === 'cost' ? Number(data[f]) : data[f]

  if (Object.keys(col).length) {
    const { error } = await supabase.from('products').update(col).eq('id', id)
    if (error) throw new Error(error.message)
  }

  const stockCol: Record<string, number> = {}
  if (data.reorder_point !== undefined) stockCol.reorder_point = Number(data.reorder_point)
  if (data.stock         !== undefined) stockCol.stock         = Number(data.stock)
  if (Object.keys(stockCol).length) {
    await supabase.from('stock_levels').update(stockCol).eq('product_id', id)
  }

  await Promise.all([refreshProductCache(), refreshInventoryCache()])
  return apiGetProduct(id)
}

export async function apiDeleteProduct(id: string) {
  _requireOnline()
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await db.products.delete(id)
  await db.inventory.where('product_id').equals(id).delete()
  return { ok: true }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function apiGetCategories() {
  const cats = await db.categories.toArray()
  if (cats.length > 0) {
    return cats.map((c) => ({ id: c.id, name: c.name, description: c.icon ?? '' }))
  }

  // Fall back to Supabase if cache is empty
  if (navigator.onLine) {
    const { data } = await supabase
      .from('categories').select('id, name, icon').eq('active', true).order('sort_order')
    return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id as string, name: c.name as string, description: (c.icon ?? '') as string,
    }))
  }

  return []
}

export async function apiCreateCategory(data: { name: string; description?: string }) {
  _requireOnline()
  const { data: { session } } = await supabase.auth.getSession()
  const cached = session ? await db.staff.where('auth_id').equals(session.user.id).first() : null
  const { data: cat, error } = await supabase
    .from('categories')
    .insert({ branch_id: cached?.branch_id, name: data.name, icon: data.description ?? '📦', active: true })
    .select('id, name, icon').single()
  if (error) throw new Error(error.message)
  const c = cat as Record<string, unknown>
  await db.categories.put({ id: c.id as string, name: c.name as string, icon: (c.icon as string | null) ?? undefined, cached_at: Date.now() })
  return { id: c.id as string, name: c.name as string, description: (c.icon ?? '') as string }
}

export async function apiUpdateCategory(id: string, data: { name?: string; description?: string }) {
  _requireOnline()
  const col: Record<string, unknown> = {}
  if (data.name        !== undefined) col.name = data.name
  if (data.description !== undefined) col.icon = data.description
  const { data: cat, error } = await supabase
    .from('categories').update(col).eq('id', id).select('id, name, icon').single()
  if (error) throw new Error(error.message)
  const c = cat as Record<string, unknown>
  await db.categories.update(id, { name: c.name as string, icon: (c.icon as string | null) ?? undefined })
  return { id: c.id as string, name: c.name as string, description: (c.icon ?? '') as string }
}

export async function apiDeleteCategory(id: string) {
  _requireOnline()
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await db.categories.delete(id)
  return { ok: true }
}

// ─── Inventory / Stock levels ─────────────────────────────────────────────────

export async function apiGetInventory(branchId?: string) {
  let inv = await db.inventory.toArray()
  if (branchId) inv = inv.filter((i) => i.branch_id === branchId)

  const productIds = [...new Set(inv.map((i) => i.product_id))]
  const products   = await db.products.bulkGet(productIds)
  const prodMap    = new Map(products.filter(Boolean).map((p) => [p!.id, p!]))

  return inv.map((i) => {
    const prod = prodMap.get(i.product_id)
    return {
      id:            i.id,
      product_id:    i.product_id,
      variant_id:    i.variant_id,
      product_name:  prod?.name ?? '',
      sku:           prod?.sku  ?? '',
      category_name: prod?.category_name ?? '',
      price:         prod?.price ?? 0,
      cost:          prod?.cost  ?? 0,
      branch_id:     i.branch_id,
      branch_name:   'Main Branch',
      stock:         i.stock,
      reorder_point: i.reorder_point,
      active:        prod?.active ?? true,
    }
  })
}

export async function apiGetLowStock(branchId?: string) {
  const all = await apiGetInventory(branchId)
  return all
    .filter((i) => i.stock <= i.reorder_point)
    .map(({ product_id, product_name, sku, category_name, stock, reorder_point, cost }) =>
      ({ product_id, product_name, sku, category_name, stock, reorder_point, cost }))
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function apiCreateTransaction(payload: {
  branch_id: string
  items: { product_id: string; variant_id?: string; quantity: number; unit_price: number; discount: number; note?: string }[]
  payments: { method: string; amount: number; reference?: string }[]
  discount: number
  voucher_code?: string
}) {
  // Delegate to sync engine (handles online/offline automatically)
  return syncSubmitTransaction(payload)
}

export async function apiGetTransactions(params?: Record<string, string>) {
  let txns = await db.transactions.toArray()

  // Sort newest first
  txns.sort((a, b) => b.created_at.localeCompare(a.created_at))

  if (params?.status) {
    const s = params.status === 'returned' ? 'returned' : params.status
    txns = txns.filter((t) => t.status === s)
  }
  if (params?.from) txns = txns.filter((t) => t.created_at >= params.from)
  if (params?.to)   txns = txns.filter((t) => t.created_at <= params.to)
  if (params?.search) {
    const q = params.search.toLowerCase()
    txns = txns.filter((t) =>
      t.receipt_no.toLowerCase().includes(q) ||
      t.staff_name.toLowerCase().includes(q)
    )
  }
  if (params?.sort === 'asc') txns = [...txns].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const total  = txns.length
  const limit  = parseInt(params?.limit  ?? '50', 10)
  const offset = parseInt(params?.offset ?? '0',  10)

  return { data: txns.slice(offset, offset + limit), total }
}

export async function apiGetTransaction(id: string) {
  const txn = await db.transactions.get(id)
  if (txn) return { ...txn, hash: `sha256-${id.slice(0, 16)}` }

  // Try Supabase if not cached
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, staff(name), transaction_items(*), transaction_payments(*)')
      .eq('id', id).single()
    if (error) throw new Error('Transaction not found')
    const t = data as Record<string, unknown>
    return {
      id: t.id as string,
      receipt_no: t.receipt_no as string,
      branch_id: t.branch_id as string,
      branch_name: 'Main Branch',
      staff_id: t.staff_id as string ?? '',
      staff_name: ((t.staff as { name: string } | null)?.name) ?? 'Staff',
      items: ((t.transaction_items as Record<string, unknown>[]) ?? []).map((i) => ({
        id: i.id as string, product_id: i.product_id as string ?? '',
        product_name: i.product_name as string, sku: i.sku as string,
        variant_id: i.variant_id as string ?? undefined, quantity: Number(i.quantity),
        unit_price: Number(i.unit_price), discount: Number(i.discount),
        total: Number(i.subtotal), note: i.note as string ?? undefined,
      })),
      payments: ((t.transaction_payments as Record<string, unknown>[]) ?? []).map((p) => ({
        method: p.method as string, amount: Number(p.amount),
        reference: p.reference as string ?? undefined,
      })),
      subtotal: Number(t.subtotal), discount: Number(t.discount),
      tax: Number(t.tax), total: Number(t.total), change: Number(t.change_given),
      payment_method: t.payment_method as string,
      status: ((t.status as string) === 'refunded' ? 'returned' : t.status) as 'completed' | 'voided' | 'returned',
      void_reason: t.void_reason as string ?? undefined,
      voided_at: t.voided_at as string ?? undefined,
      created_at: t.created_at as string,
      is_offline: false, synced: true,
      hash: `sha256-${id.slice(0, 16)}`,
    }
  }

  throw new Error('Transaction not found')
}

export async function apiVoidTransaction(id: string, reason: string) {
  _requireOnline()
  const { error } = await supabase.rpc('void_transaction', {
    p_transaction_id: id,
    p_reason:         reason,
  })
  if (error) {
    const msg = error.message
    if (msg.includes('FORBIDDEN')) throw new Error('Only managers and admins can void transactions.')
    if (msg.includes('NOT_FOUND')) throw new Error('Transaction not found.')
    throw new Error(msg)
  }

  // Update local Dexie cache
  await db.transactions.update(id, { status: 'voided', void_reason: reason, voided_at: new Date().toISOString() })
  return { ok: true }
}

export async function apiVoidWithPin(id: string, reason: string, pin: string) {
  _requireOnline()
  const { error } = await supabase.rpc('void_with_pin', {
    p_transaction_id: id, p_reason: reason, p_pin: pin,
  })
  if (error) throw new Error(error.message)
  await db.transactions.update(id, { status: 'voided', void_reason: reason, voided_at: new Date().toISOString() })
  return { ok: true }
}

export async function apiSetOverridePin(pin: string) {
  _requireOnline()
  const { error } = await supabase.rpc('set_override_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
}

export async function apiClearOverridePin() {
  _requireOnline()
  const { error } = await supabase.rpc('clear_override_pin')
  if (error) throw new Error(error.message)
}

export async function apiGetMyPinStatus(): Promise<boolean> {
  if (!navigator.onLine) return false
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('staff').select('override_pin_hash').eq('auth_id', user.id).single()
  return !!((data as Record<string, unknown> | null)?.override_pin_hash)
}

export async function apiReturnTransaction(
  id: string,
  items: { item_id: string; quantity: number; reason?: string }[],
) {
  _requireOnline()
  const { data: tx } = await supabase
    .from('transactions').select('branch_id, receipt_no').eq('id', id).single()
  if (!tx) throw new Error('Transaction not found')

  const itemIds = items.map((i) => i.item_id)
  const { data: txItems } = await supabase
    .from('transaction_items').select('id, product_id, unit_price, quantity, product_name')
    .in('id', itemIds)

  const totalRefund = ((txItems ?? []) as Record<string, unknown>[]).reduce((sum, ti) => {
    const ri = items.find((i) => i.item_id === ti.id)
    return sum + Number(ti.unit_price) * (ri?.quantity ?? 0)
  }, 0)

  const branchId = (tx as { branch_id: string }).branch_id

  const { error } = await supabase.from('returns').insert({
    transaction_id: id,        // correct FK column name
    branch_id:      branchId,
    total_refund:   totalRefund,
    reason:         items[0]?.reason ?? null,  // 'reason' not 'notes', no 'status'
  })
  if (error) throw new Error(error.message)

  await supabase.from('transactions').update({ status: 'returned' }).eq('id', id)
  await db.transactions.update(id, { status: 'returned' })
  return { ok: true }
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

export async function apiValidateVoucher(code: string, subtotal: number) {
  const vouchers = await db.vouchers.toArray()
  const v = vouchers.find((v) => v.code.toUpperCase() === code.toUpperCase() && v.active)

  if (!v) {
    // Try Supabase if not cached
    if (navigator.onLine) {
      const { data } = await supabase
        .from('vouchers').select('*').eq('code', code.toUpperCase()).eq('active', true).single()
      if (!data) return { valid: false as const, error: 'Voucher code not found or inactive.' }
      const sv = data as Record<string, unknown>
      const disc = sv.discount_type === 'percent'
        ? (subtotal * Number(sv.discount_value)) / 100
        : Number(sv.discount_value)
      return { valid: true as const, discount_amount: disc, discount_type: sv.discount_type as string, discount_value: Number(sv.discount_value) }
    }
    return { valid: false as const, error: 'Voucher code not found or inactive.' }
  }

  if (v.expires_at && new Date(v.expires_at) < new Date()) return { valid: false as const, error: 'Voucher has expired.' }
  if (v.used_count >= v.max_uses) return { valid: false as const, error: 'Voucher usage limit reached.' }
  if (subtotal < v.min_purchase) return { valid: false as const, error: `Minimum purchase of ₱${v.min_purchase} required.` }

  const discount_amount = v.discount_type === 'percent'
    ? (subtotal * v.discount_value) / 100
    : v.discount_value
  return { valid: true as const, discount_amount, discount_type: v.discount_type, discount_value: v.discount_value }
}

export async function apiGetVouchers(params?: Record<string, string>) {
  let vouchers = await db.vouchers.toArray()
  if (params?.active === 'true') vouchers = vouchers.filter((v) => v.active)

  // Fall back to Supabase if cache empty
  if (vouchers.length === 0 && navigator.onLine) {
    const { data } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false })
    vouchers = ((data ?? []) as Record<string, unknown>[]).map((v) => ({
      id:             v.id as string, code: v.code as string,
      discount_type:  v.discount_type as 'percent' | 'fixed',
      discount_value: Number(v.discount_value), min_purchase: Number(v.min_purchase ?? 0),
      max_uses:       Number(v.max_uses ?? 9999), used_count:  Number(v.used_count ?? 0),
      active:         Boolean(v.active), expires_at: v.expires_at as string ?? undefined,
      cached_at:      Date.now(),
    }))
  }

  const total = vouchers.length
  const limit = parseInt(params?.limit ?? '50', 10)
  return { data: vouchers.slice(0, limit), total }
}

export async function apiCreateVoucher(data: Record<string, unknown>) {
  _requireOnline()
  const { data: v, error } = await supabase
    .from('vouchers')
    .insert({
      code:           (data.code as string).toUpperCase(),
      discount_type:  data.discount_type,
      discount_value: Number(data.discount_value),
      min_purchase:   Number(data.min_purchase ?? 0),
      max_uses:       Number(data.max_uses ?? 9999),
      active:         data.active !== false,
      expires_at:     (data.expires_at as string | undefined) ?? null,
    })
    .select('*').single()
  if (error) throw new Error(error.message)
  const row = v as Record<string, unknown>
  const cached = {
    id: row.id as string, code: row.code as string,
    discount_type: row.discount_type as 'percent' | 'fixed',
    discount_value: Number(row.discount_value), min_purchase: Number(row.min_purchase ?? 0),
    max_uses: Number(row.max_uses ?? 9999), used_count: 0,
    active: Boolean(row.active), expires_at: row.expires_at as string ?? undefined,
    cached_at: Date.now(),
  }
  await db.vouchers.put(cached)
  return cached
}

export async function apiUpdateVoucherById(id: string, data: Record<string, unknown>) {
  _requireOnline()
  const { data: v, error } = await supabase
    .from('vouchers').update(data).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  const row = v as Record<string, unknown>
  const cached = {
    id: row.id as string, code: row.code as string,
    discount_type: row.discount_type as 'percent' | 'fixed',
    discount_value: Number(row.discount_value), min_purchase: Number(row.min_purchase ?? 0),
    max_uses: Number(row.max_uses ?? 9999), used_count: Number(row.used_count ?? 0),
    active: Boolean(row.active), expires_at: row.expires_at as string ?? undefined,
    cached_at: Date.now(),
  }
  await db.vouchers.put(cached)
  return cached
}

export async function apiDeleteVoucher(id: string) {
  _requireOnline()
  const { error } = await supabase.from('vouchers').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await db.vouchers.delete(id)
  return { ok: true }
}

// ─── Reports (computed locally from Dexie cache) ──────────────────────────────

export async function apiSalesReport(params: Record<string, string>) {
  let txns = (await db.transactions.toArray()).filter((t) => t.status === 'completed')
  if (params.from) txns = txns.filter((t) => t.created_at >= params.from)
  if (params.to)   txns = txns.filter((t) => t.created_at <= params.to)

  const total_revenue      = txns.reduce((s, t) => s + t.total, 0)
  const transaction_count  = txns.length
  const total_items_sold   = txns.reduce((s, t) => s + t.items.reduce((is, i) => is + i.quantity, 0), 0)
  const avg_order_value    = transaction_count > 0 ? total_revenue / transaction_count : 0

  // Build day map spanning the requested date range (defaults to last 7 days)
  const rangeStart = params.from ? new Date(params.from) : (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d })()
  const rangeEnd   = params.to   ? new Date(params.to)   : new Date()
  const dayMap = new Map<string, { revenue: number; count: number }>()
  for (const d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    dayMap.set(d.toISOString().slice(0, 10), { revenue: 0, count: 0 })
  }
  for (const t of txns) {
    const day = t.created_at.slice(0, 10)
    if (dayMap.has(day)) {
      dayMap.get(day)!.revenue += t.total
      dayMap.get(day)!.count  += 1
    }
  }
  const salesByPeriod = [...dayMap.entries()].map(([date, v]) => ({ date, ...v }))

  const productMap = new Map<string, { product_name: string; quantity_sold: number; revenue: number }>()
  for (const t of txns) {
    for (const item of t.items) {
      if (!productMap.has(item.product_id)) {
        productMap.set(item.product_id, { product_name: item.product_name, quantity_sold: 0, revenue: 0 })
      }
      productMap.get(item.product_id)!.quantity_sold += item.quantity
      productMap.get(item.product_id)!.revenue       += item.total
    }
  }
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // Payment method breakdown
  const methodMap = new Map<string, { total: number; count: number }>()
  for (const t of txns) {
    for (const p of t.payments) {
      const m = p.method ?? 'cash'
      if (!methodMap.has(m)) methodMap.set(m, { total: 0, count: 0 })
      methodMap.get(m)!.total += Number(p.amount)
      methodMap.get(m)!.count += 1
    }
  }
  const byPaymentMethod = [...methodMap.entries()]
    .map(([method, v]) => ({ method, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)

  // Hourly heatmap (0–23)
  const hourMap = new Map<number, { revenue: number; count: number }>()
  for (let h = 0; h < 24; h++) hourMap.set(h, { revenue: 0, count: 0 })
  for (const t of txns) {
    const hour = new Date(t.created_at).getHours()
    hourMap.get(hour)!.revenue += t.total
    hourMap.get(hour)!.count  += 1
  }
  const hourlyHeatmap = [...hourMap.entries()].map(([hour, v]) => ({ hour, ...v }))

  return { summary: { total_revenue, transaction_count, total_items_sold, avg_order_value }, salesByPeriod, topProducts, byPaymentMethod, hourlyHeatmap }
}

export async function apiFinancialReport(params: Record<string, string>) {
  let txns = (await db.transactions.toArray()).filter((t) => t.status === 'completed')
  if (params.from) txns = txns.filter((t) => t.created_at >= params.from)
  if (params.to)   txns = txns.filter((t) => t.created_at <= params.to)

  const inv      = await db.inventory.toArray()
  const products = await db.products.toArray()
  const prodMap  = new Map(products.map((p) => [p.id, p]))

  const revenue     = txns.reduce((s, t) => s + t.total, 0)
  const cogs        = txns.reduce((s, t) =>
    s + t.items.reduce((is, item) => {
      const p = prodMap.get(item.product_id)
      return is + (p?.cost ?? 0) * item.quantity
    }, 0), 0)
  const gross_profit  = revenue - cogs
  const gross_margin  = revenue > 0 ? (gross_profit / revenue) * 100 : 0
  const stock_value   = inv.reduce((s, i) => {
    const p = prodMap.get(i.product_id)
    return s + (p?.cost ?? 0) * i.stock
  }, 0)

  const paymentBreakdown: Record<string, number> = {}
  for (const t of txns) {
    for (const p of t.payments) {
      paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + p.amount
    }
  }

  return { revenue, cogs, gross_profit, gross_margin: gross_margin.toFixed(1), stock_value, transaction_count: txns.length, paymentBreakdown }
}

export async function apiStaffReport(params: Record<string, string>) {
  let txns = (await db.transactions.toArray()).filter((t) => t.status === 'completed')
  if (params.from) txns = txns.filter((t) => t.created_at >= params.from)
  if (params.to)   txns = txns.filter((t) => t.created_at <= params.to)

  const staffList = await db.staff.toArray()

  const staffMap = new Map<string, { name: string; transaction_count: number; revenue: number; items_sold: number }>()
  for (const t of txns) {
    if (!staffMap.has(t.staff_id)) {
      staffMap.set(t.staff_id, { name: t.staff_name, transaction_count: 0, revenue: 0, items_sold: 0 })
    }
    const s = staffMap.get(t.staff_id)!
    s.transaction_count++
    s.revenue     += t.total
    s.items_sold  += t.items.reduce((is, i) => is + i.quantity, 0)
  }

  const staffPerformance = staffList.map((u) => ({
    staff_id: u.id, name: u.name, role: u.role,
    ...(staffMap.get(u.id) ?? { transaction_count: 0, revenue: 0, items_sold: 0 }),
  })).sort((a, b) => b.revenue - a.revenue)

  return { staffPerformance }
}

export async function apiInventoryReport(params?: Record<string, string>) {
  const inv      = await db.inventory.toArray()
  const products = await db.products.toArray()
  const prodMap  = new Map(products.map((p) => [p.id, p]))

  let filtered = inv
  if (params?.branch_id) filtered = filtered.filter((i) => i.branch_id === params.branch_id)

  const stockSummary = filtered.map((i) => {
    const p = prodMap.get(i.product_id)
    return {
      id: i.id, name: p?.name ?? '', sku: p?.sku ?? '',
      price: String(p?.price ?? 0), cost: String(p?.cost ?? 0),
      category_name: p?.category_name ?? '',
      total_stock: i.stock, reorder_point: i.reorder_point,
      stock_value: String((p?.cost ?? 0) * i.stock),
    }
  })

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  const recentTxns = (await db.transactions.toArray())
    .filter((t) => t.status === 'completed' && t.created_at >= cutoff)
  const moverMap = new Map<string, { product_id: string; product_name: string; quantity_sold: number; revenue: number }>()
  for (const t of recentTxns) {
    for (const item of t.items) {
      if (!moverMap.has(item.product_id)) moverMap.set(item.product_id, { product_id: item.product_id, product_name: item.product_name, quantity_sold: 0, revenue: 0 })
      const m = moverMap.get(item.product_id)!
      m.quantity_sold += item.quantity
      m.revenue       += item.total
    }
  }
  const fastMovers = [...moverMap.values()]
    .sort((a, b) => b.quantity_sold - a.quantity_sold)
    .map((m) => ({ ...m, revenue: String(m.revenue) }))

  const stockMovement = [
    { type: 'add',    count: 0, total_quantity: 0 },
    { type: 'remove', count: 0, total_quantity: 0 },
  ]

  const catMap = new Map<string, { category: string; products: number; total_stock: number; total_value: number }>()
  for (const item of filtered) {
    const p = prodMap.get(item.product_id)
    const cat = p?.category_name ?? 'Uncategorized'
    if (!catMap.has(cat)) catMap.set(cat, { category: cat, products: 0, total_stock: 0, total_value: 0 })
    const c = catMap.get(cat)!
    c.products++
    c.total_stock += item.stock
    c.total_value += (p?.cost ?? 0) * item.stock
  }
  const valueByCategory = [...catMap.values()].map((c) => ({ ...c, total_value: String(c.total_value) }))

  return { stockSummary, fastMovers, stockMovement, valueByCategory }
}

// ─── Staff management ─────────────────────────────────────────────────────────

export async function apiGetStaff(params?: Record<string, string>) {
  let staffList = await db.staff.toArray()

  // Fall back to Supabase if cache empty
  if (staffList.length === 0 && navigator.onLine) {
    const { data } = await supabase
      .from('staff').select('id, auth_id, name, email, role, branch_id, status, sales_count').order('name')
    staffList = ((data ?? []) as Record<string, unknown>[]).map((s) => ({
      id: s.id as string, auth_id: s.auth_id as string, name: s.name as string,
      email: (s.email as string | null) ?? '', role: s.role as string,
      branch_id: s.branch_id as string | null, status: s.status as string,
      sales_count: Number(s.sales_count ?? 0), cached_at: Date.now(),
    }))
  }

  if (params?.role)   staffList = staffList.filter((s) => s.role   === params.role)
  if (params?.status) staffList = staffList.filter((s) => s.status === params.status)
  if (params?.q) {
    const q = params.q.toLowerCase()
    staffList = staffList.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
  }

  const total = staffList.length
  const limit = parseInt(params?.limit ?? '50', 10)
  const data  = staffList.slice(0, limit).map((s) => ({
    id: s.id, name: s.name, email: s.email, role: s.role,
    branch: 'Main Branch', branch_id: s.branch_id,
    // cached_at is the last time this row was pulled from Supabase
    status: s.status, lastLogin: new Date(s.cached_at).toISOString(), salesCount: s.sales_count,
    created_at: '',
  }))
  return { data, total }
}

export async function apiGetStaffMember(id: string) {
  const s = await db.staff.get(id)
  if (!s) {
    if (navigator.onLine) {
      const { data } = await supabase.from('staff').select('*').eq('id', id).single()
      if (!data) throw new Error('Staff member not found')
      const row = data as Record<string, unknown>
      return {
        id: row.id as string, name: row.name as string, email: row.email as string ?? '',
        role: row.role as string, branch: 'Main Branch', branch_id: row.branch_id as string | null,
        status: row.status as string, lastLogin: '', salesCount: Number(row.sales_count ?? 0),
        created_at: '', recent_transactions: [], total_revenue: 0,
      }
    }
    throw new Error('Staff member not found')
  }
  const txns = (await db.transactions.toArray()).filter((t) => t.staff_id === id && t.status === 'completed')
  return {
    id: s.id, name: s.name, email: s.email, role: s.role,
    branch: 'Main Branch', branch_id: s.branch_id,
    status: s.status, lastLogin: '', salesCount: s.sales_count,
    created_at: '', recent_transactions: txns.slice(0, 5),
    total_revenue: txns.reduce((sum, t) => sum + t.total, 0),
  }
}

export async function apiCreateStaff(data: Record<string, unknown>) {
  _requireOnline()
  const email    = (data.email as string).toLowerCase().trim()
  const password = data.password as string | undefined
  if (!password || password.length < 8) {
    throw new Error('A password of at least 8 characters is required to create a staff account.')
  }

  // 1. Create the Supabase Auth user via a non-persisting client so the admin's
  //    active session in localStorage is never replaced by the new user's session.
  const { data: authData, error: signUpErr } = await _signupClient.auth.signUp({
    email, password, options: { emailRedirectTo: undefined },
  })
  if (signUpErr) throw new Error(`Auth error: ${signUpErr.message}`)
  const authId = authData.user?.id
  if (!authId) throw new Error('Failed to create auth account — no user ID returned.')

  // 2. Insert the staff row
  const { data: staff, error } = await supabase.from('staff').insert({
    auth_id:   authId,
    branch_id: (data.branch_id as string | null) ?? null,
    name:      data.name  as string,
    email,
    role:      data.role  as string,
    status:    'active',
  }).select('id, name, email, role, branch_id, status').single()
  if (error) throw new Error(error.message)

  const s = staff as Record<string, unknown>
  // 3. Warm Dexie cache
  const cached: import('./db').CachedStaff = {
    id: s.id as string, auth_id: authId,
    name: s.name as string, email: email,
    role: s.role as string, branch_id: s.branch_id as string | null ?? null,
    status: 'active', sales_count: 0, cached_at: Date.now(),
  }
  await db.staff.put(cached)
  return { id: cached.id, name: cached.name, email: cached.email, role: cached.role, branch: 'Main Branch', status: 'active' }
}

export async function apiUpdateStaff(id: string, data: Record<string, unknown>) {
  _requireOnline()
  const col: Record<string, unknown> = {}
  const fields = ['name', 'email', 'role', 'branch_id', 'status'] as const
  for (const f of fields) if (data[f] !== undefined) col[f] = data[f]
  const { error } = await supabase.from('staff').update(col).eq('id', id)
  if (error) throw new Error(error.message)
  await db.staff.update(id, col as Partial<import('./db').CachedStaff>)
  const s = await db.staff.get(id)
  return { id, name: s?.name ?? '', email: s?.email ?? '', role: s?.role ?? '', branch: 'Main Branch', status: s?.status ?? 'active' }
}

export async function apiDeleteStaff(id: string) {
  _requireOnline()
  const { error } = await supabase.from('staff').delete().eq('id', id)
  if (error) throw new Error(error.message)
  await db.staff.delete(id)
  return { ok: true }
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function apiGetBranches() {
  if (navigator.onLine) {
    const { data } = await supabase
      .from('branches').select('id, name, address, manager_name, active, terminal_count')
    return ((data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b.id as string, name: b.name as string, address: (b.address as string | null) ?? '',
      managerName: (b.manager_name as string | null) ?? '',
      active: Boolean(b.active), terminalCount: Number(b.terminal_count ?? 0),
    }))
  }
  return [{ id: 'br-1', name: 'Main Branch', address: '', managerName: '', active: true, terminalCount: 1 }]
}

export async function apiCreateBranch(data: Record<string, unknown>) {
  _requireOnline()
  const { data: b, error } = await supabase
    .from('branches')
    .insert({ name: data.name, address: data.address ?? '', manager_name: data.manager_name ?? '', active: true })
    .select('id, name, address, manager_name, active').single()
  if (error) throw new Error(error.message)
  const row = b as Record<string, unknown>
  return { id: row.id as string, name: row.name as string, address: row.address as string ?? '', managerName: row.manager_name as string ?? '', active: true, terminalCount: 1 }
}

export async function apiUpdateBranch(id: string, data: Record<string, unknown>) {
  _requireOnline()
  const { data: b, error } = await supabase
    .from('branches').update(data).eq('id', id).select('id, name, address, manager_name, active').single()
  if (error) throw new Error(error.message)
  const row = b as Record<string, unknown>
  return { id: row.id as string, name: row.name as string, address: row.address as string ?? '', managerName: row.manager_name as string ?? '', active: Boolean(row.active), terminalCount: 1 }
}

// ─── Audit log ────────────────────────────────────────────────────────────────

const AUDIT_KEY = 'tenpos_mobile_audit'

function addLocalAudit(action: string, user: string, details: string, severity: 'info' | 'warning' | 'critical' = 'info') {
  try {
    const entries = JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]') as unknown[]
    entries.unshift({ id: uuid(), action, user, details, ip: 'mobile', timestamp: new Date().toISOString(), severity })
    if (entries.length > 200) entries.length = 200
    localStorage.setItem(AUDIT_KEY, JSON.stringify(entries))
  } catch { /* ignore */ }
}

export async function apiGetAuditLog(params?: Record<string, string>) {
  let entries = JSON.parse(localStorage.getItem(AUDIT_KEY) ?? '[]') as {
    id: string; action: string; user: string; details: string
    ip: string; timestamp: string; severity: 'info' | 'warning' | 'critical'
  }[]

  if (entries.length === 0 && navigator.onLine) {
    const { data } = await supabase
      .from('audit_log')
      .select('id, action, severity, details, created_at, staff(name)')
      .order('created_at', { ascending: false })
      .limit(200)
    entries = ((data ?? []) as Record<string, unknown>[]).map((e) => ({
      id: e.id as string,
      action: e.action as string,
      user:   ((e.staff as { name: string } | null)?.name) ?? 'System',
      details: e.details as string ?? '',
      ip: 'cloud',
      timestamp: e.created_at as string,
      severity: (e.severity as 'info' | 'warning' | 'critical') ?? 'info',
    }))
  }

  if (params?.severity) entries = entries.filter((e) => e.severity === params.severity)
  if (params?.q) {
    const q = params.q.toLowerCase()
    entries = entries.filter((e) =>
      e.action.toLowerCase().includes(q) ||
      e.user.toLowerCase().includes(q) ||
      e.details.toLowerCase().includes(q)
    )
  }

  const total  = entries.length
  const page   = parseInt(params?.page  ?? '1',  10)
  const limit  = parseInt(params?.limit ?? '30', 10)
  const offset = (page - 1) * limit
  return { data: entries.slice(offset, offset + limit), total, page, limit }
}

// ─── Stock adjustments ────────────────────────────────────────────────────────

interface LocalAdjustment {
  id: string; product_id: string; product_name: string
  type: 'in' | 'out' | 'correction' | 'damage' | 'return'
  quantity: number; reason: string; by: string; branch_id: string; created_at: string
}

const ADJ_KEY = 'tenpos_mobile_adjustments'

export async function apiGetAdjustments(params?: Record<string, string>) {
  let adjs = JSON.parse(localStorage.getItem(ADJ_KEY) ?? '[]') as LocalAdjustment[]
  if (params?.product_id) adjs = adjs.filter((a) => a.product_id === params.product_id)
  if (params?.branch_id)  adjs = adjs.filter((a) => a.branch_id  === params.branch_id)
  const total = adjs.length
  const limit = parseInt(params?.limit ?? '50', 10)
  return { data: adjs.slice(0, limit), total }
}

export async function apiCreateAdjustment(data: {
  product_id: string; type: 'in' | 'out' | 'correction' | 'damage' | 'return'
  quantity: number; reason: string; branch_id: string
}) {
  // Try Supabase first
  if (navigator.onLine) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const staffRow = session ? await db.staff.where('auth_id').equals(session.user.id).first() : null

      const { error } = await supabase.from('stock_adjustments').insert({
        product_id: data.product_id,
        branch_id:  data.branch_id,
        type:       data.type,
        quantity:   data.quantity,
        reason:     data.reason,
        staff_id:   staffRow?.id ?? null,
      })
      if (error) throw error

      // Update stock_levels in Supabase
      const key = `${data.product_id}_base_${data.branch_id}`
      const inv  = await db.inventory.get(key)
      if (inv) {
        let newStock = inv.stock
        if (data.type === 'in' || data.type === 'return') newStock += data.quantity
        else if (data.type === 'out' || data.type === 'damage') newStock = Math.max(0, newStock - data.quantity)
        else if (data.type === 'correction') newStock = data.quantity
        await supabase.from('stock_levels').update({ stock: newStock }).eq('product_id', data.product_id).eq('branch_id', data.branch_id)
        await db.inventory.update(key, { stock: newStock })
      }
    } catch { /* fall through to local */ }
  }

  // Also update Dexie immediately
  const key = `${data.product_id}_base_${data.branch_id}`
  const inv  = await db.inventory.get(key)
  if (inv) {
    let newStock = inv.stock
    if (data.type === 'in' || data.type === 'return') newStock += data.quantity
    else if (data.type === 'out' || data.type === 'damage') newStock = Math.max(0, newStock - data.quantity)
    else if (data.type === 'correction') newStock = data.quantity
    await db.inventory.update(key, { stock: newStock })
  }

  const prod = await db.products.get(data.product_id)
  const { data: { session } } = await supabase.auth.getSession()
  const staffRow = session ? await db.staff.where('auth_id').equals(session.user.id).first() : null

  const adj: LocalAdjustment = {
    id: uuid(), product_id: data.product_id, product_name: prod?.name ?? data.product_id,
    type: data.type, quantity: data.quantity, reason: data.reason,
    by: staffRow?.name ?? 'System', branch_id: data.branch_id, created_at: new Date().toISOString(),
  }
  const adjs = JSON.parse(localStorage.getItem(ADJ_KEY) ?? '[]') as LocalAdjustment[]
  adjs.unshift(adj)
  localStorage.setItem(ADJ_KEY, JSON.stringify(adjs.slice(0, 200)))

  addLocalAudit('STOCK_ADJUSTMENT', staffRow?.name ?? 'System',
    `${data.type.toUpperCase()} ${data.quantity} × ${prod?.name ?? data.product_id}: ${data.reason}`)

  return adj
}

// ─── Backup (stubs — backup runs on web, not mobile) ─────────────────────────

export async function apiGetAllTransactions() {
  return db.transactions.toArray()
}
export async function apiGetAllProducts() {
  return db.products.toArray()
}
export async function apiGetAllStaff() {
  return db.staff.toArray()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _requireOnline() {
  if (!navigator.onLine) {
    throw new Error('This action requires an internet connection. Please reconnect and try again.')
  }
}
