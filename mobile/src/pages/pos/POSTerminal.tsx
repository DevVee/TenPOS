import { useState, useEffect, useMemo, useRef, useCallback, type ElementType } from 'react'
import {
  Search, Plus, Minus, Trash2, X, Tag, SlidersHorizontal,
  ChevronRight, Wifi, WifiOff, ArrowLeft, LogOut,
  Package, ShoppingBag, Loader2, ShoppingCart, Info, Printer, Lock,
} from 'lucide-react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import { useLogoutConfirm } from '../../hooks/useLogoutConfirm'
import { useSettingsStore } from '../../store/settingsStore'
import type { Product, CartItem } from '../../types'
import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { db, type CachedProduct, type CachedInventory, verifyManagerPin } from '../../lib/db'
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
    // Extended product details
    description: p.description ?? undefined,
    brand:       p.brand ?? undefined,
    material:    p.material ?? undefined,
    color:       p.color ?? undefined,
    weightGrams: p.weight_grams ?? undefined,
    lengthCm:    p.length_cm ?? undefined,
    widthCm:     p.width_cm ?? undefined,
    heightCm:    p.height_cm ?? undefined,
    tags:        p.tags ?? undefined,
    notes:       p.notes ?? undefined,
  }
}

// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
export function POSTerminal() {
  const navigate = useNavigate()
  const {
    cart, addToCart, removeFromCart, updateQty,
    clearCart, searchQuery, setSearch, cartSubtotal, syncStatus, lastTransactionId,
  } = usePOSStore()
  const { user } = useAuthStore()
  const { trigger: triggerLogout, modal: logoutModal } = useLogoutConfirm()

  const [activeCategory, setActiveCategory] = useState('All')
  const [discountInput, setDiscountInput]   = useState<Record<string, string>>({})
  const [cachedProducts, setCachedProducts] = useState<CachedProduct[]>([])
  const [inventory, setInventory]           = useState<CachedInventory[]>([])
  const [loading, setLoading]               = useState(true)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [infoProduct, setInfoProduct]       = useState<Product | null>(null)

  // Advanced filter state
  const [filterOpen,     setFilterOpen]     = useState(false)
  const [filterBrand,    setFilterBrand]    = useState('')
  const [filterMaterial, setFilterMaterial] = useState('')
  const [filterColor,    setFilterColor]    = useState('')

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
  // MEDIUM-06: memoize per-category product counts (avoids O(n) filter on every render)
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    map.set('All', products.length)
    for (const p of products) if (p.category) map.set(p.category, (map.get(p.category) ?? 0) + 1)
    return map
  }, [products])
  // Unique options for advanced filters (derived from loaded products)
  const filterOptions = useMemo(() => ({
    brands:    [...new Set(products.map((p) => p.brand).filter(Boolean) as string[])].sort(),
    materials: [...new Set(products.map((p) => p.material).filter(Boolean) as string[])].sort(),
    colors:    [...new Set(products.map((p) => p.color).filter(Boolean) as string[])].sort(),
  }), [products])

  const activeFilterCount = [filterBrand, filterMaterial, filterColor].filter(Boolean).length

  const filtered = products.filter((p) => {
    const matchCat    = activeCategory === 'All' || p.category === activeCategory
    const matchBrand  = !filterBrand    || p.brand    === filterBrand
    const matchMat    = !filterMaterial || p.material === filterMaterial
    const matchColor  = !filterColor    || p.color    === filterColor
    if (!searchQuery) return matchCat && matchBrand && matchMat && matchColor
    const q = searchQuery.toLowerCase()
    const matchSearch =
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.material && p.material.toLowerCase().includes(q)) ||
      (p.color && p.color.toLowerCase().includes(q)) ||
      (p.tags && p.tags.some((t) => t.toLowerCase().includes(q))) ||
      (p.notes && p.notes.toLowerCase().includes(q))
    return matchCat && matchSearch && matchBrand && matchMat && matchColor
  })

  const subtotal  = cartSubtotal()
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)
  const handleLogout = triggerLogout

  // â"€â"€ Barcode scanner (USB/BT HID keyboard wedge) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Scanners act like a keyboard: rapid chars ending with Enter.
  // We buffer chars that arrive within 100ms of each other; on Enter, if the
  // buffer is â‰¥4 chars we treat it as a barcode and look it up.
  const productsRef    = useRef<Product[]>([])
  const autoAddTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { productsRef.current = products }, [products])

  useEffect(() => {
    let buffer = ''
    let lastKeyAt = 0
    let charIntervals: number[] = []

    const onKey = (e: KeyboardEvent) => {
      const now = Date.now()
      const gap = now - lastKeyAt

      // Reset on long gap (human pause between words/chars)
      if (gap > 200) {
        buffer = ''
        charIntervals = []
      }
      lastKeyAt = now

      if (e.key === 'Enter') {
        const code = buffer.trim()
        buffer = ''
        // Treat as scanner if >=4 chars arrived very fast (all < 50ms apart = scanner speed)
        const isScan = code.length >= 4 && charIntervals.every((t) => t < 80)
        charIntervals = []
        if (isScan) {
          const match = productsRef.current.find(
            (p) => (p.barcode && p.barcode === code) || p.sku === code,
          )
          if (match) {
            addToCart(match)
            setSearch('') // clear any barcode chars that landed in the search box
            e.preventDefault()
          }
        }
      } else if (e.key.length === 1) {
        charIntervals.push(gap)
        buffer += e.key
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addToCart])

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#F5F7FA' }}>
      {logoutModal}

      {/* â"€â"€ HEADER â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0 z-10">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-1.5 h-8 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-xs transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /><span>Close</span>
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-none">POS Terminal</p>
            <p className="text-xs text-gray-400 leading-none mt-0.5">{user?.branch ?? 'Unknown Branch'}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Sync status badge */}
          <div className={`hidden sm:flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1.5 border rounded-lg ${
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
              className="w-8 h-8 hover:bg-brand/10 text-gray-400 hover:text-brand flex items-center justify-center transition-colors"
              title="Reprint last receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
          )}

          {/* Mobile cart button */}
          <button
            onClick={() => setMobileCartOpen(true)}
            className="lg:hidden relative w-8 h-8 bg-brand text-white flex items-center justify-center"
          >
            <ShoppingCart className="w-4 h-4" />
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-gray-900 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                {itemCount}
              </span>
            )}
          </button>

          {user && (
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-md bg-brand flex items-center justify-center text-white text-xs font-bold">
                {user.avatarInitials}
              </div>
              <button
                onClick={handleLogout}
                className="w-8 h-8 hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* â"€â"€ BODY â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="flex flex-1 overflow-hidden">

        {/* â"€â"€ LEFT: Products â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Search + category bar */}
          <div className="bg-white border-b border-gray-200 flex-shrink-0">
            {/* Search + Filter */}
            <div className="px-4 pt-3 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    className="w-full h-9 pl-9 pr-9 text-sm bg-gray-100 border border-transparent rounded-lg
                      placeholder:text-gray-400 text-gray-800
                      focus:outline-none focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-brand/15
                      transition-all"
                    placeholder="Search products or scan barcode…"
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value
                      setSearch(val)
                      // Path B: debounced exact-match auto-add
                      if (autoAddTimer.current) clearTimeout(autoAddTimer.current)
                      if (val.length >= 4) {
                        autoAddTimer.current = setTimeout(() => {
                          autoAddTimer.current = null
                          const match = productsRef.current.find(
                            (p) => (p.barcode && p.barcode === val) || p.sku === val,
                          )
                          if (match) { addToCart(match); setSearch('') }
                        }, 150)
                      }
                    }}
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
                {/* Advanced filter button */}
                <button
                  onClick={() => setFilterOpen(true)}
                  className={`relative h-9 px-3 flex items-center space-x-1.5 text-xs font-semibold border transition-colors flex-shrink-0 ${
                    activeFilterCount > 0
                      ? 'border-brand text-brand bg-brand/5 hover:bg-brand/10'
                      : 'border-gray-200 text-gray-600 bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-brand text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Check Cart â€" mobile only, visible when cart has items */}
            {itemCount > 0 && (
              <div className="px-4 pb-2.5 lg:hidden">
                <button
                  onClick={() => setMobileCartOpen(true)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.98]"
                  style={{ background: '#E5484D', color: '#fff' }}
                >
                  <span className="flex items-center space-x-2">
                    <ShoppingCart className="w-4 h-4" />
                    Check Cart
                  </span>
                  <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-bold">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'} · {fmt(cartSubtotal())}
                  </span>
                </button>
              </div>
            )}

            {/* Category tabs */}
            <div className="px-4 pb-2.5 flex space-x-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {allCats.map((cat) => {
                const Icon   = cat === 'All' ? Tag : (CATEGORY_ICONS[cat] ?? Package)
                const count  = categoryCounts.get(cat) ?? 0
                const active = activeCategory === cat
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 text-sm font-medium transition-all
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
              <div className="flex flex-col items-center justify-center h-48 space-y-2 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm">Loading products…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-2">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Search className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">No products found</p>
                {searchQuery && (
                  <button onClick={() => setSearch('')} className="text-xs text-brand hover:underline">Clear search</button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
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

        {/* â"€â"€ RIGHT: Cart (desktop) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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

      {/* â"€â"€ MOBILE CART DRAWER â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {mobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setMobileCartOpen(false)} />
          <div className="w-80 max-w-[85vw] bg-white flex flex-col h-full animate-slide-left">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
              <p className="font-semibold text-gray-900 text-sm">Order</p>
              <button
                onClick={() => setMobileCartOpen(false)}
                className="h-7 px-2.5 hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-xs font-semibold transition-colors"
              >
                Close
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

      {/* ── ADVANCED FILTER MODAL ────────────────────────────────────────── */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFilterOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm z-10 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Filter Products</h3>
                {activeFilterCount > 0 && (
                  <p className="text-xs text-brand mt-0.5">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</p>
                )}
              </div>
              <button
                onClick={() => setFilterOpen(false)}
                className="h-7 px-2.5 hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors text-xs font-semibold"
              >
                Close
              </button>
            </div>

            {/* Filter options */}
            <div className="px-5 py-4 space-y-4">
              {/* Brand */}
              {filterOptions.brands.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Brand</label>
                  <div className="flex flex-wrap" style={{ gap: '6px' }}>
                    <button
                      onClick={() => setFilterBrand('')}
                      className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                        !filterBrand ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >All</button>
                    {filterOptions.brands.map((b) => (
                      <button key={b} onClick={() => setFilterBrand(filterBrand === b ? '' : b)}
                        className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                          filterBrand === b ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >{b}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Material */}
              {filterOptions.materials.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Material</label>
                  <div className="flex flex-wrap" style={{ gap: '6px' }}>
                    <button
                      onClick={() => setFilterMaterial('')}
                      className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                        !filterMaterial ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >All</button>
                    {filterOptions.materials.map((m) => (
                      <button key={m} onClick={() => setFilterMaterial(filterMaterial === m ? '' : m)}
                        className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                          filterMaterial === m ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >{m}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Color */}
              {filterOptions.colors.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Color</label>
                  <div className="flex flex-wrap" style={{ gap: '6px' }}>
                    <button
                      onClick={() => setFilterColor('')}
                      className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                        !filterColor ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >All</button>
                    {filterOptions.colors.map((c) => (
                      <button key={c} onClick={() => setFilterColor(filterColor === c ? '' : c)}
                        className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                          filterColor === c ? 'bg-brand text-white border-brand' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >{c}</button>
                    ))}
                  </div>
                </div>
              )}

              {filterOptions.brands.length === 0 && filterOptions.materials.length === 0 && filterOptions.colors.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No filter options available for current products</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex space-x-2 px-5 pb-5">
              <button
                onClick={() => { setFilterBrand(''); setFilterMaterial(''); setFilterColor('') }}
                className="btn-secondary flex-1"
              >
                Clear All
              </button>
              <button
                onClick={() => setFilterOpen(false)}
                className="btn-primary flex-1"
              >
                <span>Apply ({filtered.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRODUCT INFO MODAL ──────────────────────────────────────────── */}
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

// â"€â"€â"€ Product Card â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
      className={`relative bg-white border rounded-xl overflow-hidden transition-all duration-150 flex flex-row sm:flex-col
        ${isOut
          ? 'border-gray-100 opacity-60'
          : inCart
          ? 'border-brand ring-1 ring-brand/20 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }`}
    >
      {/* Image */}
      <div
        className={`relative flex-shrink-0 w-[88px] h-[88px] sm:w-full sm:h-auto sm:aspect-square bg-gray-50 ${!isOut ? 'cursor-pointer' : 'cursor-not-allowed'}`}
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
            <Package className="w-8 h-8 sm:w-10 sm:h-10 text-gray-200" />
          </div>
        )}

        {/* Out of stock overlay */}
        {isOut && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="bg-gray-800 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-md tracking-wide uppercase">
              Out
            </span>
          </div>
        )}

        {/* Cart qty badge */}
        {inCart && !isOut && (
          <span className="absolute top-1.5 left-1.5 min-w-[20px] h-[20px] bg-brand text-white rounded-md text-[10px] font-bold flex items-center justify-center px-1">
            {inCart.quantity}
          </span>
        )}

        {/* Low stock badge â€" desktop only (no room on mobile thumbnail) */}
        {isLow && !isOut && (
          <span className="absolute top-1.5 right-1.5 hidden sm:block bg-amber-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-none uppercase">
            Low
          </span>
        )}
      </div>

      {/* Info */}
      <div
        className={`p-3 sm:p-2.5 flex-1 flex flex-col min-w-0 ${!isOut ? 'cursor-pointer' : ''}`}
        onClick={() => !isOut && onAdd()}
      >
        <p className="text-[13px] sm:text-xs font-medium text-gray-800 leading-tight line-clamp-2 mb-1 sm:mb-0.5 flex-1">
          {product.name}
        </p>
        <p className="text-[10px] text-gray-400 font-mono mb-1.5 sm:mb-2 hidden sm:block">{product.sku}</p>
        {isLow && !isOut && (
          <p className="text-[10px] text-amber-500 font-medium mb-1 sm:hidden">Low stock</p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-brand tabular-nums">{fmt(product.price)}</p>
          <div className="flex items-center space-x-1">
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

// â"€â"€â"€ Product Info Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface ProductInfoModalProps {
  product: Product
  onClose: () => void
  onAddToCart: (p: Product) => void
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex items-start space-x-3">
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
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 leading-tight">{product.name}</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{product.sku}</p>
          </div>
          <button
            onClick={onClose}
            className="h-7 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 flex items-center justify-center flex-shrink-0 transition-colors text-xs font-semibold"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Image */}
          <div className="w-2/5 flex-shrink-0 bg-gray-50 flex items-center justify-center p-6 border-r border-gray-100">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain rounded-lg max-h-56" />
            ) : (
              <div className="flex flex-col items-center space-y-2 text-gray-300">
                <Package className="w-16 h-16" />
                <span className="text-xs text-gray-300">No image</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Price + stock */}
            <div className="flex items-center space-x-3">
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
              <div className="flex flex-wrap">
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
            className="w-full flex items-center justify-center space-x-2 h-11 bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all text-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            {isOut ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  )
}

// â"€â"€â"€ Qty Input â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€â"€ Discount PIN Modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function DiscountPinModal({
  amount, onConfirm, onCancel,
}: { amount: number; onConfirm: () => void; onCancel: () => void }) {
  const [pin, setPin]         = useState('')
  const [error, setError]     = useState('')
  const [checking, setChecking] = useState(false)

  const submitPin = useCallback(async (p: string) => {
    setChecking(true)
    const ok = await verifyManagerPin(p)
    setChecking(false)
    if (ok) { onConfirm() }
    else    { setError('Incorrect PIN'); setPin('') }
  }, [onConfirm])

  const handleKey = useCallback((k: string) => {
    if (checking) return
    if (k === '⌫') { setPin((p) => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    setError('')
    if (next.length === 4) submitPin(next)
  }, [pin, checking, submitPin])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 z-10">

        {/* Icon + title */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">Manager PIN Required</h3>
          <p className="text-sm text-gray-500 mt-1">
            Apply <span className="font-semibold text-gray-700">{fmt(amount)}</span> discount
          </p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center space-x-3 mb-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`w-3 h-3 rounded-full border-2 transition-all ${
              pin.length > i ? 'bg-brand border-brand' : 'bg-transparent border-gray-300'
            }`} />
          ))}
        </div>

        {/* Status line */}
        <div className="h-6 flex items-center justify-center mb-3">
          {error    && <p className="text-xs text-red-500">{error}</p>}
          {checking && <p className="text-xs text-gray-400">Verifying…</p>}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {(['1','2','3','4','5','6','7','8','9','','0','⌫'] as const).map((k, idx) =>
            k === '' ? <div key={idx} /> : (
              <button
                key={idx}
                disabled={checking}
                onClick={() => handleKey(k)}
                className={`h-12 rounded-xl text-lg font-semibold transition-all active:scale-95 disabled:opacity-50
                  ${k === '⌫'
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    : 'bg-gray-50 text-gray-900 hover:bg-gray-100 active:bg-brand/10'
                  }`}
              >
                {k}
              </button>
            )
          )}
        </div>

        <button
          onClick={onCancel}
          className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 rounded-lg hover:bg-gray-100 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// â"€â"€â"€ Cart Panel â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
  const { requirePinForDiscount } = useSettingsStore()
  const [pinPending, setPinPending] = useState<{ itemId: string; amount: number } | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

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
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center space-x-1 text-xs font-semibold text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors px-2.5 py-1.5"
          >
            <Trash2 className="w-3 h-3" /><span>Clear</span>
          </button>
        )}

        {/* MEDIUM-07: Clear cart confirmation */}
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowClearConfirm(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 z-10 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Clear Cart?</h3>
              <p className="text-sm text-gray-500 mb-5">
                Remove all {itemCount} item{itemCount !== 1 ? 's' : ''} from the cart?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { clearCart(); setShowClearConfirm(false) }}
                  className="flex-1 h-11 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-all"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
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
                <div className="flex items-start p-3" style={{ gap: 0 }}>
                  {item.product.imageUrl ? (
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="w-9 h-9 rounded-md object-cover flex-shrink-0 border border-gray-200 mr-2.5"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-md bg-gray-200 flex items-center justify-center flex-shrink-0 mr-2.5">
                      <Package className="w-4 h-4 text-gray-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-xs font-medium text-gray-800 line-clamp-1 leading-tight">
                      {item.product.name}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{fmt(linePrice)} each</p>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="w-6 h-6 rounded-md flex items-center justify-center bg-red-100 text-red-500 hover:bg-red-200 hover:text-red-700 transition-all flex-shrink-0"
                    title="Remove item"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center space-x-2 px-3 pb-3">
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
                  <div className="flex items-center space-x-1 flex-1">
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
                        if (v > 0 && requirePinForDiscount) {
                          setPinPending({ itemId: item.product.id, amount: v })
                        } else {
                          usePOSStore.getState().applyDiscount(item.product.id, v)
                        }
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
          className="w-full flex items-center justify-center space-x-2 h-12 bg-brand hover:bg-brand-dark
            disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold
            transition-all shadow-brand/20 shadow-sm text-sm"
        >
          <span>Proceed to Payment</span>
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Reprint last receipt */}
        {lastTransactionId && cart.length === 0 && (
          <button
            onClick={() => navigate(`/pos/receipt/${lastTransactionId}`)}
            className="w-full flex items-center justify-center space-x-2 text-xs text-gray-400 hover:text-brand py-1.5 hover:bg-brand/5 transition-all font-medium"
          >
            <Printer className="w-3.5 h-3.5" />
            Reprint last receipt
          </button>
        )}
      </div>

      {/* Discount PIN modal */}
      {pinPending && (
        <DiscountPinModal
          amount={pinPending.amount}
          onConfirm={() => {
            usePOSStore.getState().applyDiscount(pinPending!.itemId, pinPending!.amount)
            setPinPending(null)
          }}
          onCancel={() => {
            setDiscountInput((d) => ({ ...d, [pinPending!.itemId]: '' }))
            setPinPending(null)
          }}
        />
      )}
    </>
  )
}

