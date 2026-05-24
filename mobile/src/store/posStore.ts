import { create } from 'zustand'
import type { CartItem, Product, ProductVariant, Payment } from '../types'
import { submitTransaction } from '../lib/sync'
import { db } from '../lib/db'

interface TransactionResult {
  receipt_no: string
  id: string
  offline: boolean
}

interface POSState {
  cart: CartItem[]
  searchQuery: string
  syncStatus: 'online' | 'offline' | 'syncing' | 'pending'
  pendingCount: number
  lastTransactionId: string | null

  addToCart: (product: Product, variant?: ProductVariant) => void
  removeFromCart: (productId: string, variantId?: string) => void
  updateQty: (productId: string, qty: number, variantId?: string) => void
  applyDiscount: (productId: string, discount: number, variantId?: string) => void
  clearCart: () => void
  setSearch: (q: string) => void
  setSyncStatus: (s: POSState['syncStatus']) => void
  setPendingCount: (n: number) => void
  setLastTransactionId: (id: string) => void

  cartSubtotal: () => number
  cartTotal: () => number

  // Submits the cart as a transaction — works offline
  checkoutCart: (
    branchId: string,
    payments: Payment[],
    discountAmount: number,
    voucherCode?: string
  ) => Promise<TransactionResult>
}

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  searchQuery: '',
  syncStatus: 'offline',   // UX-03: start pessimistic; SyncBootstrap sets real status on first check
  pendingCount: 0,
  lastTransactionId: null,

  addToCart: (product, variant) => set((state) => {
    const variantId = variant?.id
    const existing = state.cart.find(
      (i) => i.product.id === product.id && i.variant?.id === variantId
    )
    const currentQty = existing?.quantity ?? 0

    // Prevent adding more than available stock (0-stock items blocked at UI level too)
    if (product.stock > 0 && currentQty >= product.stock) {
      return state // silently block — UI already shows the stock badge
    }

    if (existing) {
      return {
        cart: state.cart.map((i) =>
          i.product.id === product.id && i.variant?.id === variantId
            ? { ...i, quantity: i.quantity + 1 }
            : i
        ),
      }
    }
    return { cart: [...state.cart, { product, quantity: 1, variant, discount: 0 }] }
  }),

  removeFromCart: (productId, variantId) =>
    set((state) => ({
      cart: state.cart.filter(
        (i) => !(i.product.id === productId && (i.variant?.id ?? undefined) === variantId)
      ),
    })),

  updateQty: (productId, qty, variantId) =>
    set((state) => ({
      cart: qty <= 0
        ? state.cart.filter(
            (i) => !(i.product.id === productId && (i.variant?.id ?? undefined) === variantId)
          )
        : state.cart.map((i) =>
            i.product.id === productId && (i.variant?.id ?? undefined) === variantId
              ? { ...i, quantity: qty }
              : i
          ),
    })),

  applyDiscount: (productId, discount, variantId) =>
    set((state) => ({
      cart: state.cart.map((i) =>
        i.product.id === productId && (i.variant?.id ?? undefined) === variantId
          ? { ...i, discount }
          : i
      ),
    })),

  clearCart: () => set({ cart: [] }),
  setSearch: (q) => set({ searchQuery: q }),
  setSyncStatus: (s) => set({ syncStatus: s }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setLastTransactionId: (id) => set({ lastTransactionId: id }),

  cartSubtotal: () => {
    const { cart } = get()
    return cart.reduce((sum, item) => {
      const price = item.product.price + (item.variant?.priceAdjustment ?? 0)
      return sum + price * item.quantity - item.discount
    }, 0)
  },

  cartTotal: () => get().cartSubtotal(),

  checkoutCart: async (branchId, payments, discountAmount, voucherCode) => {
    const { cart } = get()
    if (!cart.length) throw new Error('Cart is empty')

    // Re-validate stock against current Dexie cache before submitting
    for (const item of cart) {
      const variantId = item.variant?.id
      const invKey = `${item.product.id}_${variantId ?? 'base'}_${branchId}`
      const inv = await db.inventory.get(invKey)
      const available = inv?.stock ?? item.product.stock
      if (available < item.quantity) {
        throw new Error(
          `"${item.product.name}" only has ${available} in stock (you requested ${item.quantity}). Please reduce the quantity.`
        )
      }
    }

    const payload = {
      branch_id: branchId,
      items: cart.map((item) => ({
        product_id: item.product.id,
        variant_id: item.variant?.id,
        quantity: item.quantity,
        unit_price: item.product.price + (item.variant?.priceAdjustment ?? 0),
        discount: item.discount,
        note: item.note,
      })),
      payments: payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference,
      })),
      discount: discountAmount,
      voucher_code: voucherCode,
    }

    // submitTransaction handles online/offline automatically
    const result = await submitTransaction(payload)
    get().clearCart()
    get().setLastTransactionId(result.id)
    return result
  },
}))
