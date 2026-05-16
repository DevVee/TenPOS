import { useState, useEffect, useMemo, type ElementType } from 'react'
import { Search, Plus, Minus, Trash2, X, Tag, ChevronRight, Wifi, WifiOff, ArrowLeft, LogOut, Clock, Package, ShoppingBag, Loader2 } from 'lucide-react'
import { usePOSStore } from '../../store/posStore'
import { useAuthStore } from '../../store/authStore'
import type { Product } from '../../types'
import { useNavigate } from 'react-router-dom'
import { db, type CachedProduct, type CachedInventory } from '../../lib/db'
import { refreshProductCache, refreshInventoryCache, onSyncEvent } from '../../lib/sync'

const CATEGORY_ICON_MAP: Record<string, ElementType> = {
  'Large Schoolbag': Package,
  'Medium Schoolbag': Package,
  'Super Large Schoolbag': Package,
  'Lunch Bag': ShoppingBag,
}

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

function toProduct(p: CachedProduct, inv: CachedInventory[]): Product {
  const stock = inv.find((i) => i.product_id === p.id && !i.variant_id)?.stock ?? 0
  const reorderPoint = inv.find((i) => i.product_id === p.id && !i.variant_id)?.reorder_point ?? 3
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode ?? '',
    category: p.category_name ?? p.category_id ?? 'Other',
    price: p.price,
    cost: p.cost ?? 0,
    stock,
    reorderPoint,
    imageUrl: p.image_url,
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.label,
      value: v.value,
      priceAdjustment: v.price_adjustment,
      stock: inv.find((i) => i.product_id === p.id && i.variant_id === v.id)?.stock ?? 0,
    })),
  }
}

export function POSTerminal() {
  const navigate = useNavigate()
  const { cart, addToCart, removeFromCart, updateQty, clearCart, searchQuery, setSearch, cartSubtotal, syncStatus } = usePOSStore()
  const { user, logout } = useAuthStore()

  const [activeCategory, setActiveCategory] = useState('All')
  const [discountInput, setDiscountInput] = useState<Record<string, string>>({})
  const [cachedProducts, setCachedProducts] = useState<CachedProduct[]>([])
  const [inventory, setInventory] = useState<CachedInventory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    const reload = async () => {
      const [prods, inv] = await Promise.all([
        db.products.toArray(),
        db.inventory.toArray(),
      ])
      if (alive) {
        setCachedProducts(prods.filter((p) => p.active))
        setInventory(inv)
        setLoading(false)
      }
    }

    const bootstrap = async () => {
      await reload()
      const count = await db.products.count()
      if (count === 0 && navigator.onLine) {
        setLoading(true)
        await Promise.all([refreshProductCache(), refreshInventoryCache()])
        await reload()
      }
    }

    bootstrap()

    const unsub1 = onSyncEvent('sync:done', reload)
    const unsub2 = onSyncEvent('offline:queued', reload)
    return () => { alive = false; unsub1(); unsub2() }
  }, [])

  const products = useMemo(
    () => cachedProducts.map((p) => toProduct(p, inventory)),
    [cachedProducts, inventory]
  )

  const allCats = useMemo(() => {
    const names = [...new Set(products.map((p) => p.category).filter(Boolean))]
    return ['All', ...names.sort()]
  }, [products])

  const filtered = products.filter((p) => {
    const matchCat = activeCategory === 'All' || p.category === activeCategory
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  const subtotal = cartSubtotal()
  const total = subtotal
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0)

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex flex-col h-screen bg-gray-50 transition-colors">
      {/* POS Header */}
      <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-10 h-10 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors flex items-center justify-center"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-brand rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white font-black text-sm">T</span>
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-none">POS Terminal</p>
            <p className="text-xs text-gray-400 leading-none mt-0.5">{user?.branch ?? 'Main Branch'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold ${
            syncStatus === 'online' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-brand'
          }`}>
            {syncStatus === 'online' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="capitalize">{syncStatus}</span>
          </div>

          <button onClick={() => navigate('/pos/shift')} className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            <Clock className="w-4 h-4" /> Shift
          </button>

          {user && (
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-brand-pale flex items-center justify-center">
                <span className="text-sm font-bold text-brand">{user.avatarInitials}</span>
              </div>
              <button onClick={handleLogout} className="w-10 h-10 rounded-xl hover:bg-red-50 text-gray-400 hover:text-brand flex items-center justify-center transition-colors" title="Logout">
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Product panel */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200">
          {/* Search */}
          <div className="bg-white px-4 py-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                className="input-base pl-11 text-base"
                placeholder="Search product or SKU…"
                value={searchQuery}
                onChange={(e) => setSearch(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="bg-white px-3 py-2.5 border-b border-gray-100 flex gap-2 overflow-x-auto">
            {allCats.map((cat) => {
              const IconComp = cat === 'All' ? Tag : (CATEGORY_ICON_MAP[cat] ?? Package)
              const count = cat === 'All' ? products.length : products.filter((p) => p.category === cat).length
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-2 rounded-xl font-semibold transition-all min-w-[64px] ${
                    activeCategory === cat
                      ? 'bg-brand text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <IconComp className={`w-5 h-5 ${activeCategory === cat ? 'text-white' : 'text-gray-500'}`} />
                  <span className="text-[10px] font-bold leading-none">{cat === 'All' ? 'All' : cat.split(' ')[0]}</span>
                  <span className={`text-[9px] leading-none ${activeCategory === cat ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
                <p className="text-sm font-semibold">Loading products...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filtered.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id)
                  const isLow = product.stock > 0 && product.stock <= product.reorderPoint
                  const isOut = product.stock === 0
                  return (
                    <button
                      key={product.id}
                      onClick={() => !isOut && addToCart(product)}
                      disabled={isOut}
                      className={`relative text-left bg-white rounded-2xl border-2 p-3 transition-all active:scale-95 ${
                        isOut
                          ? 'border-gray-100 opacity-60 cursor-not-allowed'
                          : inCart
                          ? 'border-brand shadow-md shadow-brand/10'
                          : 'border-gray-100 hover:border-gray-300 hover:shadow-md'
                      }`}
                    >
                      {/* Product image */}
                      <div className="w-full aspect-square rounded-xl bg-gray-50 flex items-center justify-center mb-3 overflow-hidden relative">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className={`w-full h-full object-cover ${isOut ? 'grayscale' : ''}`} />
                        ) : (
                          <Package className="w-10 h-10 text-gray-300" />
                        )}
                        {isOut && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                            <span className="bg-gray-700 text-white text-[10px] font-bold px-2 py-1 rounded-lg">OUT OF STOCK</span>
                          </div>
                        )}
                        {inCart && !isOut && (
                          <span className="absolute top-1.5 left-1.5 min-w-[22px] h-[22px] bg-brand text-white rounded-full text-xs font-black flex items-center justify-center px-1 shadow-lg">
                            {inCart.quantity}
                          </span>
                        )}
                        {isLow && (
                          <span className="absolute top-1.5 right-1.5 bg-yellow-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow">
                            LOW
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-900 leading-tight line-clamp-2 mb-1">{product.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{product.sku}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-base font-black text-brand">{fmt(product.price)}</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          isOut ? 'bg-gray-100 text-gray-500' :
                          isLow ? 'bg-yellow-50 text-yellow-700' :
                          'bg-green-50 text-green-700'
                        }`}>
                          {product.stock}
                        </span>
                      </div>
                    </button>
                  )
                })}
                {!loading && filtered.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center h-48 text-gray-400">
                    <Search className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="text-sm font-semibold">No products found</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Cart panel */}
        <div className="w-80 xl:w-96 flex flex-col bg-white border-l border-gray-100">
          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <p className="font-black text-gray-900 text-base">Order</p>
              <p className="text-sm text-gray-500 font-medium">{itemCount} item{itemCount !== 1 ? 's' : ''}</p>
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="w-10 h-10 rounded-xl hover:bg-red-50 text-gray-400 hover:text-brand flex items-center justify-center transition-colors"
                title="Clear cart"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center pb-8">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                  <Tag className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-base font-bold text-gray-400">Cart is empty</p>
                <p className="text-sm text-gray-300 mt-1">Tap a product to add it</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="bg-gray-50 rounded-2xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 leading-tight line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">{fmt(item.product.price)} each</p>
                    </div>
                    <button onClick={() => removeFromCart(item.product.id)} className="w-8 h-8 rounded-xl hover:bg-red-50 text-gray-300 hover:text-brand flex items-center justify-center transition-colors flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-2.5 gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity - 1)}
                        className="w-9 h-9 rounded-xl bg-white border-2 border-gray-200 flex items-center justify-center hover:bg-gray-100 active:scale-95 transition-all"
                      >
                        <Minus className="w-3.5 h-3.5 text-gray-700" />
                      </button>
                      <span className="w-8 text-center text-base font-black text-gray-900">{item.quantity}</span>
                      <button
                        onClick={() => updateQty(item.product.id, item.quantity + 1)}
                        className="w-9 h-9 rounded-xl bg-brand border-2 border-brand flex items-center justify-center hover:bg-brand-dark active:scale-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 font-semibold">Disc</span>
                      <input
                        type="number"
                        min="0"
                        value={discountInput[item.product.id] ?? item.discount}
                        onChange={(e) => setDiscountInput((d) => ({ ...d, [item.product.id]: e.target.value }))}
                        onBlur={(e) => {
                          const v = parseFloat(e.target.value) || 0
                          usePOSStore.getState().applyDiscount(item.product.id, v)
                        }}
                        className="w-16 text-sm font-semibold border-2 border-gray-200 rounded-xl px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand text-center"
                        placeholder="0"
                      />
                    </div>

                    <p className="text-base font-black text-gray-900">
                      {fmt(item.product.price * item.quantity - item.discount)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals + checkout */}
          <div className="border-t border-gray-100 px-4 py-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 font-semibold text-sm">Subtotal</span>
              <span className="text-gray-800 font-bold">{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t-2 border-gray-100">
              <span className="text-gray-900 font-black text-lg">Total</span>
              <span className="text-brand font-black text-2xl">{fmt(total)}</span>
            </div>

            <button
              onClick={() => navigate('/pos/payment')}
              disabled={cart.length === 0}
              className="btn-primary w-full justify-center py-4 text-base rounded-2xl disabled:opacity-40 mt-1 shadow-lg shadow-brand/20"
            >
              Charge {cart.length > 0 ? fmt(total) : ''} <ChevronRight className="w-5 h-5 ml-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
