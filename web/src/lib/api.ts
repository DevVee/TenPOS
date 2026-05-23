// ─────────────────────────────────────────────────────────────────────────────
// TenPOS — Supabase-backed data layer
// Identical function signatures to the previous localStorage version.
// Pages import from here unchanged — only this file changed.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// ─── Supabase session helpers (synchronous token read) ───────────────────────

// Derive project ref from the env var — never hardcode it.
const _supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? ''
const PROJECT_REF  = _supabaseUrl.split('//')[1]?.split('.')[0] ?? ''
const SESSION_KEY  = `sb-${PROJECT_REF}-auth-token`

/**
 * Separate Supabase client used ONLY for creating new auth users (signUp).
 * persistSession: false ensures it never overwrites the admin's active session
 * in localStorage — the new user's session is discarded after we grab their ID.
 */
const _signupClient = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
)

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

/** Supabase SDK manages tokens automatically — these are kept for compat. */
export function saveTokens(_access: string, _refresh: string) { /* managed by SDK */ }

export function clearTokens() {
  _currentStaff = null
  void supabase.auth.signOut()
}

// ─── Current-staff cache ──────────────────────────────────────────────────────

interface StaffRow {
  id: string
  name: string
  email: string | null
  role: string
  branch_id: string | null
  status: string
  sales_count: number
}

let _currentStaff: StaffRow | null = null

async function getCurrentStaff(): Promise<StaffRow | null> {
  if (_currentStaff) return _currentStaff
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('staff')
    .select('id, name, email, role, branch_id, status, sales_count')
    .eq('auth_id', user.id)
    .maybeSingle()
  _currentStaff = data as StaffRow | null
  return _currentStaff
}

// ─── Audit-log helper (fire-and-forget — never blocks mutations) ──────────────

async function addAudit(
  action: string,
  details: string,
  severity: 'info' | 'warning' | 'critical' = 'info',
) {
  const staff = await getCurrentStaff()
  void supabase.from('audit_log').insert({
    branch_id: staff?.branch_id ?? null,
    staff_id:  staff?.id ?? null,
    action,
    details,
    ip: null,
    severity,
  })
}



// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function apiLogin(usernameOrEmail: string, password: string) {
  // Accept bare username ("admin") → "admin@tenpos.ph"
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
  if ((staff as StaffRow).status === 'inactive') throw new Error('Your account has been deactivated.')

  _currentStaff = staff as StaffRow

  void supabase.from('staff').update({ last_login: new Date().toISOString() }).eq('id', staff.id)
  void addAudit('LOGIN', 'User signed in', 'info')

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: {
      id:         (staff as StaffRow).id,
      name:       (staff as StaffRow).name,
      email:      (staff as StaffRow).email ?? email,
      role:       (staff as StaffRow).role as 'admin' | 'manager' | 'cashier' | 'viewer',
      branch_id:  (staff as StaffRow).branch_id,
      avatar_url: (data.user.user_metadata?.avatar_url as string | undefined) ?? undefined,
    },
  }
}

export async function apiLogout() {
  void addAudit('LOGOUT', 'User signed out', 'info')
  clearTokens()
}

export async function apiMe() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Not authenticated')

  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('id, name, email, role, branch_id, status, sales_count')
    .eq('auth_id', user.id)
    .single()

  if (staffErr || !staff) throw new Error('Not authenticated')
  _currentStaff = staff as StaffRow

  return {
    id:         (staff as StaffRow).id,
    name:       (staff as StaffRow).name,
    email:      ((staff as StaffRow).email ?? user.email ?? '') as string,
    role:       (staff as StaffRow).role,
    branch_id:  (staff as StaffRow).branch_id,
    avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? undefined,
  }
}

/** PIN verification — calls the verify_staff_pin RPC (bcrypt server-side). */
export async function apiVerifyPin(pin: string) {
  const { data, error } = await supabase.rpc('verify_staff_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
  return { valid: Boolean(data) }
}

/** Set / change the current staff member's device PIN (bcrypt server-side). */
export async function apiSetDevicePin(pin: string) {
  const { error } = await supabase.rpc('set_device_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function apiUpdateProfile(data: { name?: string; email?: string }) {
  const staff = await getCurrentStaff()
  if (!staff) throw new Error('Not authenticated')

  const updates: Record<string, string> = {}
  if (data.name)  updates.name  = data.name
  if (data.email) updates.email = data.email

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('staff').update(updates).eq('id', staff.id)
    if (error) throw new Error('Failed to update profile: ' + error.message)
    _currentStaff = { ..._currentStaff!, ...updates }
  }

  // Update Supabase Auth email if changed
  if (data.email) {
    const { error } = await supabase.auth.updateUser({ email: data.email })
    if (error) throw new Error('Failed to update email: ' + error.message)
  }

  void addAudit('PROFILE_UPDATE', `Profile updated: ${Object.keys(updates).join(', ')}`, 'info')
  return true
}

export async function apiChangePassword(newPassword: string) {
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.')
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message)
  void addAudit('PASSWORD_CHANGE', 'User changed their password', 'warning')
  return true
}

/**
 * Upload a profile picture to Supabase Storage (bucket: "avatars", public).
 * The URL is saved in Supabase Auth user_metadata so it survives across
 * devices and browser clears.
 *
 * Prerequisites — run once in the Supabase dashboard:
 *   Storage → New bucket → name: "avatars", Public: ON
 *   Policy: allow authenticated users to upload to their own folder.
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
    // Surface a friendly message when the bucket simply doesn't exist yet
    if (uploadErr.message.includes('Bucket not found') || uploadErr.message.includes('not found')) {
      throw new Error(
        'Storage bucket "avatars" not found. Create a public bucket named "avatars" in your Supabase dashboard → Storage.'
      )
    }
    throw new Error('Upload failed: ' + uploadErr.message)
  }

  // Public URL + cache-bust so the browser fetches the new image immediately
  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
  const avatarUrl = `${publicUrl}?v=${Date.now()}`

  // Persist in Auth metadata — survives sessions, syncs across devices
  await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } })

  void addAudit('AVATAR_UPDATE', 'User updated profile photo', 'info')
  return avatarUrl
}

export async function apiRemoveAvatar(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Try to remove common extensions — ignore errors (file may not exist)
  await supabase.storage.from('avatars')
    .remove(['jpg', 'png', 'gif', 'webp', 'jpeg'].map((e) => `${user.id}/avatar.${e}`))
    .catch(() => {})

  // Clear from Auth metadata
  await supabase.auth.updateUser({ data: { avatar_url: null } })
  void addAudit('AVATAR_REMOVE', 'User removed profile photo', 'info')
}

// ─── Products ─────────────────────────────────────────────────────────────────

interface SupabaseProduct {
  id: string; branch_id: string; category_id: string | null
  name: string; sku: string; barcode: string | null
  price: number | string; cost: number | string
  image_url: string | null; active: boolean
  created_at: string; updated_at: string
  // Extended optional fields
  description:  string | null
  brand:        string | null
  material:     string | null
  color:        string | null
  weight_grams: number | null
  length_cm:    number | null
  width_cm:     number | null
  height_cm:    number | null
  tags:         string[] | null
  notes:        string | null
  categories:       { name: string } | null
  product_variants: { id: string; label: string; value: string; price_adjustment: number }[]
  stock_levels:     { stock: number; reorder_point: number }[]
}

function mapProduct(p: SupabaseProduct) {
  return {
    id: p.id, sku: p.sku, barcode: p.barcode ?? undefined,
    name: p.name,
    category_id:   p.category_id ?? '',
    category_name: p.categories?.name ?? '',
    price: Number(p.price), cost: Number(p.cost),
    image_url: p.image_url ?? undefined,
    active: p.active,
    variants: p.product_variants ?? [],
    stock:         p.stock_levels?.[0]?.stock ?? 0,
    reorder_point: p.stock_levels?.[0]?.reorder_point ?? 5,
    created_at: p.created_at, updated_at: p.updated_at,
    // Extended optional fields
    description:  p.description  ?? undefined,
    brand:        p.brand        ?? undefined,
    material:     p.material     ?? undefined,
    color:        p.color        ?? undefined,
    weight_grams: p.weight_grams ?? undefined,
    length_cm:    p.length_cm    ?? undefined,
    width_cm:     p.width_cm     ?? undefined,
    height_cm:    p.height_cm    ?? undefined,
    tags:         p.tags         ?? undefined,
    notes:        p.notes        ?? undefined,
  }
}

const PRODUCT_SELECT = '*, categories(name), product_variants(*), stock_levels(stock, reorder_point)'

/**
 * Escape characters that are meaningful inside a PostgREST `.or()` filter string.
 * Commas and parentheses would break the filter parser; percent/underscore are
 * SQL LIKE wildcards that could widen or narrow results unexpectedly.
 */
function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/%/g, '\\%')    // escape LIKE wildcard
    .replace(/_/g, '\\_')    // escape LIKE single-char wildcard
    .replace(/[(),]/g, '')   // strip PostgREST filter metacharacters
    .trim()
    .slice(0, 100)            // cap length to avoid runaway queries
}

export async function apiGetProducts(params?: Record<string, string>) {
  let q = supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' })
  if (params?.active === 'true') q = q.eq('active', true)
  if (params?.category_id)       q = q.eq('category_id', params.category_id)
  if (params?.q) {
    const term = sanitizeSearchTerm(params.q)
    if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`)
  }
  const limit  = parseInt(params?.limit  ?? '100', 10)
  const offset = parseInt(params?.offset ?? '0',   10)
  q = q.range(offset, offset + limit - 1).order('name')

  const { data, error, count } = await q
  if (error) throw new Error(error.message)
  return { data: (data as unknown as SupabaseProduct[]).map(mapProduct), total: count ?? 0 }
}

export async function apiGetProduct(id: string) {
  const { data, error } = await supabase
    .from('products').select(PRODUCT_SELECT).eq('id', id).single()
  if (error) throw new Error('Product not found')
  return mapProduct(data as unknown as SupabaseProduct)
}

export async function apiGetProductByBarcode(barcode: string) {
  const { data, error } = await supabase
    .from('products').select(PRODUCT_SELECT).eq('barcode', barcode).single()
  if (error) throw new Error('Product not found')
  return mapProduct(data as unknown as SupabaseProduct)
}

export async function apiCreateProduct(data: Record<string, unknown>) {
  const staff = await getCurrentStaff()
  const { data: product, error } = await supabase
    .from('products')
    .insert({
      branch_id:    staff?.branch_id,
      category_id:  (data.category_id  as string | null) ?? null,
      name:         data.name           as string,
      sku:          data.sku            as string,
      barcode:      (data.barcode       as string | undefined) || null,
      price:        Number(data.price),
      cost:         Number(data.cost ?? 0),
      image_url:    (data.image_url     as string | undefined) || null,
      active:       data.active !== false,
      // Extended fields
      description:  (data.description   as string | undefined) || null,
      brand:        (data.brand         as string | undefined) || null,
      material:     (data.material      as string | undefined) || null,
      color:        (data.color         as string | undefined) || null,
      weight_grams: data.weight_grams   ? Number(data.weight_grams) : null,
      length_cm:    data.length_cm      ? Number(data.length_cm)    : null,
      width_cm:     data.width_cm       ? Number(data.width_cm)     : null,
      height_cm:    data.height_cm      ? Number(data.height_cm)    : null,
      tags:         (data.tags          as string[] | undefined)    ?? null,
      notes:        (data.notes         as string | undefined)      || null,
    })
    .select('id, name, branch_id')
    .single()

  if (error) throw new Error(error.message)

  // Initial stock level
  await supabase.from('stock_levels').insert({
    product_id:    product.id,
    branch_id:     product.branch_id,
    variant_id:    null,
    stock:         Number(data.stock         ?? 0),
    reorder_point: Number(data.reorder_point ?? 5),
  })

  // Variants
  const variants = data.variants as { label: string; value: string; price_adjustment: number }[] | undefined
  if (variants?.length) {
    await supabase.from('product_variants').insert(
      variants.map((v) => ({
        product_id: product.id, label: v.label, value: v.value,
        price_adjustment: Number(v.price_adjustment ?? 0),
      })),
    )
  }

  void addAudit('PRODUCT_CREATED', `Created product: ${product.name}`, 'info')
  return apiGetProduct(product.id)
}

export async function apiUpdateProduct(id: string, data: Record<string, unknown>) {
  const col: Record<string, unknown> = {}
  if (data.name        !== undefined) col.name        = data.name
  if (data.sku         !== undefined) col.sku         = data.sku
  if (data.barcode     !== undefined) col.barcode     = (data.barcode as string) || null
  if (data.category_id !== undefined) col.category_id = data.category_id
  if (data.price       !== undefined) col.price       = Number(data.price)
  if (data.cost        !== undefined) col.cost        = Number(data.cost)
  if (data.image_url   !== undefined) col.image_url   = data.image_url
  if (data.active      !== undefined) col.active      = data.active
  // Extended fields
  if (data.description  !== undefined) col.description  = (data.description  as string) || null
  if (data.brand        !== undefined) col.brand        = (data.brand        as string) || null
  if (data.material     !== undefined) col.material     = (data.material     as string) || null
  if (data.color        !== undefined) col.color        = (data.color        as string) || null
  if (data.weight_grams !== undefined) col.weight_grams = data.weight_grams ? Number(data.weight_grams) : null
  if (data.length_cm    !== undefined) col.length_cm    = data.length_cm    ? Number(data.length_cm)    : null
  if (data.width_cm     !== undefined) col.width_cm     = data.width_cm     ? Number(data.width_cm)     : null
  if (data.height_cm    !== undefined) col.height_cm    = data.height_cm    ? Number(data.height_cm)    : null
  if (data.tags         !== undefined) col.tags         = data.tags          ?? null
  if (data.notes        !== undefined) col.notes        = (data.notes        as string) || null

  if (Object.keys(col).length) {
    const { error } = await supabase.from('products').update(col).eq('id', id)
    if (error) throw new Error(error.message)
  }

  const stockCol: Record<string, unknown> = {}
  if (data.reorder_point !== undefined) stockCol.reorder_point = Number(data.reorder_point)
  if (data.stock         !== undefined) stockCol.stock         = Number(data.stock)
  if (Object.keys(stockCol).length) {
    // Scope to the current staff's branch — never touch another branch's stock row
    const staffForUpdate = await getCurrentStaff()
    let stockQ = supabase.from('stock_levels').update(stockCol).eq('product_id', id)
    if (staffForUpdate?.branch_id) stockQ = stockQ.eq('branch_id', staffForUpdate.branch_id)
    await stockQ
  }

  void addAudit('PRODUCT_UPDATED', `Updated product: ${id}`, 'info')
  return apiGetProduct(id)
}

export async function apiDeleteProduct(id: string) {
  const { data: p } = await supabase.from('products').select('name').eq('id', id).single()
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw new Error(error.message)
  void addAudit('PRODUCT_DELETED', `Deleted product: ${p?.name ?? id}`, 'warning')
  return { ok: true }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function apiGetCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon')
    .eq('active', true)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, description: (c.icon ?? '') as string }))
}

export async function apiCreateCategory(data: { name: string; description?: string }) {
  const staff = await getCurrentStaff()
  const { data: cat, error } = await supabase
    .from('categories')
    .insert({ branch_id: staff?.branch_id, name: data.name, icon: data.description ?? '📦', active: true })
    .select('id, name, icon').single()
  if (error) throw new Error(error.message)
  return { id: cat.id as string, name: cat.name as string, description: (cat.icon ?? '') as string }
}

export async function apiUpdateCategory(id: string, data: { name?: string; description?: string }) {
  const col: Record<string, unknown> = {}
  if (data.name        !== undefined) col.name = data.name
  if (data.description !== undefined) col.icon = data.description
  const { data: cat, error } = await supabase
    .from('categories').update(col).eq('id', id).select('id, name, icon').single()
  if (error) throw new Error(error.message)
  return { id: cat.id as string, name: cat.name as string, description: (cat.icon ?? '') as string }
}

export async function apiDeleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ─── Inventory / Stock levels ─────────────────────────────────────────────────

interface SupabaseStockLevel {
  id: string; product_id: string; branch_id: string; variant_id: string | null
  stock: number; reorder_point: number
  products: { name: string; sku: string; price: number | string; cost: number | string; categories: { name: string } | null } | null
}

function mapStockLevel(s: SupabaseStockLevel) {
  return {
    id: s.id, product_id: s.product_id, variant_id: s.variant_id ?? undefined,
    product_name:  s.products?.name ?? '',
    sku:           s.products?.sku  ?? '',
    category_name: s.products?.categories?.name ?? '',
    price: Number(s.products?.price ?? 0),
    cost:  Number(s.products?.cost  ?? 0),
    branch_id: s.branch_id, branch_name: 'Main Branch',
    stock: s.stock, reorder_point: s.reorder_point,
    active: true,
  }
}

const STOCK_SELECT = '*, products(name, sku, price, cost, categories(name))'

export async function apiGetInventory(branchId?: string) {
  let q = supabase.from('stock_levels').select(STOCK_SELECT)
  if (branchId) q = q.eq('branch_id', branchId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data as unknown as SupabaseStockLevel[]).map(mapStockLevel)
}

export async function apiGetLowStock(branchId?: string) {
  const all = await apiGetInventory(branchId)
  return all
    .filter((i) => i.stock <= i.reorder_point)
    .map(({ product_id, product_name, sku, category_name, stock, reorder_point, cost }) =>
      ({ product_id, product_name, sku, category_name, stock, reorder_point, cost }))
}

// ─── Transactions ─────────────────────────────────────────────────────────────

interface SupabaseTxItem {
  id: string; product_id: string | null; variant_id: string | null
  product_name: string; sku: string
  unit_price: number | string; quantity: number
  discount: number | string; subtotal: number | string; note: string | null
}
interface SupabaseTxPayment {
  id: string; method: string; amount: number | string; reference: string | null
}
interface SupabaseTx {
  id: string; receipt_no: string; branch_id: string; staff_id: string | null
  subtotal: number | string; discount: number | string; tax: number | string
  total: number | string; amount_tendered: number | string; change_given: number | string
  payment_method: string; voucher_code: string | null; status: string
  void_reason: string | null; voided_at: string | null; created_at: string
  staff: { name: string } | null
  transaction_items: SupabaseTxItem[]
  transaction_payments: SupabaseTxPayment[]
}

function mapTx(t: SupabaseTx) {
  return {
    id: t.id, receipt_no: t.receipt_no,
    branch_id: t.branch_id, branch_name: 'Main Branch',
    staff_id: t.staff_id ?? '', staff_name: t.staff?.name ?? 'Staff',
    items: (t.transaction_items ?? []).map((i) => ({
      id: i.id, product_id: i.product_id ?? '',
      product_name: i.product_name, sku: i.sku,
      variant_id: i.variant_id ?? undefined,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      discount:   Number(i.discount),
      total:      Number(i.subtotal),
      note: i.note ?? undefined,
    })),
    payments: (t.transaction_payments ?? []).map((p) => ({
      method: p.method, amount: Number(p.amount), reference: p.reference ?? undefined,
    })),
    subtotal: Number(t.subtotal), discount: Number(t.discount),
    tax:      Number(t.tax),      total:    Number(t.total),
    change: Number(t.change_given),
    payment_method: t.payment_method,
    status: (t.status === 'refunded' ? 'returned' : t.status) as 'completed' | 'voided' | 'returned',
    void_reason: t.void_reason  ?? undefined,
    voided_at:   t.voided_at    ?? undefined,
    created_at:  t.created_at,
  }
}

const TX_SELECT = '*, staff(name), transaction_items(*), transaction_payments(*)'

export async function apiCreateTransaction(payload: {
  branch_id: string
  items: { product_id: string; variant_id?: string; quantity: number; unit_price: number; discount: number; note?: string }[]
  payments: { method: string; amount: number; reference?: string }[]
  discount: number
  voucher_code?: string
  idempotency_key?: string
}) {
  // ── SECURE PATH: delegate to create_transaction RPC ──────────────────────
  // The RPC re-validates prices, stock, branch, voucher, and payment totals
  // server-side — frontend values for unit_price are deliberately ignored.
  // p_idempotency_key prevents duplicate submissions on retry.
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
    p_idempotency_key: payload.idempotency_key ?? null,
  })

  if (error) throw new Error(error.message)

  const result = data as { id: string; receipt_no: string; total: number }

  // Keep local staff counter in sync (UI only — not a security decision)
  const staff = await getCurrentStaff()
  if (staff?.id) {
    void supabase.from('staff').update({ sales_count: (staff.sales_count ?? 0) + 1 }).eq('id', staff.id)
    if (_currentStaff) _currentStaff.sales_count = (_currentStaff.sales_count ?? 0) + 1
  }

  return { id: result.id, receipt_no: result.receipt_no, total: Number(result.total) }
}

export async function apiGetTransactions(params?: Record<string, string>) {
  let q = supabase.from('transactions')
    .select(TX_SELECT, { count: 'exact' })

  if (params?.status) q = q.eq('status', params.status === 'returned' ? 'refunded' : params.status)
  if (params?.from)   q = q.gte('created_at', params.from)
  if (params?.to)     q = q.lte('created_at', params.to)
  if (params?.search) {
    const s = sanitizeSearchTerm(params.search)
    if (s) {
      // Also match cashier name: find all matching staff IDs first, then OR with receipt_no
      const { data: matchingStaff } = await supabase.from('staff').select('id').ilike('name', `%${s}%`)
      const staffIds = ((matchingStaff ?? []) as { id: string }[]).map((st) => st.id)
      if (staffIds.length > 0) {
        q = q.or(`receipt_no.ilike.%${s}%,staff_id.in.(${staffIds.join(',')})`)
      } else {
        q = q.ilike('receipt_no', `%${s}%`)
      }
    }
  }

  const asc = params?.sort === 'asc'
  q = q.order('created_at', { ascending: asc })

  const limit  = parseInt(params?.limit  ?? '50', 10)
  const offset = parseInt(params?.offset ?? '0',  10)
  q = q.range(offset, offset + limit - 1)

  const { data, error, count } = await q
  if (error) throw new Error(error.message)
  return { data: (data as unknown as SupabaseTx[]).map(mapTx), total: count ?? 0 }
}

export async function apiGetTransaction(id: string) {
  const { data, error } = await supabase
    .from('transactions').select(TX_SELECT).eq('id', id).single()
  if (error) throw new Error('Transaction not found')
  return { ...mapTx(data as unknown as SupabaseTx), hash: `sha256-${id.slice(0, 16)}` }
}

export async function apiVoidTransaction(id: string, reason: string) {
  // ── SECURE PATH: delegate to void_transaction RPC ─────────────────────────
  // The RPC enforces manager/admin role in PostgreSQL, validates status,
  // restores stock atomically, and appends an audit log entry.
  const { error } = await supabase.rpc('void_transaction', {
    p_transaction_id: id,
    p_reason:         reason,
  })
  if (error) {
    // Surface human-readable errors from the RPC
    const msg = error.message
    if (msg.includes('FORBIDDEN'))    throw new Error('Only managers and admins can void transactions.')
    if (msg.includes('NOT_FOUND'))    throw new Error('Transaction not found.')
    if (msg.includes('INVALID'))      throw new Error(msg.split('INVALID: ')[1] ?? msg)
    throw new Error(msg)
  }
  return { ok: true }
}

// ─── Manager Override PIN ─────────────────────────────────────────────────────

/** Void a transaction using a manager override PIN (cashier-initiated) */
export async function apiVoidWithPin(id: string, reason: string, pin: string) {
  const { error } = await supabase.rpc('void_with_pin', {
    p_transaction_id: id,
    p_reason:         reason,
    p_pin:            pin,
  })
  if (error) throw new Error(error.message)
  return { ok: true }
}

/** Set (or change) the current manager's override PIN */
export async function apiSetOverridePin(pin: string) {
  const { error } = await supabase.rpc('set_override_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
}

/** Remove the current manager's override PIN */
export async function apiClearOverridePin() {
  const { error } = await supabase.rpc('clear_override_pin')
  if (error) throw new Error(error.message)
}

/** Returns true if the current user has an override PIN set */
export async function apiGetMyPinStatus(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('staff')
    .select('override_pin_hash')
    .eq('auth_id', user.id)
    .single()
  return !!((data as Record<string, unknown> | null)?.override_pin_hash)
}

export async function apiReturnTransaction(
  id: string,
  items: { item_id: string; quantity: number; reason?: string }[],
) {
  // ── SECURE PATH: delegate to process_return RPC ───────────────────────────
  // The RPC validates manager/admin role, item ownership, quantities, and
  // atomically restores stock in a single DB transaction — no race conditions.
  const { data, error } = await supabase.rpc('process_return', {
    p_transaction_id: id,
    p_items:  items.map((i) => ({ item_id: i.item_id, quantity: i.quantity })),
    p_reason: items[0]?.reason ?? '',
  })

  if (error) {
    const msg = error.message
    if (msg.includes('FORBIDDEN'))   throw new Error('Only managers and admins can process returns.')
    if (msg.includes('NOT_FOUND'))   throw new Error('Transaction not found.')
    if (msg.includes('INVALID'))     throw new Error(msg.split('INVALID: ')[1] ?? msg)
    throw new Error(msg)
  }

  return { ok: true, ...(data as { return_id: string; refund_amount: number }) }
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

interface SupabaseVoucher {
  id: string; code: string; type: string; value: number | string
  min_purchase: number | string; max_uses: number; used_count: number
  active: boolean; expires_at: string | null; description: string | null; created_at: string
}

function mapVoucher(v: SupabaseVoucher) {
  return {
    id: v.id, code: v.code,
    discount_type:  v.type as 'percent' | 'fixed',
    discount_value: Number(v.value),
    min_purchase:   Number(v.min_purchase),
    max_uses:       v.max_uses, used_count: v.used_count,
    active: v.active,
    expires_at: v.expires_at ?? undefined, created_at: v.created_at,
  }
}

export async function apiValidateVoucher(code: string, subtotal: number) {
  const { data: v, error } = await supabase
    .from('vouchers').select('*').eq('code', code.toUpperCase()).eq('active', true).maybeSingle()
  if (error || !v) return { valid: false, error: 'Voucher code not found or inactive.' }
  const voucher = v as SupabaseVoucher
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) return { valid: false, error: 'Voucher has expired.' }
  if (voucher.used_count >= voucher.max_uses) return { valid: false, error: 'Voucher usage limit reached.' }
  if (subtotal < Number(voucher.min_purchase)) return { valid: false, error: `Minimum purchase of ₱${voucher.min_purchase} required.` }
  const discount_amount = voucher.type === 'percent'
    ? (subtotal * Number(voucher.value)) / 100
    : Number(voucher.value)
  return { valid: true, discount_amount, discount_type: voucher.type, discount_value: Number(voucher.value) }
}

export async function apiGetVouchers(params?: Record<string, string>) {
  let q = supabase.from('vouchers').select('*', { count: 'exact' })
  if (params?.active === 'true') q = q.eq('active', true)
  const limit = parseInt(params?.limit ?? '50', 10)
  q = q.order('created_at', { ascending: false }).limit(limit)
  const { data, error, count } = await q
  if (error) throw new Error(error.message)
  return { data: (data as SupabaseVoucher[]).map(mapVoucher), total: count ?? 0 }
}

export async function apiCreateVoucher(data: Record<string, unknown>) {
  const staff = await getCurrentStaff()
  const { data: v, error } = await supabase
    .from('vouchers')
    .insert({
      branch_id:    staff?.branch_id,
      code:         (data.code as string).toUpperCase(),
      type:         data.discount_type as string,
      value:        Number(data.discount_value),
      min_purchase: Number(data.min_purchase ?? 0),
      max_uses:     Number(data.max_uses ?? 999999),
      active:       data.active !== false,
      expires_at:   (data.expires_at as string | undefined) ?? null,
      description:  (data.description as string | undefined) ?? null,
    })
    .select('*').single()
  if (error) throw new Error(error.message)
  return mapVoucher(v as SupabaseVoucher)
}

export async function apiUpdateVoucherById(id: string, data: Record<string, unknown>) {
  const col: Record<string, unknown> = {}
  if (data.discount_type  !== undefined) col.type        = data.discount_type
  if (data.discount_value !== undefined) col.value       = Number(data.discount_value)
  if (data.min_purchase   !== undefined) col.min_purchase = Number(data.min_purchase)
  if (data.max_uses       !== undefined) col.max_uses    = Number(data.max_uses)
  if (data.active         !== undefined) col.active      = data.active
  if (data.expires_at     !== undefined) col.expires_at  = data.expires_at
  if (data.code           !== undefined) col.code        = (data.code as string).toUpperCase()
  const { data: v, error } = await supabase
    .from('vouchers').update(col).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return mapVoucher(v as SupabaseVoucher)
}

export async function apiDeleteVoucher(id: string) {
  const { error } = await supabase.from('vouchers').delete().eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ─── Reports ──────────────────────────────────────────────────────────────────
// All computed client-side from Supabase data. Suitable for single-branch
// volumes. Aggregate RPCs can replace these later for larger datasets.

export async function apiSalesReport(params: Record<string, string>) {
  let q = supabase.from('transactions')
    .select('id, total, payment_method, created_at, transaction_items(product_id, product_name, quantity, subtotal), transaction_payments(method, amount)')
    .eq('status', 'completed')
  if (params.from) q = q.gte('created_at', params.from)
  if (params.to)   q = q.lte('created_at', params.to)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const txns = (data ?? []) as {
    id: string; total: number | string; payment_method: string; created_at: string
    transaction_items: { product_id: string; product_name: string; quantity: number; subtotal: number | string }[]
    transaction_payments: { method: string; amount: number | string }[]
  }[]

  const total_revenue      = txns.reduce((s, t) => s + Number(t.total), 0)
  const transaction_count  = txns.length
  const total_items_sold   = txns.reduce((s, t) => s + (t.transaction_items ?? []).reduce((is, i) => is + i.quantity, 0), 0)
  const avg_order_value    = transaction_count > 0 ? total_revenue / transaction_count : 0

  // Last 7 days by date
  const dayMap = new Map<string, { revenue: number; count: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    dayMap.set(d.toISOString().slice(0, 10), { revenue: 0, count: 0 })
  }
  for (const t of txns) {
    const day = t.created_at.slice(0, 10)
    if (dayMap.has(day)) {
      dayMap.get(day)!.revenue += Number(t.total)
      dayMap.get(day)!.count   += 1
    }
  }
  const salesByPeriod = [...dayMap.entries()].map(([date, v]) => ({ date, ...v }))

  // Top products
  const prodMap = new Map<string, { product_name: string; quantity_sold: number; revenue: number }>()
  for (const t of txns) {
    for (const item of (t.transaction_items ?? [])) {
      if (!prodMap.has(item.product_id)) {
        prodMap.set(item.product_id, { product_name: item.product_name, quantity_sold: 0, revenue: 0 })
      }
      prodMap.get(item.product_id)!.quantity_sold += item.quantity
      prodMap.get(item.product_id)!.revenue       += Number(item.subtotal)
    }
  }
  const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  // By payment method — sum amounts across all payment splits
  const methodMap: Record<string, { count: number; total: number }> = {}
  for (const t of txns) {
    for (const p of (t.transaction_payments ?? [])) {
      if (!methodMap[p.method]) methodMap[p.method] = { count: 0, total: 0 }
      methodMap[p.method].count += 1
      methodMap[p.method].total += Number(p.amount)
    }
    // Fallback for transactions that have no payment splits (legacy data)
    if (!t.transaction_payments?.length && t.payment_method) {
      const m = t.payment_method
      if (!methodMap[m]) methodMap[m] = { count: 0, total: 0 }
      methodMap[m].count += 1
      methodMap[m].total += Number(t.total)
    }
  }
  const byPaymentMethod = Object.entries(methodMap).map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.total - a.total)

  // Hourly heatmap — count and revenue per hour of day (0–23)
  const hourBuckets: { hour: number; count: number; revenue: number }[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h, count: 0, revenue: 0,
  }))
  for (const t of txns) {
    const hour = new Date(t.created_at).getHours()
    hourBuckets[hour].count   += 1
    hourBuckets[hour].revenue += Number(t.total)
  }
  const hourlyHeatmap = hourBuckets

  return {
    summary: { total_revenue, transaction_count, total_items_sold, avg_order_value },
    salesByPeriod,
    topProducts,
    byPaymentMethod,
    hourlyHeatmap,
  }
}

export async function apiFinancialReport(params: Record<string, string>) {
  let q = supabase.from('transactions')
    .select('total, payment_method, transaction_items(product_id, quantity, subtotal, products(cost)), transaction_payments(method, amount)')
    .eq('status', 'completed')
  if (params.from) q = q.gte('created_at', params.from)
  if (params.to)   q = q.lte('created_at', params.to)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const txns = (data as unknown as {
    total: number | string
    payment_method: string
    transaction_items: { product_id: string; quantity: number; subtotal: number | string; products: { cost: number | string } | null }[]
    transaction_payments: { method: string; amount: number | string }[]
  }[])

  const revenue = txns.reduce((s, t) => s + Number(t.total), 0)
  const cogs = txns.reduce((s, t) =>
    s + (t.transaction_items ?? []).reduce((is, i) =>
      is + Number(i.products?.cost ?? 0) * i.quantity, 0), 0)
  const gross_profit = revenue - cogs
  const gross_margin = revenue > 0 ? (gross_profit / revenue) * 100 : 0

  const { data: stockData } = await supabase
    .from('stock_levels').select('stock, products(cost)')
  const stock_value = (stockData ?? []).reduce((s, row) => {
    const r = row as unknown as { stock: number; products: { cost: number | string } | null }
    return s + (r.stock ?? 0) * Number(r.products?.cost ?? 0)
  }, 0)

  const paymentBreakdown: Record<string, number> = {}
  for (const t of txns) {
    for (const p of (t.transaction_payments ?? [])) {
      paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + Number(p.amount)
    }
  }

  return {
    revenue, cogs, gross_profit,
    gross_margin: gross_margin.toFixed(1),
    stock_value, transaction_count: txns.length, paymentBreakdown,
  }
}

export async function apiStaffReport(params: Record<string, string>) {
  let q = supabase.from('transactions')
    .select('staff_id, total, transaction_items(quantity), staff(name)')
    .eq('status', 'completed')
  if (params.from) q = q.gte('created_at', params.from)
  if (params.to)   q = q.lte('created_at', params.to)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const txns = (data as unknown as {
    staff_id: string | null
    total: number | string
    transaction_items: { quantity: number }[]
    staff: { name: string } | null
  }[])

  const staffMap = new Map<string, { transaction_count: number; revenue: number; items_sold: number }>()
  for (const t of txns) {
    if (!t.staff_id) continue
    if (!staffMap.has(t.staff_id)) staffMap.set(t.staff_id, { transaction_count: 0, revenue: 0, items_sold: 0 })
    const s = staffMap.get(t.staff_id)!
    s.transaction_count++
    s.revenue    += Number(t.total)
    s.items_sold += (t.transaction_items ?? []).reduce((is, i) => is + i.quantity, 0)
  }

  const { data: staffRows } = await supabase.from('staff').select('id, name, role').eq('status', 'active')
  const staffPerformance = (staffRows ?? []).map((u) => {
    const s = staffMap.get((u as { id: string }).id) ?? { transaction_count: 0, revenue: 0, items_sold: 0 }
    return { staff_id: (u as { id: string }).id, name: (u as { name: string }).name, role: (u as { role: string }).role, ...s }
  })

  return { staffPerformance }
}

export async function apiInventoryReport(params?: Record<string, string>) {
  let stockQ = supabase.from('stock_levels').select('*, products(name, sku, price, cost, categories(name))')
  if (params?.branch_id) stockQ = stockQ.eq('branch_id', params.branch_id)
  const { data: stockData } = await stockQ

  const stockSummary = (stockData as unknown as SupabaseStockLevel[] ?? []).map((s) => ({
    id: s.id, name: s.products?.name ?? '', sku: s.products?.sku ?? '',
    price: String(s.products?.price ?? 0), cost: String(s.products?.cost ?? 0),
    category_name: s.products?.categories?.name ?? '',
    total_stock: s.stock, reorder_point: s.reorder_point,
    stock_value: String(Number(s.products?.cost ?? 0) * s.stock),
  }))

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: recentTxData } = await supabase.from('transactions')
    .select('transaction_items(product_id, product_name, quantity, subtotal)')
    .eq('status', 'completed').gte('created_at', cutoff)
  const moverMap = new Map<string, { product_id: string; product_name: string; quantity_sold: number; revenue: number }>()
  for (const tx of (recentTxData ?? []) as { transaction_items: { product_id: string; product_name: string; quantity: number; subtotal: number | string }[] }[]) {
    for (const item of (tx.transaction_items ?? [])) {
      if (!moverMap.has(item.product_id)) moverMap.set(item.product_id, { product_id: item.product_id, product_name: item.product_name, quantity_sold: 0, revenue: 0 })
      moverMap.get(item.product_id)!.quantity_sold += item.quantity
      moverMap.get(item.product_id)!.revenue       += Number(item.subtotal)
    }
  }
  const fastMovers = [...moverMap.values()]
    .sort((a, b) => b.quantity_sold - a.quantity_sold)
    .map((m) => ({ ...m, revenue: String(m.revenue) }))

  // Stock movement summary from adjustments
  const { data: adjData } = await supabase.from('stock_adjustments').select('type, quantity')
  const movMap = new Map<string, { type: string; count: number; total_quantity: number }>()
  for (const adj of (adjData ?? []) as { type: string; quantity: number }[]) {
    const bucket = (adj.type === 'in' || adj.type === 'return') ? 'add' : 'remove'
    if (!movMap.has(bucket)) movMap.set(bucket, { type: bucket, count: 0, total_quantity: 0 })
    const m = movMap.get(bucket)!
    m.count++; m.total_quantity += adj.quantity
  }
  const stockMovement = [...movMap.values()]

  // Value by category
  const catMap = new Map<string, { category: string; products: number; total_stock: number; total_value: number }>()
  for (const s of (stockData as unknown as SupabaseStockLevel[] ?? [])) {
    const cat = s.products?.categories?.name ?? 'Uncategorized'
    if (!catMap.has(cat)) catMap.set(cat, { category: cat, products: 0, total_stock: 0, total_value: 0 })
    const c = catMap.get(cat)!
    c.products++
    c.total_stock += s.stock
    c.total_value += Number(s.products?.cost ?? 0) * s.stock
  }
  const valueByCategory = [...catMap.values()].map((c) => ({ ...c, total_value: String(c.total_value) }))

  return { stockSummary, fastMovers, stockMovement, valueByCategory }
}

// ─── Staff ────────────────────────────────────────────────────────────────────

interface SupabaseStaff {
  id: string; name: string; email: string | null; role: string
  branch_id: string | null; status: string; sales_count: number
  last_login: string | null; created_at: string
}

function mapStaff(u: SupabaseStaff, branchName = 'Main Branch') {
  return {
    id: u.id, name: u.name, email: u.email ?? '', role: u.role,
    branch: branchName, branch_id: u.branch_id,
    status: u.status as 'active' | 'inactive',
    lastLogin: u.last_login ?? null,   // null means never logged in; don't fabricate a timestamp
    salesCount: u.sales_count, created_at: u.created_at,
  }
}

export async function apiGetStaff(params?: Record<string, string>) {
  let q = supabase.from('staff').select('*', { count: 'exact' })
  if (params?.role)   q = q.eq('role', params.role)
  if (params?.status) q = q.eq('status', params.status)
  if (params?.q) {
    const term = params.q
    q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%`)
  }
  const limit = parseInt(params?.limit ?? '50', 10)
  q = q.order('name').limit(limit)
  const { data, error, count } = await q
  if (error) throw new Error(error.message)
  return { data: (data as SupabaseStaff[]).map((u) => mapStaff(u)), total: count ?? 0 }
}

export async function apiGetStaffMember(id: string) {
  const { data: u, error } = await supabase.from('staff').select('*').eq('id', id).single()
  if (error || !u) throw new Error('Staff member not found')

  const { data: txns } = await supabase
    .from('transactions').select('id, receipt_no, total, created_at, status')
    .eq('staff_id', id).eq('status', 'completed').order('created_at', { ascending: false }).limit(5)

  const { data: revenueData }   = await supabase.from('transactions').select('total').eq('staff_id', id).eq('status', 'completed')
  const totalRevenue = (revenueData ?? []).reduce((s, t) => s + Number((t as { total: number }).total), 0)

  const staff = u as SupabaseStaff
  return {
    ...mapStaff(staff),
    recent_transactions: txns ?? [],
    total_revenue: totalRevenue,
  }
}

export async function apiCreateStaff(data: Record<string, unknown>) {
  const current = await getCurrentStaff()
  const email    = (data.email as string).toLowerCase().trim()
  const password = data.password as string | undefined

  if (!password || password.length < 8) {
    throw new Error('A password of at least 8 characters is required to create a staff account.')
  }

  // 1. Create the Supabase Auth user via a non-persisting client so we don't
  //    replace the current admin's session.
  const { data: authData, error: signUpErr } = await _signupClient.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: undefined },
  })
  if (signUpErr) throw new Error(`Auth error: ${signUpErr.message}`)
  const authId = authData.user?.id
  if (!authId) throw new Error('Failed to create auth account — no user ID returned.')

  // 2. Insert the staff row with the new auth_id
  const { data: staff, error } = await supabase
    .from('staff')
    .insert({
      auth_id:   authId,
      branch_id: (data.branch_id as string | null) ?? current?.branch_id,
      name:      data.name  as string,
      email,
      role:      data.role  as string,
      status:    'active',
    })
    .select('*').single()

  if (error) {
    // The auth user was created but the staff row failed — sign out the
    // orphaned account using the isolated client to prevent ghost users.
    try { await _signupClient.auth.signOut() } catch { /* best effort */ }
    throw new Error(`Auth account created but staff profile failed: ${error.message}. The auth user may need manual cleanup.`)
  }

  void addAudit('STAFF_CREATED', `Created staff: ${(staff as SupabaseStaff).name} (${(staff as SupabaseStaff).role})`, 'info')
  return mapStaff(staff as SupabaseStaff)
}

export async function apiUpdateStaff(id: string, data: Record<string, unknown>) {
  const col: Record<string, unknown> = {}
  if (data.name      !== undefined) col.name      = data.name
  if (data.email     !== undefined) col.email     = data.email
  if (data.role      !== undefined) col.role      = data.role
  if (data.status    !== undefined) col.status    = data.status
  if (data.branch_id !== undefined) col.branch_id = data.branch_id

  const { data: staff, error } = await supabase
    .from('staff').update(col).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)

  // Password changes require service-role privileges which the browser client
  // does not have. Instruct the admin to use the Supabase dashboard instead.
  if (data.password) {
    throw new Error(
      'Profile saved successfully. ' +
      'Password changes must be made in the Supabase dashboard: ' +
      'Authentication → Users → select the user → Send reset email, ' +
      'or set a new password directly.',
    )
  }

  return mapStaff(staff as SupabaseStaff)
}

export async function apiDeleteStaff(id: string) {
  // Soft-delete: deactivate the staff member rather than hard-deleting.
  // This preserves historical transaction references and the audit trail.
  const { data: u } = await supabase.from('staff').select('name').eq('id', id).single()
  const { error }   = await supabase.from('staff').update({ status: 'inactive' }).eq('id', id)
  if (error) throw new Error(error.message)
  void addAudit('STAFF_DEACTIVATED', `Deactivated staff: ${(u as { name: string } | null)?.name ?? id}`, 'warning')
  return { ok: true }
}

// ─── Branches ─────────────────────────────────────────────────────────────────

interface SupabaseBranch {
  id: string; name: string; address: string | null; manager_name: string | null
  active: boolean; terminal_count: number
}

function mapBranch(b: SupabaseBranch) {
  return {
    id: b.id, name: b.name, address: b.address ?? '',
    managerName: b.manager_name ?? '', active: b.active, terminalCount: b.terminal_count,
  }
}

export async function apiGetBranches() {
  const { data, error } = await supabase.from('branches').select('*').eq('active', true).order('name')
  if (error) throw new Error(error.message)
  return (data as SupabaseBranch[]).map(mapBranch)
}

export async function apiCreateBranch(data: Record<string, unknown>) {
  const { data: branch, error } = await supabase
    .from('branches')
    .insert({
      name:         data.name         as string,
      address:      (data.address      as string | undefined) ?? null,
      manager_name: (data.manager_name as string | undefined) ?? null,
      active: true, terminal_count: 1,
    })
    .select('*').single()
  if (error) throw new Error(error.message)
  return mapBranch(branch as SupabaseBranch)
}

export async function apiUpdateBranch(id: string, data: Record<string, unknown>) {
  const col: Record<string, unknown> = {}
  if (data.name         !== undefined) col.name         = data.name
  if (data.address      !== undefined) col.address      = data.address
  if (data.manager_name !== undefined) col.manager_name = data.manager_name
  if (data.active       !== undefined) col.active       = data.active
  const { data: branch, error } = await supabase
    .from('branches').update(col).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return mapBranch(branch as SupabaseBranch)
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export async function apiGetAuditLog(params?: Record<string, string>) {
  let q = supabase.from('audit_log')
    .select('id, action, details, severity, ip, created_at, staff(name)', { count: 'exact' })

  if (params?.severity) q = q.eq('severity', params.severity)
  if (params?.q) {
    const term = params.q
    q = q.or(`action.ilike.%${term}%,details.ilike.%${term}%`)
  }

  const page   = parseInt(params?.page  ?? '1',  10)
  const limit  = parseInt(params?.limit ?? '30', 10)
  const offset = (page - 1) * limit
  q = q.range(offset, offset + limit - 1).order('created_at', { ascending: false })

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  const entries = (data ?? []).map((e) => {
    const row = e as unknown as { id: string; action: string; details: string | null; severity: string; ip: string | null; created_at: string; staff: { name: string } | null }
    return {
      id: row.id, action: row.action,
      user: row.staff?.name ?? 'System',
      details: row.details ?? '',
      ip: row.ip ?? '—',
      timestamp: row.created_at,
      severity: row.severity as 'info' | 'warning' | 'critical',
    }
  })
  return { data: entries, total: count ?? 0, page, limit }
}

// ─── Stock adjustments ────────────────────────────────────────────────────────

export async function apiGetAdjustments(params?: Record<string, string>) {
  let q = supabase.from('stock_adjustments')
    .select('*, products(name, sku), staff(name)', { count: 'exact' })
  if (params?.product_id) q = q.eq('product_id', params.product_id)
  if (params?.branch_id)  q = q.eq('branch_id',  params.branch_id)
  const limit = parseInt(params?.limit ?? '50', 10)
  q = q.order('created_at', { ascending: false }).limit(limit)
  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []).map((a) => {
    const adj = a as unknown as {
      id: string; product_id: string; type: string; quantity: number
      reason: string | null; created_at: string; branch_id: string
      products: { name: string; sku: string } | null
      staff: { name: string } | null
    }
    return {
      id: adj.id, product_id: adj.product_id,
      product_name: adj.products?.name ?? adj.product_id,
      type: adj.type as 'in' | 'out' | 'correction' | 'damage' | 'return',
      quantity: adj.quantity, reason: adj.reason ?? '',
      by: adj.staff?.name ?? 'System',
      branch_id: adj.branch_id, created_at: adj.created_at,
    }
  })
  return { data: rows, total: count ?? 0 }
}

export async function apiCreateAdjustment(data: {
  product_id: string; type: 'in' | 'out' | 'correction' | 'damage' | 'return'
  quantity: number; reason: string; branch_id: string
}) {
  // ── SECURE PATH: delegate to apply_stock_adjustment RPC ──────────────────
  // The RPC atomically inserts the adjustment record AND updates stock in one
  // DB transaction — eliminates the read-then-write race condition.
  const { error } = await supabase.rpc('apply_stock_adjustment', {
    p_product_id: data.product_id,
    p_branch_id:  data.branch_id,
    p_type:       data.type,
    p_quantity:   data.quantity,
    p_reason:     data.reason,
  })

  if (error) {
    const msg = error.message
    if (msg.includes('FORBIDDEN')) throw new Error('Only managers and admins can adjust stock.')
    if (msg.includes('INVALID'))   throw new Error(msg.split('INVALID: ')[1] ?? msg)
    throw new Error(msg)
  }

  // Re-fetch a fresh copy for the UI (the RPC returns only the adjustment_id)
  const { data: rows } = await supabase
    .from('stock_adjustments')
    .select('id, product_id, type, quantity, reason, branch_id, created_at, products(name, sku), staff(name)')
    .eq('product_id', data.product_id)
    .eq('branch_id',  data.branch_id)
    .order('created_at', { ascending: false })
    .limit(1)

  const adj = rows?.[0] as unknown as {
    id: string; product_id: string; type: string; quantity: number
    reason: string | null; branch_id: string; created_at: string
    products: { name: string; sku: string } | null
    staff: { name: string } | null
  } | undefined

  return {
    id:           adj?.id           ?? '',
    product_id:   adj?.product_id   ?? data.product_id,
    product_name: adj?.products?.name ?? data.product_id,
    type:         (adj?.type         ?? data.type) as 'in' | 'out' | 'correction' | 'damage' | 'return',
    quantity:     adj?.quantity      ?? data.quantity,
    reason:       adj?.reason        ?? data.reason,
    by:           adj?.staff?.name   ?? 'Manager',
    branch_id:    adj?.branch_id     ?? data.branch_id,
    created_at:   adj?.created_at    ?? new Date().toISOString(),
  }
}
