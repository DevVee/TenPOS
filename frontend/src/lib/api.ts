// Central API client — reads base URL from env, attaches auth token, handles errors

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000'

function getToken(): string | null {
  return localStorage.getItem('tenpos_access_token')
}

function getRefreshToken(): string | null {
  return localStorage.getItem('tenpos_refresh_token')
}

function saveTokens(access: string, refresh: string) {
  localStorage.setItem('tenpos_access_token', access)
  localStorage.setItem('tenpos_refresh_token', refresh)
}

function clearTokens() {
  localStorage.removeItem('tenpos_access_token')
  localStorage.removeItem('tenpos_refresh_token')
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) { clearTokens(); return null }
    const data = await res.json() as { accessToken: string; refreshToken: string }
    saveTokens(data.accessToken, data.refreshToken)
    return data.accessToken
  } catch {
    return null
  }
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, ...fetchOptions } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  }

  if (!skipAuth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers })

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`
      const retried = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers })
      if (!retried.ok) {
        const err = await retried.json().catch(() => ({ error: 'Request failed' })) as { error: string }
        throw new Error(err.error || `HTTP ${retried.status}`)
      }
      return retried.json() as Promise<T>
    } else {
      clearTokens()
      window.dispatchEvent(new Event('tenpos:logout'))
      throw new Error('Session expired. Please sign in again.')
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' })) as { error: string }
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function apiLogin(email: string, password: string) {
  const data = await request<{
    accessToken: string
    refreshToken: string
    user: { id: string; name: string; email: string; role: string; branch_id: string | null }
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  })
  saveTokens(data.accessToken, data.refreshToken)
  return data
}

export async function apiLogout(refreshToken?: string) {
  try {
    await request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refreshToken ?? getRefreshToken() }),
    })
  } finally {
    clearTokens()
  }
}

export async function apiMe() {
  return request<{ id: string; name: string; email: string; role: string; branch_id: string | null }>('/api/auth/me')
}

export async function apiVerifyPin(pin: string) {
  return request<{ valid: boolean }>('/api/auth/pin/verify', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  })
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function apiGetProducts(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<{ data: unknown[]; total: number }>(`/api/products${qs}`)
}

export async function apiGetProductByBarcode(barcode: string) {
  return request<unknown>(`/api/products/barcode/${barcode}`)
}

export async function apiCreateProduct(data: Record<string, unknown>) {
  return request<unknown>('/api/products', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateProduct(id: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function apiDeleteProduct(id: string) {
  return request<unknown>(`/api/products/${id}`, { method: 'DELETE' })
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function apiGetCategories() {
  return request<unknown[]>('/api/products/categories')
}

export async function apiCreateCategory(data: { name: string; description?: string }) {
  return request<unknown>('/api/products/categories', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateCategory(id: string, data: { name?: string; description?: string }) {
  return request<unknown>(`/api/products/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function apiDeleteCategory(id: string) {
  return request<unknown>(`/api/products/categories/${id}`, { method: 'DELETE' })
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export async function apiGetInventory(branchId?: string) {
  const qs = branchId ? `?branch_id=${branchId}` : ''
  return request<unknown[]>(`/api/inventory${qs}`)
}

export async function apiGetLowStock(branchId?: string) {
  const qs = branchId ? `?branch_id=${branchId}` : ''
  return request<unknown[]>(`/api/inventory/low-stock${qs}`)
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function apiCreateTransaction(payload: {
  branch_id: string
  items: { product_id: string; variant_id?: string; quantity: number; unit_price: number; discount: number; note?: string }[]
  payments: { method: string; amount: number; reference?: string }[]
  discount: number
  voucher_code?: string
}) {
  return request<{ id: string; receipt_no: string; total: number }>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function apiGetTransactions(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<{ data: unknown[]; total: number }>(`/api/transactions${qs}`)
}

export async function apiGetTransaction(id: string) {
  return request<unknown>(`/api/transactions/${id}`)
}

export async function apiVoidTransaction(id: string, reason: string) {
  return request(`/api/transactions/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function apiReturnTransaction(
  id: string,
  items: { item_id: string; quantity: number; reason?: string }[]
) {
  return request(`/api/transactions/${id}/return`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

export async function apiValidateVoucher(code: string, subtotal: number) {
  return request<{
    valid: boolean
    discount_amount?: number
    discount_type?: string
    discount_value?: number
    error?: string
  }>('/api/vouchers/validate', {
    method: 'POST',
    body: JSON.stringify({ code, subtotal }),
  })
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function apiSalesReport(params: Record<string, string>) {
  return request<unknown>('/api/reports/sales?' + new URLSearchParams(params).toString())
}

export async function apiFinancialReport(params: Record<string, string>) {
  return request<unknown>('/api/reports/financial?' + new URLSearchParams(params).toString())
}

export async function apiStaffReport(params: Record<string, string>) {
  return request<unknown>('/api/reports/staff?' + new URLSearchParams(params).toString())
}

export async function apiInventoryReport(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<unknown>(`/api/reports/inventory${qs}`)
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function apiGetStaff(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<{ data: unknown[]; total: number }>(`/api/staff${qs}`)
}

export async function apiGetStaffMember(id: string) {
  return request<unknown>(`/api/staff/${id}`)
}

export async function apiCreateStaff(data: Record<string, unknown>) {
  return request<unknown>('/api/staff', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateStaff(id: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function apiDeleteStaff(id: string) {
  return request<unknown>(`/api/staff/${id}`, { method: 'DELETE' })
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function apiGetBranches() {
  return request<unknown[]>('/api/branches')
}

export async function apiCreateBranch(data: Record<string, unknown>) {
  return request<unknown>('/api/branches', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateBranch(id: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function apiGetAuditLog(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<{ data: unknown[]; total: number; page: number; limit: number }>(`/api/audit${qs}`)
}

// ─── Products (single) ────────────────────────────────────────────────────────

export async function apiGetProduct(id: string) {
  return request<unknown>(`/api/products/${id}`)
}

// ─── Vouchers CRUD ────────────────────────────────────────────────────────────

export async function apiGetVouchers(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<{ data: unknown[]; total: number }>(`/api/vouchers${qs}`)
}

export async function apiCreateVoucher(data: Record<string, unknown>) {
  return request<unknown>('/api/vouchers', { method: 'POST', body: JSON.stringify(data) })
}

export async function apiUpdateVoucherById(id: string, data: Record<string, unknown>) {
  return request<unknown>(`/api/vouchers/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function apiDeleteVoucher(id: string) {
  return request<unknown>(`/api/vouchers/${id}`, { method: 'DELETE' })
}

// ─── Inventory adjustments ────────────────────────────────────────────────────

export async function apiGetAdjustments(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<{ data: unknown[]; total: number }>(`/api/inventory/adjustments${qs}`)
}

export async function apiCreateAdjustment(data: {
  product_id: string
  type: 'in' | 'out' | 'correction' | 'damage' | 'return'
  quantity: number
  reason: string
  branch_id: string
}) {
  return request<unknown>('/api/inventory/adjustments', { method: 'POST', body: JSON.stringify(data) })
}

export { BASE_URL, getToken, getRefreshToken, saveTokens, clearTokens }
