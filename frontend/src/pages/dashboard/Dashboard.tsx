import { useEffect, useState } from 'react'
import { ShoppingBag, Package, AlertTriangle, DollarSign, Users, Loader2 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { useNavigate } from 'react-router-dom'
import { apiSalesReport, apiGetTransactions, apiGetLowStock } from '../../lib/api'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface SalesData { summary: { total_revenue: number; transaction_count: number; total_items_sold: number; avg_order_value: number }; salesByPeriod: { date: string; revenue: number; count: number }[]; topProducts: { product_name: string; quantity_sold: number; revenue: number }[] }
interface Transaction { id: string; receipt_no: string; created_at: string; staff_name: string; total: number; payment_method: string; status: string }
interface LowStockItem { product_name: string; stock: number; reorder_point: number }

export function Dashboard() {
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)

  const [salesData, setSalesData] = useState<SalesData | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [lowStock, setLowStock] = useState<LowStockItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [sales, txns, ls] = await Promise.all([
          apiSalesReport({ from: today + 'T00:00:00', to: today + 'T23:59:59' }) as Promise<SalesData>,
          apiGetTransactions({ limit: '5', sort: 'desc' }) as Promise<{ data: Transaction[] }>,
          apiGetLowStock() as Promise<LowStockItem[]>,
        ])
        if (alive) {
          setSalesData(sales)
          setTransactions(txns.data ?? [])
          setLowStock(Array.isArray(ls) ? ls.slice(0, 5) : [])
        }
      } catch {
        // silently fallback — UI shows dashes
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [today])

  const summary = salesData?.summary
  const chartData = (salesData?.salesByPeriod ?? []).map((p) => ({
    day: new Date(p.date).toLocaleDateString('en-PH', { weekday: 'short' }),
    sales: Number(p.revenue),
  }))
  const topProducts = salesData?.topProducts ?? []

  const paymentBadge = (method: string) => {
    const m = method?.toLowerCase()
    if (m === 'cash') return 'green'
    if (m === 'gcash') return 'blue'
    if (m === 'card') return 'gray'
    return 'yellow'
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Today · ${new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
        actions={
          <button onClick={() => navigate('/pos')} className="btn-primary flex items-center gap-1.5">
            <ShoppingBag className="w-4 h-4" /> Open POS
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Today's Revenue"
              value={summary ? fmt(Number(summary.total_revenue)) : '—'}
              sub={summary ? `${summary.transaction_count} transactions` : ''}
              icon={DollarSign}
            />
            <StatCard
              label="Transactions"
              value={summary ? String(summary.transaction_count) : '—'}
              sub={summary ? `Avg ${fmt(Number(summary.avg_order_value))} each` : ''}
              icon={ShoppingBag}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
            />
            <StatCard
              label="Items Sold"
              value={summary ? String(summary.total_items_sold) : '—'}
              icon={Package}
              iconColor="text-green-600"
              iconBg="bg-green-50"
            />
            <StatCard
              label="Low Stock"
              value={String(lowStock.length)}
              sub={lowStock.length > 0 ? 'products need reorder' : 'All stocked'}
              icon={Users}
              iconColor={lowStock.length > 0 ? 'text-yellow-600' : 'text-purple-600'}
              iconBg={lowStock.length > 0 ? 'bg-yellow-50' : 'bg-purple-50'}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            {/* Sales chart */}
            <div className="card p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">Sales This Week</p>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C0392B" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#C0392B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: unknown) => [fmt(v as number), 'Sales']}
                      contentStyle={{ border: '1px solid #f0f0f0', borderRadius: 8, fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="sales" stroke="#C0392B" strokeWidth={2} fill="url(#salesGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-300 text-sm">No sales data yet</div>
              )}
            </div>

            {/* Top products */}
            <div className="card p-4">
              <p className="text-sm font-semibold text-gray-800 mb-4">Top Products Today</p>
              {topProducts.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-4">No sales today yet</p>
              ) : (
                <div className="space-y-3">
                  {topProducts.slice(0, 5).map((p, i) => (
                    <div key={p.product_name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{p.product_name}</p>
                        <p className="text-[10px] text-gray-400">{p.quantity_sold} sold</p>
                      </div>
                      <span className="text-xs font-semibold text-gray-700">{fmt(Number(p.revenue))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Recent transactions */}
            <div className="card lg:col-span-2">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">Recent Transactions</p>
                <button onClick={() => navigate('/transactions')} className="text-xs text-brand hover:underline">View all</button>
              </div>
              {transactions.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-300 text-sm">No transactions today</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Receipt</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">Cashier</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Method</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="table-row cursor-pointer" onClick={() => navigate(`/transactions/${t.id}`)}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-700">{t.receipt_no}</p>
                          <p className="text-xs text-gray-400">
                            {new Date(t.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{t.staff_name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={paymentBadge(t.payment_method) as 'green' | 'blue' | 'gray' | 'yellow'}>{t.payment_method}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(Number(t.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Low stock alerts */}
            <div className="card">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">Low Stock Alerts</p>
                <button onClick={() => navigate('/inventory/low-stock')} className="text-xs text-brand hover:underline">View all</button>
              </div>
              <div className="p-4 space-y-3">
                {lowStock.length === 0 ? (
                  <p className="text-sm text-gray-300 text-center py-4">All products well stocked</p>
                ) : (
                  lowStock.slice(0, 4).map((item) => (
                    <div key={item.product_name} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{item.product_name}</p>
                        <p className="text-[10px] text-gray-400">{item.stock} units left · Reorder at {item.reorder_point}</p>
                        <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-yellow-400 rounded-full"
                            style={{ width: `${Math.min(100, (item.stock / Math.max(1, item.reorder_point * 3)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <button onClick={() => navigate('/inventory')} className="btn-secondary w-full text-xs py-2 mt-1">
                  Manage Inventory
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
