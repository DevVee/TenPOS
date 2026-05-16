import { Download, Loader2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Package, TrendingDown, TrendingUp } from 'lucide-react'
import { apiInventoryReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

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
  const { data, loading } = useApiData<InvData>(
    () => apiInventoryReport() as Promise<InvData>
  )

  const stockSummary    = data?.stockSummary    ?? []
  const fastMovers      = data?.fastMovers      ?? []
  const stockMovement   = data?.stockMovement   ?? []
  const valueByCategory = data?.valueByCategory ?? []

  const totalStockValue = stockSummary.reduce((s, p) => s + Number(p.stock_value), 0)
  const shrinkageQty    = stockMovement.find((m) => m.type === 'remove')?.total_quantity ?? 0
  const restockedQty    = stockMovement.find((m) => m.type === 'add')?.total_quantity    ?? 0

  const chartData = valueByCategory.slice(0, 8).map((c) => ({
    name: c.category?.slice(0, 12) ?? 'Other',
    value: Number(c.total_value),
    stock: c.total_stock,
  }))

  return (
    <div>
      <PageHeader
        title="Inventory Report"
        subtitle="Stock movement, turnover, and valuation"
        actions={
          <button className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> Export</button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <StatCard label="Stock Value" value={fmt(totalStockValue)} sub="At cost price" icon={Package} />
            <StatCard label="Restocked (30d)" value={`+${restockedQty} units`} sub="Stock additions" icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
            <StatCard label="Removed (30d)" value={`${shrinkageQty} units`} sub="Damage / adjustments" icon={TrendingDown} iconColor="text-red-600" iconBg="bg-red-50" />
          </div>

          <div className="card p-4 mb-4">
            <p className="text-sm font-semibold text-gray-800 mb-4">Inventory Value by Category</p>
            {chartData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-gray-300 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: unknown) => [fmt(v as number), 'Stock Value']} contentStyle={{ border: '1px solid #f0f0f0', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" name="Stock Value" fill="#C0392B" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

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
