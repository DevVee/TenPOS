import { useState, useMemo } from 'react'
import { Download, Loader2, Search, AlertTriangle, MapPin } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { downloadXLSX } from '../../lib/xlsxExport'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { StatCard } from '../../components/ui/StatCard'
import { Package, TrendingDown, TrendingUp } from 'lucide-react'
import { apiInventoryReport, apiGetBranches } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore } from '../../store/branchStore'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface StockItem {
  id: string; name: string; sku: string; price: string; cost: string
  category_name: string; total_stock: number; reorder_point: number; stock_value: string
}
interface FastMover { product_id: string; product_name: string; quantity_sold: number; revenue: string }
interface Adjustment { type: string; count: number; total_quantity: number }
interface CategoryValue { category: string; products: number; total_stock: number; total_value: string }
interface InvData {
  stockSummary: StockItem[]
  fastMovers: FastMover[]
  stockMovement: Adjustment[]
  valueByCategory: CategoryValue[]
}

export function InventoryReport() {
  const { user } = useAuthStore()
  const { activeBranchId } = useBranchStore()
  const isAdmin = user?.role === 'admin'
  const defaultBranch = isAdmin ? (activeBranchId ?? '') : (user?.branch_id ?? '')
  const [branchFilter, setBranchFilter] = useState(defaultBranch)

  const { data: branchData } = useApiData<{ id: string; name: string }[]>(
    () => isAdmin ? apiGetBranches() as Promise<{ id: string; name: string }[]> : Promise.resolve([]),
    []
  )
  const branches = branchData ?? []

  const { data, loading } = useApiData<InvData>(
    () => apiInventoryReport(branchFilter ? { branch_id: branchFilter } : undefined) as unknown as Promise<InvData>,
    [branchFilter]
  )

  const [search,        setSearch]        = useState('')
  const [category,      setCategory]      = useState('All')
  const [lowStockOnly,  setLowStockOnly]  = useState(false)

  const stockSummary    = data?.stockSummary    ?? []
  const fastMovers      = data?.fastMovers      ?? []
  const stockMovement   = data?.stockMovement   ?? []
  const valueByCategory = data?.valueByCategory ?? []

  // Available categories
  const categories = useMemo(
    () => ['All', ...[...new Set(stockSummary.map((p) => p.category_name ?? 'Uncategorized').filter(Boolean))].sort()],
    [stockSummary]
  )

  // Filtered rows
  const filteredStock = useMemo(() => {
    let rows = stockSummary
    if (category !== 'All') rows = rows.filter((p) => (p.category_name ?? 'Uncategorized') === category)
    if (lowStockOnly)        rows = rows.filter((p) => p.total_stock <= p.reorder_point)
    if (search.trim())       rows = rows.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    )
    return rows
  }, [stockSummary, category, lowStockOnly, search])

  const totalStockValue = stockSummary.reduce((s, p) => s + Number(p.stock_value), 0)
  const shrinkageQty    = stockMovement.find((m) => m.type === 'remove')?.total_quantity ?? 0
  const restockedQty    = stockMovement.find((m) => m.type === 'add')?.total_quantity    ?? 0
  const lowStockCount   = stockSummary.filter((p) => p.total_stock <= p.reorder_point).length

  const chartData = valueByCategory.slice(0, 8).map((c) => ({
    name:  c.category?.slice(0, 12) ?? 'Other',
    Value: Number(c.total_value),
    stock: c.total_stock,
  }))

  const today = new Date().toISOString().slice(0, 10)

  const handleExport = () => {
    const margin = (p: StockItem) =>
      Number(p.cost) > 0 && Number(p.price) > 0
        ? (Number(p.price) - Number(p.cost)) / Number(p.price)
        : 0

    downloadXLSX(
      `TenPOS-Inventory-${today}`,
      [
        // Sheet 1: Stock Levels
        {
          name: 'Stock Levels',
          periodLabel: `Generated ${today}`,
          columns: [
            { header: '#',              type: 'number', width: 6 },
            { header: 'Product Name',   width: 36 },
            { header: 'SKU',            width: 16 },
            { header: 'Category',       width: 22 },
            { header: 'Cost (₱)',       type: 'money',  width: 14 },
            { header: 'Price (₱)',      type: 'money',  width: 14 },
            { header: 'Margin %',       type: 'percent', width: 12 },
            { header: 'Stock',          type: 'number', width: 10 },
            { header: 'Reorder Point',  type: 'number', width: 14 },
            { header: 'Status',         width: 14 },
            { header: 'Stock Value (₱)', type: 'money', width: 18 },
          ],
          rows: stockSummary.map((p, i) => [
            i + 1,
            p.name,
            p.sku,
            p.category_name ?? 'Uncategorized',
            Number(p.cost),
            Number(p.price),
            margin(p),
            p.total_stock,
            p.reorder_point,
            p.total_stock === 0 ? 'Out of Stock' : p.total_stock <= p.reorder_point ? 'Low Stock' : 'OK',
            Number(p.stock_value),
          ]),
          totalsRow: [
            '',
            `${stockSummary.length} products`,
            '', '', '', '', '',
            stockSummary.reduce((s, p) => s + p.total_stock, 0),
            '',
            '',
            totalStockValue,
          ],
        },

        // Sheet 2: Fast Movers
        {
          name: 'Fast Movers (30d)',
          periodLabel: 'Last 30 days',
          columns: [
            { header: '#',            type: 'number', width: 6 },
            { header: 'Product Name', width: 36 },
            { header: 'Units Sold',   type: 'number', width: 14 },
            { header: 'Revenue (₱)',  type: 'money',  width: 18 },
          ],
          rows: fastMovers.map((p, i) => [
            i + 1,
            p.product_name,
            p.quantity_sold,
            Number(p.revenue),
          ]),
          totalsRow: [
            '',
            'TOTAL',
            fastMovers.reduce((s, p) => s + p.quantity_sold, 0),
            fastMovers.reduce((s, p) => s + Number(p.revenue), 0),
          ],
        },
      ],
      'Inventory Report'
    )
  }

  const activeBranchLabel = branchFilter
    ? (branches.find((b) => b.id === branchFilter)?.name ?? 'Branch')
    : 'All Branches'

  return (
    <div>
      {/* ─── Print-only report header ─────────────────────────────────────── */}
      <div className="print-only print-report-header">
        <h1>Inventory Report</h1>
        <p>Branch: {activeBranchLabel}</p>
        <p>Generated: {new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}</p>
      </div>

      <PageHeader
        title="Inventory Report"
        subtitle={`Stock movement · ${activeBranchLabel}`}
        actions={
          <div className="no-print flex items-center gap-2">
            {isAdmin && branches.length > 0 && (
              <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-600">
                <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="bg-transparent text-xs text-gray-700 font-medium outline-none cursor-pointer"
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-4 gap-3 mb-5">
            <StatCard label="Stock Value"     value={fmt(totalStockValue)}        subLabel="At cost price"         icon={Package}       iconColor="blue"    />
            <StatCard label="Restocked (30d)" value={`+${restockedQty} units`}   subLabel="Stock additions"       icon={TrendingUp}    iconColor="emerald" />
            <StatCard label="Removed (30d)"   value={`${shrinkageQty} units`}    subLabel="Damage / adjustments"  icon={TrendingDown}  iconColor="red"     />
            <StatCard label="Low Stock"       value={String(lowStockCount)}       subLabel="At or below reorder"   icon={AlertTriangle} iconColor="amber"   />
          </div>

          <div className="card p-4 mb-4">
            <p className="text-sm font-bold text-gray-800 mb-4">Inventory Value by Category</p>
            {chartData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-gray-300 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `₱${(v/1000).toFixed(0)}k` : `₱${v}`} width={48} />
                  <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'Value']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="Value" fill="#27AE60" radius={[4, 4, 0, 0]} maxBarSize={72} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Filters bar ─────────────────────────────────────────────────── */}
          <div className="no-print flex flex-wrap gap-2 mb-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product or SKU..."
                className="input-base pl-8 py-1.5 text-sm w-full"
              />
            </div>

            {/* Category */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-base py-1.5 text-sm"
            >
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>

            {/* Low stock toggle */}
            <button
              onClick={() => setLowStockOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                lowStockOnly
                  ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-yellow-200 hover:text-yellow-600'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Low Stock Only
            </button>

            <span className="text-xs text-gray-400 self-center ml-1">{filteredStock.length} products</span>
          </div>

          {/* Stock table */}
          <div className="card overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Product</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">SKU</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 hidden md:table-cell">Category</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Cost</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Price</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Stock</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Status</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 hidden lg:table-cell">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-300">
                      {lowStockOnly ? 'No low-stock products' : 'No products match filter'}
                    </td></tr>
                  ) : (
                    filteredStock.map((p) => {
                      const isLow = p.total_stock <= p.reorder_point && p.total_stock > 0
                      const isOut = p.total_stock === 0
                      return (
                        <tr key={p.id} className="table-row">
                          <td className="px-4 py-3 text-sm font-medium text-gray-700">{p.name}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 hidden sm:table-cell">{p.sku}</td>
                          <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">{p.category_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">{fmt(Number(p.cost))}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">{fmt(Number(p.price))}</td>
                          <td className={`px-4 py-3 text-sm font-bold text-right ${isOut ? 'text-brand' : isLow ? 'text-yellow-600' : 'text-green-600'}`}>
                            {p.total_stock}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isOut ? 'bg-red-50 text-brand' :
                              isLow ? 'bg-yellow-50 text-yellow-700' :
                                      'bg-green-50 text-green-700'
                            }`}>
                              {isOut ? 'Out' : isLow ? 'Low' : 'OK'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-right hidden lg:table-cell">
                            {fmt(Number(p.stock_value))}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fast Movers */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-800">Top Movers (Last 30 Days)</p>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Product</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Units Sold</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Revenue</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Velocity</th>
                </tr>
              </thead>
              <tbody>
                {fastMovers.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-300">No sales data in last 30 days</td></tr>
                ) : (
                  fastMovers.slice(0, 15).map((p, i) => {
                    const velocity = i < fastMovers.length * 0.33 ? 'fast' : i < fastMovers.length * 0.66 ? 'medium' : 'slow'
                    return (
                      <tr key={p.product_id} className="table-row">
                        <td className="px-4 py-3 text-sm font-medium text-gray-700">{p.product_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 text-right">{p.quantity_sold}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(Number(p.revenue))}</td>
                        <td className="px-4 py-3">
                          <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            velocity === 'fast' ? 'bg-green-50 text-green-700' :
                            velocity === 'slow' ? 'bg-red-50 text-brand'       : 'bg-yellow-50 text-yellow-700'
                          }`}>
                            {velocity === 'fast' ? <TrendingUp className="w-3 h-3" /> : velocity === 'slow' ? <TrendingDown className="w-3 h-3" /> : null}
                            {velocity}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
