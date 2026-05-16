import { useState } from 'react'
import { Search, Plus, Download, Upload, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { apiGetInventory } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

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

export function InventoryList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const { data, loading, error } = useApiData<InventoryItem[]>(
    () => apiGetInventory() as Promise<InventoryItem[]>
  )

  const products = data ?? []

  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category_name).filter(Boolean))).sort()]

  const filtered = products.filter((p) => {
    const matchSearch = !search || p.product_name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'All' || p.category_name === category
    return matchSearch && matchCat
  })

  const stockValue = products.reduce((s, p) => s + Number(p.cost) * Number(p.stock), 0)
  const lowStockCount = products.filter((p) => Number(p.stock) <= Number(p.reorder_point)).length
  const totalUnits = products.reduce((s, p) => s + Number(p.stock), 0)

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={loading ? 'Loading...' : `${products.length} products · Stock value ${fmt(stockValue)}`}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-1.5"><Upload className="w-4 h-4" /> Import CSV</button>
            <button className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> Export</button>
            <button onClick={() => navigate('/inventory/add')} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Product</button>
          </div>
        }
      />

      {error && (
        <div className="card p-4 mb-4 text-sm text-red-600 bg-red-50 border-red-100">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card p-3 text-center">
          <p className="text-2xl font-semibold text-gray-900">{products.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Products</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-semibold text-yellow-600">{lowStockCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Low Stock</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-semibold text-gray-900">{totalUnits}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Units</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input-base pl-9" placeholder="Search by name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                category === c ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >{c}</button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Stock</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No products found</td></tr>
                  ) : (
                    filtered.map((p) => {
                      const isLow = Number(p.stock) <= Number(p.reorder_point)
                      return (
                        <tr key={p.product_id} className="table-row cursor-pointer" onClick={() => navigate(`/inventory/${p.product_id}`)}>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-800">{p.product_name}</p>
                            <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{p.category_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">{fmt(Number(p.cost))}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-800 text-right">{fmt(Number(p.price))}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-semibold ${isLow ? 'text-yellow-600' : 'text-gray-800'}`}>{p.stock}</span>
                            {isLow && <p className="text-[10px] text-yellow-500">Low stock</p>}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <Badge variant={p.active ? 'green' : 'gray'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {filtered.length} of {products.length} products
            </div>
          </>
        )}
      </div>
    </div>
  )
}
