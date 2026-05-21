import { useState, useEffect, useMemo, type ElementType } from 'react'
import { Search, Plus, Minus, Trash2, X, Tag, ChevronRight, Wifi, ArrowLeft, LogOut, Package, ShoppingBag, Loader2, ShoppingCart, Info } from 'lucide-react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import type { Product, CartItem } from '../../types'
import { useNavigate } from 'react-router-dom'
import { apiGetProducts } from '../../lib/api'
import { subscribeProducts, subscribeStock } from '../../lib/realtime'

const CATEGORY_ICONS: Record<string, ElementType> = {
  'Large Schoolbag':  ShoppingBag,
  'Medium Schoolbag': Package,
}

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

export function POSTerminal() {
  const navigate = useNavigate()
  const { cart, addToCart, removeFromCart, updateQty, clearCart, searchQuery, setSearch, cartSubtotal } = usePOSStore()
  const { user, logout } = useAuthStore()

  const [activeCategory, setActiveCategory] = useState('All')
  const [discountInput, setDiscountInput]   = useState<Record<string, string>>({})
  const [products, setProducts]             = useState<Product[]>([])
  const [loading, setLoading]               = useState(true)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [infoProduct, setInfoProduct]       = useState<Product | null>(null)

  useEffect(() => {
    let alive = true

    const reload = async () => {
      try {
        const { data } = await apiGetProducts({ limit: '500', active: 'true' })
        if (!alive) return
        setProducts(
          data
            .filter((p) => p.active)
            .map((p) => ({
              id:           p.id,
              name:         p.name,
              sku:          p.sku,
              barcode:      p.barcode ?? '',
              category:     p.category_name || 'Other',
              price:        p.price,
              cost:         p.cost,
              stock:        p.stock,
              reorderPoint: p.reorder_point,
              imageUrl:     p.image_url,
              variants:     p.variants.map((v) => ({
                id: v.id, label: v.label, value: v.value,
                priceAdjustment: v.price_adjustment, stock: 0,
              })),
              // Extended optional fields
              description:  p.description,
              brand:        p.brand,
              material:     p.material,
              color:        p.color,
              weightGrams:  p.weight_grams,
              lengthCm:     p.length_cm,
              widthCm:      p.width_cm,
              heightCm:     p.height_cm,
              tags:         p.tags,
              notes:        p.notes,
            }))
        )
      } catch {
        // network error — keep existing products shown
      } finally {
        if (alive) setLoading(false)
      }
    }

    reload()

    // Realtime: re-fetch from Supabase whenever products or stock change
    const u1 = subscribeProducts(reload)
    const u2 = subscribeStock(reload)

    return () => { alive = false; u1(); u2() }
  }, [])

  const allCats  = useMemo(() => ['All', ...[...new Set(products.map((p) => p.category).filter(Boolean))].sort()], [products])
  const filtered = products.filter((p) => {
    const matchCat    = activeCategory === 'All' || p.category === activeCategory
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  const subtotal  = cartSubtotal()
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F7] overflow-hidden">

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-gray-200/80 flex items-center justify-between px-4 flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors flex items-center justify-center"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <img
            src="/brand/logo.png"
            alt="TEN"
            className="h-8 w-8 object-contain rounded-lg"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="hidden sm:block">
            <p className="font-bold text-gray-900 text-sm leading-none">POS Terminal</p>
            <p className="text-[11px] text-gray-400 leading-none mt-0.5">{user?.branch ?? 'Main Branch'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Online indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-semibold bg-green-50 text-green-700">
            <Wifi className="w-3 h-3" />
            <span>Online</span>
          </div>

          {/* Mobile cart toggle */}
          <button
            onClick={() => setMobileCartOpen(true)}
            className="lg:hidden relative w-9 h-9 rounded-lg bg-brand text-white flex items-center justify-center shadow-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-yellow-400 text-gray-900 text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow">
                {itemCount}
              </span>
            )}
          </button>

          {user && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-pale flex items-center justify-center">
                <span className="text-xs font-black text-brand">{user.avatarInitials}</span>
              </div>
              <button
                onClick={handleLogout}
                className="w-9 h-9 rounded-lg hover:bg-red-50 text-gray-400 hover:text-brand flex items-center justify-center transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── BODY ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Products ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Search bar */}
          <div className="bg-white px-4 py-2.5 border-b border-gray-200/80">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
                placeholder="Search product or scan barcode…"
                value={searchQuery}
                onChange={(e) => setSearch(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-all">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="bg-white px-3 py-2 border-b border-gray-200/80 flex gap-1.5 overflow-x-auto">
            {allCats.map((cat) => {
              const Icon  = cat === 'All' ? Tag : (CATEGORY_ICONS[cat] ?? Package)
              const count = cat === 'All' ? products.length : products.filter((p) => p.category === cat).length
              const active = activeCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    active
                      ? 'bg-brand text-white shadow-md shadow-brand/20'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-gray-500'}`} />
                  <span>{cat}</span>
                  <span className={`text-xs ${active ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
                <p className="text-sm font-semibold">Loading products…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-300 gap-3">
                <Search className="w-10 h-10" />
                <p className="text-sm font-semibold text-gray-400">No products found</p>
                {searchQuery && (
                  <button onClick={() => setSearch('')} className="text-xs text-brand underline">Clear search</button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {filtered.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id)
                  const isLow  = product.stock > 0 && product.stock <= product.reorderPoint
                  const isOut  = product.stock === 0
                  return (
                    <div
                      key={product.id}
                      className={`relative text-left rounded-2xl border-2 transition-all duration-150 overflow-hidden ${
                        isOut
                          ? 'border-gray-100 opacity-55 bg-white'
                          : inCart
                          ? 'border-brand bg-white shadow-lg shadow-brand/15'
                          : 'border-gray-100 bg-white hover:border-gray-300 hover:shadow-md'
                      }`}
                    >
                      {/* Clickable image + name area → Add to Cart */}
                      <div
                        onClick={() => !isOut && addToCart(product)}
                        className={!isOut ? 'cursor-pointer active:scale-95 transition-transform' : 'cursor-not-allowed'}
                      >
                        {/* Product image */}
                        <div className="relative w-full aspect-square bg-gray-50">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className={`w-full h-full object-cover ${isOut ? 'grayscale' : ''}`}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-12 h-12 text-gray-200" />
                            </div>
                          )}

                          {/* Out of stock overlay */}
                          {isOut && (
                            <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
                              <span className="bg-gray-800 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg tracking-wide">OUT OF STOCK</span>
                            </div>
                          )}

                          {/* Cart quantity badge */}
                          {inCart && !isOut && (
                            <span className="absolute top-2 left-2 min-w-[24px] h-6 bg-brand text-white rounded-full text-xs font-black flex items-center justify-center px-1.5 shadow-lg">
                              {inCart.quantity}
                            </span>
                          )}

                          {/* Low stock badge */}
                          {isLow && !isOut && (
                            <span className="absolute top-2 right-2 bg-yellow-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow leading-none">
                              LOW
                            </span>
                          )}

                          {/* In-cart highlight ring */}
                          {inCart && !isOut && (
                            <div className="absolute inset-0 ring-2 ring-brand/30 rounded-t-xl pointer-events-none" />
                          )}
                        </div>

                        {/* Product name + SKU */}
                        <div className="px-2.5 pt-2.5 pb-1">
                          <p className="text-xs font-bold text-gray-900 leading-tight line-clamp-2 mb-0.5">{product.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{product.sku}</p>
                        </div>
                      </div>

                      {/* Price + Stock + Info button row */}
                      <div className="flex items-center justify-between px-2.5 pb-2.5 gap-1">
                        <p className="text-sm font-black text-brand">{fmt(product.price)}</p>
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            isOut  ? 'bg-gray-100 text-gray-400' :
                            isLow  ? 'bg-yellow-50 text-yellow-700' :
                                     'bg-green-50 text-green-700'
                          }`}>
                            {product.stock} left
                          </span>
                          {/* ⓘ Info button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setInfoProduct(product) }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-brand-pale hover:text-brand active:scale-95 transition-all"
                            title="View details"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart (Desktop) ─────────────────────────────────── */}
        <div className="hidden lg:flex w-80 xl:w-96 flex-col bg-white border-l border-gray-200/80 shadow-sm">
          <CartPanel
            cart={cart}
            itemCount={itemCount}
            subtotal={subtotal}
            discountInput={discountInput}
            setDiscountInput={setDiscountInput}
            removeFromCart={removeFromCart}
            updateQty={updateQty}
            clearCart={clearCart}
            navigate={navigate}
          />
        </div>
      </div>

      {/* ── MOBILE CART DRAWER ──────────────────────────────────────── */}
      {mobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setMobileCartOpen(false)} />
          <div className="w-80 bg-white flex flex-col h-full shadow-2xl animate-slide-left">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-black text-gray-900">Order</p>
              <button onClick={() => setMobileCartOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <CartPanel
              cart={cart}
              itemCount={itemCount}
              subtotal={subtotal}
              discountInput={discountInput}
              setDiscountInput={setDiscountInput}
              removeFromCart={removeFromCart}
              updateQty={updateQty}
              clearCart={clearCart}
              navigate={navigate}
              onCheckout={() => setMobileCartOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── PRODUCT INFO MODAL ──────────────────────────────────────── */}
      {infoProduct && (
        <ProductInfoModal
          product={infoProduct}
          onClose={() => setInfoProduct(null)}
          onAddToCart={(p) => { addToCart(p); setInfoProduct(null) }}
        />
      )}
    </div>
  )
}

// ─── Product Info Modal ───────────────────────────────────────────────────────

interface ProductInfoModalProps {
  product: Product
  onClose: () => void
  onAddToCart: (p: Product) => void
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-400 w-24 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-gray-800 flex-1">{value}</span>
    </div>
  )
}

function ProductInfoModal({ product, onClose, onAddToCart }: ProductInfoModalProps) {
  const isOut = product.stock === 0

  const hasDims = product.lengthCm || product.widthCm || product.heightCm
  const dimStr = hasDims
    ? [product.lengthCm ?? '—', product.widthCm ?? '—', product.heightCm ?? '—'].join(' × ') + ' cm'
    : undefined

  const hasExtended = !!(
    product.brand || product.material || product.color ||
    dimStr || product.weightGrams || (product.tags?.length) || product.notes
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden z-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-tight">{product.name}</h2>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">{product.sku}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left — Image (40%) */}
          <div className="w-2/5 flex-shrink-0 bg-gray-50 flex items-center justify-center p-4 border-r border-gray-100">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-contain rounded-xl max-h-64"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-gray-200">
                <Package className="w-20 h-20" />
                <span className="text-xs text-gray-300 font-medium">No image</span>
              </div>
            )}
          </div>

          {/* Right — Details (60%) */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Price + Stock */}
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-brand">
                {`₱${product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
              </span>
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                isOut                                          ? 'bg-gray-100 text-gray-400' :
                product.stock <= product.reorderPoint          ? 'bg-yellow-50 text-yellow-700' :
                                                                 'bg-green-50 text-green-700'
              }`}>
                {isOut ? 'Out of stock' : `${product.stock} in stock`}
              </span>
            </div>

            {/* Core info */}
            <div className="space-y-1.5">
              <DetailRow label="Category" value={product.category} />
              <DetailRow label="Barcode"  value={product.barcode}  />
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description</p>
                <p className="text-sm text-gray-600 leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Extended details */}
            {hasExtended && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Details</p>
                <div className="space-y-1.5">
                  <DetailRow label="Brand"      value={product.brand}    />
                  <DetailRow label="Material"   value={product.material} />
                  <DetailRow label="Color"      value={product.color}    />
                  <DetailRow label="Dimensions" value={dimStr}           />
                  <DetailRow label="Weight"     value={product.weightGrams ? `${product.weightGrams} g` : undefined} />
                </div>
              </div>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {product.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">{tag}</span>
                ))}
              </div>
            )}

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Variants</p>
                <div className="space-y-1">
                  {product.variants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between bg-gray-50 px-3 py-1.5 rounded-lg">
                      <span className="text-xs font-semibold text-gray-700">{v.label}: {v.value}</span>
                      <span className="text-xs font-black text-brand">
                        {`₱${(product.price + v.priceAdjustment).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer — Add to Cart */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white">
          <button
            onClick={() => onAddToCart(product)}
            disabled={isOut}
            className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-brand/25 text-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            {isOut ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cart Panel (shared desktop + mobile) ────────────────────────────────────

interface CartPanelProps {
  cart: CartItem[]
  itemCount: number
  subtotal: number
  discountInput: Record<string, string>
  setDiscountInput: React.Dispatch<React.SetStateAction<Record<string, string>>>
  removeFromCart: (id: string) => void
  updateQty: (id: string, qty: number) => void
  clearCart: () => void
  navigate: (path: string) => void
  onCheckout?: () => void
}

function QtyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState(String(value))

  const commit = () => {
    const n = parseInt(raw)
    if (!isNaN(n) && n > 0) onChange(n)
    else setRaw(String(value))
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min="1"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setRaw(String(value)); setEditing(false) } }}
        className="w-10 text-center text-sm font-black text-gray-900 bg-white border-2 border-brand rounded focus:outline-none"
      />
    )
  }
  return (
    <button
      onClick={() => { setRaw(String(value)); setEditing(true) }}
      className="w-10 text-center text-sm font-black text-gray-900 hover:bg-brand-pale hover:text-brand rounded transition-colors cursor-text"
      title="Tap to type quantity"
    >
      {value}
    </button>
  )
}

function CartPanel({ cart, itemCount, subtotal, discountInput, setDiscountInput, removeFromCart, updateQty, clearCart, navigate, onCheckout }: CartPanelProps) {
  return (
    <>
      {/* Cart header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div>
          <p className="font-black text-gray-900 text-base">Current Order</p>
          <p className="text-xs text-gray-400 font-medium mt-0.5">
            {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'No items yet'}
          </p>
        </div>
        {cart.length > 0 && (
          <button
            onClick={clearCart}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-brand px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-all font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pb-10 pt-6">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 border-2 border-dashed border-gray-200">
              <ShoppingCart className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-400">Cart is empty</p>
            <p className="text-xs text-gray-300 mt-1">Tap a product to add it</p>
          </div>
        ) : (
          cart.map((item) => {
            const linePrice = item.product.price + (item.variant?.priceAdjustment ?? 0)
            const lineTotal = linePrice * item.quantity - item.discount
            return (
              <div key={item.product.id} className="bg-gray-50 rounded-xl overflow-hidden">
                <div className="flex items-start gap-2.5 p-3">
                  {/* Product thumb */}
                  {item.product.imageUrl ? (
                    <img src={item.product.imageUrl} alt={item.product.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-gray-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 leading-tight line-clamp-1">{item.product.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{fmt(linePrice)} each</p>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="w-6 h-6 rounded-md hover:bg-red-100 text-gray-300 hover:text-brand flex items-center justify-center transition-all flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-2 px-3 pb-3">
                  {/* Qty control */}
                  <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity - 1)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors"
                    >
                      <Minus className="w-3 h-3 text-gray-700" />
                    </button>
                    <QtyInput value={item.quantity} onChange={(n) => updateQty(item.product.id, n)} />
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center bg-brand hover:bg-brand-dark text-white transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Discount */}
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-[10px] text-gray-400 font-semibold flex-shrink-0">Disc</span>
                    <input
                      type="number"
                      min="0"
                      value={discountInput[item.product.id] ?? item.discount}
                      onChange={(e) => setDiscountInput((d) => ({ ...d, [item.product.id]: e.target.value }))}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value) || 0
                        usePOSStore.getState().applyDiscount(item.product.id, v)
                      }}
                      className="w-full text-xs font-bold border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand text-center"
                      placeholder="0"
                    />
                  </div>

                  {/* Line total */}
                  <p className="text-sm font-black text-gray-900 flex-shrink-0 ml-auto">{fmt(lineTotal)}</p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Totals + CTA */}
      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-4 space-y-3">
        {/* Subtotal */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500 font-medium">Subtotal</span>
          <span className="text-sm font-bold text-gray-800">{fmt(subtotal)}</span>
        </div>

        {/* Total */}
        <div className="flex justify-between items-center bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
          <span className="text-base font-black text-gray-900">Total</span>
          <span className="text-xl font-black text-brand">{fmt(subtotal)}</span>
        </div>

        <button
          onClick={() => { onCheckout?.(); navigate('/pos/payment') }}
          disabled={cart.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 px-4 rounded-2xl transition-all shadow-lg shadow-brand/30 text-sm"
        >
          <span>Charge {cart.length > 0 ? fmt(subtotal) : ''}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </>
  )
}
