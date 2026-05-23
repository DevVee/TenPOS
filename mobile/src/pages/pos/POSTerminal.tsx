import { useState, useEffect, useMemo, type ElementType } from 'react'
import {
  Search, Plus, Minus, Trash2, X, Tag,
  ChevronRight, Wifi, WifiOff, ArrowLeft, LogOut,
  Package, ShoppingBag, Loader2, ShoppingCart, Info, Printer,
} from 'lucide-react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import type { Product, CartItem } from '../../types'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { db, type CachedProduct, type CachedInventory } from '../../lib/db'
import { refreshProductCache, refreshInventoryCache, onSyncEvent } from '../../lib/sync'

const CATEGORY_ICONS: Record<string, ElementType> = {
  'Large Schoolbag':  ShoppingBag,
  'Medium Schoolbag': Package,
}

function fmt(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

function toProduct(p: CachedProduct, inv: CachedInventory[]): Product {
  const stock        = inv.find((i) => i.product_id === p.id && !i.variant_id)?.stock ?? 0
  const reorderPoint = inv.find((i) => i.product_id === p.id && !i.variant_id)?.reorder_point ?? 3
  return {
    id: p.id, name: p.name, sku: p.sku, barcode: p.barcode ?? '',
    category: p.category_name ?? p.category_id ?? 'Other',
    price: p.price, cost: p.cost ?? 0, stock, reorderPoint,
    imageUrl: p.image_url,
    variants: p.variants.map((v) => ({
      id: v.id, label: v.label, value: v.value,
      priceAdjustment: v.price_adjustment,
      stock: inv.find((i) => i.product_id === p.id && i.variant_id === v.id)?.stock ?? 0,
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export function POSTerminal() {
  const navigate = useNavigate()
  const {
    cart, addToCart, removeFromCart, updateQty,
    clearCart, searchQuery, setSearch, cartSubtotal, syncStatus, lastTransactionId,
  } = usePOSStore()
  const { user, logout } = useAuthStore()

  const [activeCategory, setActiveCategory] = useState('All')
  const [discountInput, setDiscountInput]   = useState<Record<string, string>>({})
  const [cachedProducts, setCachedProducts] = useState<CachedProduct[]>([])
  const [inventory, setInventory]           = useState<CachedInventory[]>([])
  const [loading, setLoading]               = useState(true)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [infoProduct, setInfoProduct]       = useState<Product | null>(null)

  useEffect(() => {
    let alive = true
    const reload = async () => {
      const [prods, inv] = await Promise.all([db.products.toArray(), db.inventory.toArray()])
      if (alive) { setCachedProducts(prods.filter((p) => p.active)); setInventory(inv); setLoading(false) }
    }
    const bootstrap = async () => {
      await reload()
      const count = await db.products.count()
      if (count === 0) { setLoading(true); await Promise.all([refreshProductCache(), refreshInventoryCache()]); await reload() }
    }
    bootstrap()
    const u1 = onSyncEvent('sync:done',      reload)
    const u2 = onSyncEvent('cache:updated',  reload)
    const u3 = onSyncEvent('offline:queued', reload)
    return () => { alive = false; u1(); u2(); u3() }
  }, [])

  const products = useMemo(() => cachedProducts.map((p) => toProduct(p, inventory)), [cachedProducts, inventory])
  const allCats  = useMemo(
    () => ['All', ...[...new Set(products.map((p) => p.category).filter(Boolean))].sort()],
    [products],
  )
  const filtered = products.filter((p) => {
    const matchCat    = activeCategory === 'All' || p.category === activeCategory
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  const subtotal  = cartSubtotal()
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)
  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#F5F7FA' }}>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 flex items-center justify-center transition-colors"
            title="Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-none">POS Terminal</p>
            <p className="text-xs text-gray-400 leading-none mt-0.5">{user?.branch ?? 'Main Branch'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync status badge */}
          <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 border rounded-lg ${
            syncStatus === 'online'
              ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
              : syncStatus === 'syncing'
              ? 'text-blue-600 bg-blue-50 border-blue-100'
              : syncStatus === 'pending'
              ? 'text-amber-600 bg-amber-50 border-amber-100'
              : 'text-gray-500 bg-gray-50 border-gray-200'
          }`}>
            {syncStatus === 'online' || syncStatus === 'syncing'
              ? <Wifi className="w-3 h-3" />
              : <WifiOff className="w-3 h-3" />}
            <span className="capitalize">{syncStatus}</span>
          </div>

          {/* Reprint last receipt */}
          {lastTransactionId && (
            <button
              onClick={() => navigate(`/pos/receipt/${lastTransactionId}`)}
              className="w-8 h-8 rounded-lg hover:bg-brand/10 text-gray-400 hover:text-brand flex items-center justify-center transition-colors"
              title="Reprint last receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
          )}

          {/* Mobile cart button */}
          <button
            onClick={() => setMobileCartOpen(true)}
            className="lg:hidden relative w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center"
          >
            <ShoppingCart className="w-4 h-4" />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-gray-900 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                {itemCount}
              </span>
            )}
          </button>

          {user && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-brand flex items-center justify-center text-white text-xs font-bold">
                {user.avatarInitials}
              </div>
              <button
                onClick={handleLogout}
                className="w-8 h-8 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── BODY ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Products ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Search + category bar */}
          <div className="bg-white border-b border-gray-200 flex-shrink-0">
            {/* Search */}
            <div className="px-4 pt-3 pb-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  className="w-full h-9 pl-9 pr-9 text-sm bg-gray-100 border border-transparent rounded-lg
                    placeholder:text-gray-400 text-gray-800
                    focus:outline-none focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-brand/15
                    transition-all"
                  placeholder="Search products or scan barcode…"
                  value={searchQuery}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category tabs */}
            <div className="px-4 pb-2.5 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {allCats.map((cat) => {
                const Icon   = cat === 'All' ? Tag : (CATEGORY_ICONS[cat] ?? Package)
                const count  = cat === 'All' ? products.length : products.filter((p) => p.category === cat).length
                const active = activeCategory === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${active
                        ? 'bg-brand text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat}</span>
                    <span className={`text-xs tabular-nums ${active ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm">Loading products…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Search className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">No products found</p>
                {searchQuery && (
                  <button onClick={() => setSearch('')} className="text-xs text-brand hover:underline">Clear search</button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {filtered.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    inCart={cart.find((i) => i.product.id === product.id)}
                    onAdd={() => addToCart(product)}
                    onInfo={() => setInfoProduct(product)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Cart (desktop) ───────────────────────────────────── */}
        <div className="hidden lg:flex w-80 xl:w-96 flex-col bg-white border-l border-gray-200">
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
            lastTransactionId={lastTransactionId}
          />
        </div>
      </div>

      {/* ── MOBILE CART DRAWER ──────────────────────────────────────── */}
      {mobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setMobileCartOpen(false)} />
          <div className="w-80 bg-white flex flex-col h-full animate-slide-left">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">Order</p>
              <button
                onClick={() => setMobileCartOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100"
              >
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
              lastTransactionId={lastTransactionId}
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

// ─── Product Card ─────────────────────────────────────────────────────────────
interface ProductCardProps {
  product: Product
  inCart?: CartItem
  onAdd: () => void
  onInfo: () => void
}

function ProductCard({ product, inCart, onAdd, onInfo }: ProductCardProps) {
  const isOut = product.stock === 0
  const isLow = product.stock > 0 && product.stock <= product.reorderPoint

  return (
    <div
      className={`relative bg-white border rounded-xl overflow-hidden transition-all duration-150 flex flex-col
        ${isOut
          ? 'border-gray-100 opacity-60'
          : inCart
          ? 'border-brand ring-1 ring-brand/20 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }`}
    >
      {/* Image */}
      <div
        className={`relative w-full aspect-square bg-gray-50 ${!isOut ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        onClick={() => !isOut && onAdd()}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`w-full h-full object-cover ${isOut ? 'grayscale' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-gray-200" />
          </div>
        )}

        {/* Out of stock */}
        {isOut && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="bg-gray-800 text-white text-[9px] font-semibold px-2 py-1 rounded-md tracking-wide uppercase">
              Out of stock
            </span>
          </div>
        )}

        {/* Cart qty badge */}
        {inCart && !isOut && (
          <span className="absolute top-2 left-2 min-w-[22px] h-[22px] bg-brand text-white rounded-md text-[11px] font-bold flex items-center justify-center px-1.5">
            {inCart.quantity}
          </span>
        )}

        {/* Low stock badge */}
        {isLow && !isOut && (
          <span className="absolute top-2 right-2 bg-amber-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none uppercase">
            Low
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 flex-1 flex flex-col">
        <p
          className="text-xs font-medium text-gray-800 leading-tight line-clamp-2 mb-0.5 flex-1 cursor-pointer"
          onClick={() => !isOut && onAdd()}
        >
          {product.name}
        </p>
        <p className="text-[10px] text-gray-400 font-mono mb-2">{product.sku}</p>

        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-bold text-brand tabular-nums">{fmt(product.price)}</p>
          <div className="flex items-center gap-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md tabular-nums
              ${isOut  ? 'bg-gray-100 text-gray-400' :
                isLow  ? 'bg-amber-50 text-amber-600' :
                         'bg-green-50 text-green-600'}`}>
              {product.stock}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onInfo() }}
              className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
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
    <div className="flex items-start gap-3">
      <span className="text-xs text-gray-400 w-20 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-700 flex-1">{value}</span>
    </div>
  )
}

function ProductInfoModal({ product, onClose, onAddToCart }: ProductInfoModalProps) {
  const isOut = product.stock === 0
  const hasDims = product.lengthCm || product.widthCm || product.heightCm
  const dimStr = hasDims
    ? [product.lengthCm ?? '—', product.widthCm ?? '—', product.heightCm ?? '—'].join(' × ') + ' cm'
    : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden z-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 leading-tight">{product.name}</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{product.sku}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Image */}
          <div className="w-2/5 flex-shrink-0 bg-gray-50 flex items-center justify-center p-6 border-r border-gray-100">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain rounded-lg max-h-56" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-300">
                <Package className="w-16 h-16" />
                <span className="text-xs text-gray-300">No image</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Price + stock */}
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-900 tabular-nums">
                {`₱${product.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
              </span>
              <span className={`text-xs font-medium px-2 py-1 rounded-lg
                ${isOut                                   ? 'bg-gray-100 text-gray-500' :
                  product.stock <= product.reorderPoint   ? 'bg-amber-50 text-amber-700' :
                                                            'bg-green-50 text-green-700'}`}>
                {isOut ? 'Out of stock' : `${product.stock} in stock`}
              </span>
            </div>

            {/* Core */}
            <div className="space-y-1.5">
              <DetailRow label="Category" value={product.category} />
              <DetailRow label="Barcode"  value={product.barcode} />
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Description</p>
                <p className="text-sm text-gray-600 leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Extended */}
            {(product.brand || product.material || product.color || dimStr || product.weightGrams) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Details</p>
                <div className="space-y-1.5">
                  <DetailRow label="Brand"      value={product.brand} />
                  <DetailRow label="Material"   value={product.material} />
                  <DetailRow label="Color"       value={product.color} />
                  <DetailRow label="Dimensions" value={dimStr} />
                  <DetailRow label="Weight"     value={product.weightGrams ? `${product.weightGrams} g` : undefined} />
                </div>
              </div>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {product.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{tag}</span>
                ))}
              </div>
            )}

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Variants</p>
                <div className="space-y-1">
                  {product.variants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                      <span className="text-xs font-medium text-gray-700">{v.label}: {v.value}</span>
                      <span className="text-xs font-semibold text-gray-900 tabular-nums">
                        {`₱${(product.price + v.priceAdjustment).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            onClick={() => onAddToCart(product)}
            disabled={isOut}
            className="w-full flex items-center justify-center gap-2 h-11 bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all text-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            {isOut ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Qty Input ─────────────────────────────────────────────────────────────────
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setRaw(String(value)); setEditing(false) }
        }}
        className="w-9 text-center text-sm font-bold text-gray-900 bg-white border border-brand rounded focus:outline-none"
      />
    )
  }
  return (
    <button
      onClick={() => { setRaw(String(value)); setEditing(true) }}
      className="w-9 text-center text-sm font-bold text-gray-900 hover:text-brand transition-colors cursor-text"
      title="Tap to edit quantity"
    >
      {value}
    </button>
  )
}

// ─── Cart Panel ───────────────────────────────────────────────────────────────
interface CartPanelProps {
  cart: CartItem[]
  itemCount: number
  subtotal: number
  discountInput: Record<string, string>
  setDiscountInput: React.Dispatch<React.SetStateAction<Record<string, string>>>
  removeFromCart: (id: string) => void
  updateQty: (id: string, qty: number) => void
  clearCart: () => void
  navigate: NavigateFunction
  onCheckout?: () => void
  lastTransactionId?: string | null
}

function CartPanel({
  cart, itemCount, subtotal, discountInput, setDiscountInput,
  removeFromCart, updateQty, clearCart, navigate, onCheckout, lastTransactionId,
}: CartPanelProps) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 flex-shrink-0">
        <div>
          <p className="text-sm font-semibold text-gray-900">Current Order</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'Empty'}
          </p>
        </div>
        {cart.length > 0 && (
          <button
            onClick={clearCart}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors font-medium px-2 py-1 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-14 h-14 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center mb-3">
              <ShoppingCart className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-400">Cart is empty</p>
            <p className="text-xs text-gray-300 mt-1">Tap a product to add it</p>
          </div>
        ) : (
          cart.map((item) => {
            const linePrice = item.product.price + (item.variant?.priceAdjustment ?? 0)
            const lineTotal = linePrice * item.quantity - item.discount
            return (
              <div key={item.product.id} className="bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                <div className="flex items-start gap-2.5 p-3">
                  {item.product.imageUrl ? (
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="w-9 h-9 rounded-md object-cover flex-shrink-0 border border-gray-200"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-md bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-gray-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 line-clamp-1 leading-tight">
                      {item.product.name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{fmt(linePrice)} each</p>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-2 px-3 pb-3">
                  {/* Qty controls */}
                  <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <QtyInput value={item.quantity} onChange={(n) => updateQty(item.product.id, n)} />
                    <button
                      onClick={() => updateQty(item.product.id, item.quantity + 1)}
                      className="w-7 h-7 flex items-center justify-center bg-brand text-white hover:bg-brand-dark transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Discount */}
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-[10px] text-gray-400 font-medium flex-shrink-0">Disc</span>
                    <input
                      type="number"
                      min="0"
                      value={discountInput[item.product.id] ?? item.discount}
                      onChange={(e) =>
                        setDiscountInput((d) => ({ ...d, [item.product.id]: e.target.value }))
                      }
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value) || 0
                        usePOSStore.getState().applyDiscount(item.product.id, v)
                      }}
                      className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 text-center
                        focus:outline-none focus:ring-1 focus:ring-brand/30 focus:border-brand"
                      placeholder="0"
                    />
                  </div>

                  {/* Line total */}
                  <p className="text-sm font-semibold text-gray-900 flex-shrink-0 tabular-nums ml-auto">
                    {fmt(lineTotal)}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer / Totals */}
      <div className="flex-shrink-0 border-t border-gray-100 px-4 py-4 space-y-3 bg-white">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Subtotal</span>
          <span className="text-sm font-medium text-gray-800 tabular-nums">{fmt(subtotal)}</span>
        </div>

        <div className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
          <span className="text-sm font-semibold text-gray-900">Total</span>
          <span className="text-xl font-bold text-gray-900 tabular-nums">{fmt(subtotal)}</span>
        </div>

        <button
          onClick={() => { onCheckout?.(); navigate('/pos/payment') }}
          disabled={cart.length === 0}
          className="w-full flex items-center justify-center gap-2 h-12 bg-brand hover:bg-brand-dark
            disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg
            transition-all shadow-brand/20 shadow-sm text-sm"
        >
          <span>Charge {cart.length > 0 ? fmt(subtotal) : ''}</span>
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Reprint last receipt */}
        {lastTransactionId && cart.length === 0 && (
          <button
            onClick={() => navigate(`/pos/receipt/${lastTransactionId}`)}
            className="w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-brand py-1.5 rounded-lg hover:bg-brand/5 transition-all font-medium"
          >
            <Printer className="w-3.5 h-3.5" />
            Reprint last receipt
          </button>
        )}
      </div>
    </>
  )
}
