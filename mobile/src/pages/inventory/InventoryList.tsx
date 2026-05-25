import { useState, useEffect } from 'react'
import { Search, Plus, Loader2, Package, AlertTriangle, Layers } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { apiGetInventory } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { onSyncEvent } from '../../lib/sync'
import { useAuthStore } from '../../store/authStore'
function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface InventoryItem {
  id: string
  product_id: string
  product_name: string
  sku: string
  category_name: string
  price: number
  cost: number
  stock: number
  reorder_point: number
  active: boolean
}

function StockBar({ stock, reorder }: { stock: number; reorder: number }) {
  const max = Math.max(reorder * 3, stock, 1)
  const pct = Math.min(100, (stock / max) * 100)
  const isCritical = stock <= 2
  const isLow = stock <= reorder && !isCritical
  const color = isCritical ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="flex items-center space-x-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-medium tabular-nums ${isCritical ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-800'}`}>
        {stock}
      </span>
    </div>
  )
}

export function InventoryList() {
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const [search,    setSearch]    = useState('')
  const [category,  setCategory]  = useState('All')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all')

  const { data, loading, error, refetch } = useApiData<InventoryItem[]>(
    () => apiGetInventory(user?.branch_id ?? undefined) as Promise<InventoryItem[]>,
    [user?.branch_id]
  )

  useEffect(() => {
    const u1 = onSyncEvent('sync:done',     refetch)
    const u2 = onSyncEvent('cache:updated', refetch)
    return () => { u1(); u2() }
  }, [refetch])

  const products = data ?? []
  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category_name).filter(Boolean))).sort()]

  const filtered = products.filter((p) => {
    const matchSearch = !search ||
      p.product_name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    const matchCat   = category === 'All' || p.category_name === category
    const matchStock =
      stockFilter === 'all' ? true :
      stockFilter === 'out' ? Number(p.stock) === 0 :
      Number(p.stock) <= Number(p.reorder_point)
    return matchSearch && matchCat && matchStock
  })

  const stockValue    = products.reduce((s, p) => s + Number(p.cost) * Number(p.stock), 0)
  const lowStockCount = products.filter((p) => Number(p.stock) <= Number(p.reorder_point) && Number(p.stock) > 0).length
  const outOfStock    = products.filter((p) => Number(p.stock) === 0).length

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={loading ? 'Loading…' : `${products.length} products · Stock value ${fmt(stockValue)}`}
        actions={
          <button
            onClick={() => navigate('/inventory/add')}
            className="btn-primary flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" /><span>Add Product</span>
          </button>
        }
      />

      {/* Alerts */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 md:gap-4 mb-4 md:mb-5">
        <div className="card p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mb-2 sm:mb-0">
              <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold text-gray-900 leading-none">{products.length}</p>
              <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">Products</p>
            </div>
          </div>
        </div>
        <div className="card p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 mb-2 sm:mb-0">
              <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold text-amber-600 leading-none">{lowStockCount}</p>
              <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">Low Stock</p>
            </div>
          </div>
        </div>
        <div className="card p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mb-2 sm:mb-0">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold text-gray-900 leading-none">
                {products.reduce((s, p) => s + Number(p.stock), 0)}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">Total Units</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            className="input-base pl-9 w-full"
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Single row: category pills (scrollable, left) + stock filters (pinned right) */}
        <div className="flex items-center mt-3" style={{ gap: '8px' }}>
          <div className="flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <div className="flex" style={{ gap: '6px' }}>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`flex-shrink-0 h-9 px-3 text-xs font-medium transition-colors whitespace-nowrap border ${
                    category === c
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Stock filter — pinned to the right */}
          <div className="flex flex-shrink-0" style={{ gap: '6px' }}>
            {([['all', 'All Stock'], ['low', 'Low Stock'], ['out', 'Out of Stock']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setStockFilter(v)}
                className={`flex-shrink-0 h-9 px-3 text-xs font-medium transition-colors whitespace-nowrap border ${
                  stockFilter === v
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{label}</span>
                {v === 'low' && lowStockCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-[9px] font-bold">
                    {lowStockCount}
                  </span>
                )}
                {v === 'out' && outOfStock > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                    {outOfStock}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-head">
                  <tr>
                    <th>Product</th>
                    <th className="hidden sm:table-cell">Category</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Price</th>
                    <th>Stock</th>
                    <th className="hidden md:table-cell">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={Package}
                          title="No products found"
                          description="Try adjusting your filters or search query."
                          compact
                        />
                      </td>
                    </tr>
                  ) : (
                    filtered.map((p) => {
                      const isLow = Number(p.stock) <= Number(p.reorder_point) && Number(p.stock) > 0
                      const isOut = Number(p.stock) === 0
                      return (
                        <tr
                          key={p.product_id}
                          className="table-row cursor-pointer"
                          onClick={() => navigate(`/inventory/${p.product_id}`)}
                        >
                          <td>
                            <p className="text-sm font-medium text-gray-800">{p.product_name}</p>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">{p.sku}</p>
                          </td>
                          <td className="hidden sm:table-cell">
                            <span className="text-sm text-gray-500">{p.category_name}</span>
                          </td>
                          <td className="text-right">
                            <span className="text-sm text-gray-500 tabular-nums">{fmt(Number(p.cost))}</span>
                          </td>
                          <td className="text-right">
                            <span className="text-sm font-medium text-gray-800 tabular-nums">{fmt(Number(p.price))}</span>
                          </td>
                          <td>
                            {isOut ? (
                              <Badge variant="red">Out of stock</Badge>
                            ) : (
                              <StockBar stock={Number(p.stock)} reorder={Number(p.reorder_point)} />
                            )}
                            {isLow && !isOut && (
                              <p className="text-[10px] text-amber-500 mt-0.5">Reorder at {p.reorder_point}</p>
                            )}
                          </td>
                          <td className="hidden md:table-cell">
                            <Badge variant={p.active ? 'green' : 'gray'}>
                              {p.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Showing <span className="font-medium text-gray-600">{filtered.length}</span> of {products.length} products
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
