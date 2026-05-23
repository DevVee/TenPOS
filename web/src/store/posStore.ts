import { create } from 'zustand'
import type { CartItem, Product, ProductVariant, Payment } from '../types'
import { submitTransaction } from '../lib/sync'
import { calcSubtotal } from '@tenpos/shared'

interface TransactionResult {
  receipt_no: string
  id: string
  offline: boolean
}

interface POSState {
  cart: CartItem[]
  searchQuery: string
  syncStatus: 'online' | 'offline' | 'syncing' | 'pending'

  addToCart: (product: Product, variant?: ProductVariant) => void
  removeFromCart: (productId: string, variantId?: string) => void
  updateQty: (productId: string, qty: number, variantId?: string) => void
  applyDiscount: (productId: string, discount: number, variantId?: string) => void
  clearCart: () => void
  setSearch: (q: string) => void
  setSyncStatus: (s: POSState['syncStatus']) => void

  cartSubtotal: () => number

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
  syncStatus: 'online',

  addToCart: (product, variant) => set((state) => {
    const existing = state.cart.find(
      (i) => i.product.id === product.id && i.variant?.id === variant?.id
    )
    if (existing) {
      return {
        cart: state.cart.map((i) =>
          i.product.id === product.id && i.variant?.id === variant?.id
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

  cartSubtotal: () => calcSubtotal(get().cart),

  checkoutCart: async (branchId, payments, discountAmount, voucherCode) => {
    const { cart } = get()
    if (!cart.length) throw new Error('Cart is empty')

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
    return result
  },
}))
