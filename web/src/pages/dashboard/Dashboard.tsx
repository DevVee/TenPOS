import { useCallback, useEffect, useState } from 'react'
import {
  ShoppingBag, Package, AlertTriangle, DollarSign,
  Loader2, ShoppingCart, TrendingUp, ArrowRight, MapPin,
} from 'lucide-react'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { useNavigate } from 'react-router-dom'
import { apiSalesReport, apiGetTransactions, apiGetLowStock } from '../../lib/api'
import { subscribeTransactions, subscribeStock } from '../../lib/realtime'
import { useActiveBranch } from '../../hooks/useActiveBranch'
import { useBranchStore } from '../../store/branchStore'
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
  Tooltip, AreaChart, Area,
} from 'recharts'

function fmt(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}
function pct(a: number, b: number) {
  if (b === 0) return null
  const v = ((a - b) / b) * 100
  return { value: `${Math.abs(v).toFixed(1)}%`, positive: v >= 0 }
}
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)  return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

interface SalesData {
  summary: { total_revenue: number; transaction_count: number; total_items_sold: number; avg_order_value: number }
  salesByPeriod: { date: string; revenue: number; count: number }[]
  topProducts: { product_name: string; quantity_sold: number; revenue: number }[]
}
interface Transaction {
  id: string; receipt_no: string; created_at: string
  staff_name: string; total: number; payment_method: string; status: string
}
interface LowStockItem { product_name: string; stock: number; reorder_point: number }

// ── Tooltip ───────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-panel px-3 py-2.5 min-w-[130px]">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-bold text-gray-900 tabular-nums">{fmt(Number(payload[0].value ?? 0))}</p>
    </div>
  )
}

// ── Payment badge helper ───────────────────────────────────────────────────────
function paymentVariant(method: string): 'green' | 'blue' | 'gray' | 'yellow' {
  const m = method?.toLowerCase()
  if (m === 'cash')  return 'green'
  if (m === 'gcash') return 'blue'
  if (m === 'card')  return 'gray'
  return 'yellow'
}

// ── Stock level pct ───────────────────────────────────────────────────────────
function stockPct(item: LowStockItem) {
  return Math.min(100, (item.stock / Math.max(1, item.reorder_point * 2.5)) * 100)
}

export function Dashboard() {
  const navigate = useNavigate()
  const activeBranch = useActiveBranch()
  const { activeBranchName } = useBranchStore()
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)

  const [salesData,     setSalesData]     = useState<SalesData | null>(null)
  const [yestData,      setYestData]      = useState<SalesData | null>(null)
  const [transactions,  setTransactions]  = useState<Transaction[]>([])
  const [lowStock,      setLowStock]      = useState<LowStockItem[]>([])
  const [loading,       setLoading]       = useState(true)

  const load = useCallback(async () => {
    try {
      const bp: Record<string, string> = activeBranch ? { branch_id: activeBranch } : {}
      const [sales, yest, txns, ls] = await Promise.all([
        apiSalesReport({ from: today     + 'T00:00:00', to: today     + 'T23:59:59', ...bp }) as Promise<SalesData>,
        apiSalesReport({ from: yesterday + 'T00:00:00', to: yesterday + 'T23:59:59', ...bp }) as Promise<SalesData>,
        apiGetTransactions({ limit: '6', sort: 'desc', ...bp }) as Promise<{ data: Transaction[] }>,
        apiGetLowStock(activeBranch ?? undefined) as Promise<LowStockItem[]>,
      ])
      setSalesData(sales)
      setYestData(yest)
      setTransactions(txns.data ?? [])
      setLowStock(Array.isArray(ls) ? ls.slice(0, 5) : [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [today, yesterday, activeBranch])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const u1 = subscribeTransactions(load)
    const u2 = subscribeStock(load)
    return () => { u1(); u2() }
  }, [load])

  const s  = salesData?.summary
  const sy = yestData?.summary

  const sparkline   = (salesData?.salesByPeriod ?? []).map((p) => Number(p.revenue))
  const chartData   = (salesData?.salesByPeriod ?? []).map((p) => ({
    day:     new Date(p.date).toLocaleDateString('en-PH', { weekday: 'short' }),
    Revenue: Number(p.revenue),
  }))
  const topProducts = salesData?.topProducts ?? []
  const maxRevenue  = Math.max(...topProducts.map((p) => Number(p.revenue)), 1)

  const revenueTrend = s && sy ? pct(Number(s.total_revenue),     Number(sy.total_revenue))     ?? undefined : undefined
  const txnTrend     = s && sy ? pct(Number(s.transaction_count), Number(sy.transaction_count)) ?? undefined : undefined
  const itemsTrend   = s && sy ? pct(Number(s.total_items_sold),  Number(sy.total_items_sold))  ?? undefined : undefined

  // ── Rank chip colors ──────────────────────────────────────────────────────
  const rankStyle = (i: number) => [
    'bg-amber-50 text-amber-700',
    'bg-gray-100 text-gray-500',
    'bg-orange-50 text-orange-600',
  ][i] ?? 'bg-gray-100 text-gray-400'

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <span>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
            {activeBranchName && (
              <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-brand-pale text-brand rounded-full">
                <MapPin className="w-3 h-3" />
                {activeBranchName}
              </span>
            )}
          </span>
        }
        actions={
          <button onClick={() => navigate('/pos')} className="btn-primary">
            <ShoppingCart className="w-3.5 h-3.5" />
            Open POS
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* ── Row 1: KPI strip ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard
              label="Today's Revenue"
              value={s ? fmt(Number(s.total_revenue)) : '—'}
              icon={DollarSign}
              iconColor="emerald"
              live
              trend={revenueTrend}
              subValue={s ? String(s.transaction_count) : '—'}
              subLabel="transactions"
              sparkline={sparkline.length >= 2 ? sparkline : undefined}
            />
            <StatCard
              label="Orders"
              value={s ? String(s.transaction_count) : '—'}
              icon={ShoppingBag}
              iconColor="blue"
              live
              trend={txnTrend}
              subValue={s ? fmt(Number(s.avg_order_value)) : '—'}
              subLabel="avg order"
            />
            <StatCard
              label="Items Sold"
              value={s ? String(s.total_items_sold) : '—'}
              icon={Package}
              iconColor="violet"
              trend={itemsTrend}
              subValue={String(topProducts.length)}
              subLabel="products"
            />
            <StatCard
              label="Low Stock"
              value={String(lowStock.length)}
              icon={AlertTriangle}
              iconColor={lowStock.length > 0 ? 'amber' : 'emerald'}
              subValue={lowStock.length > 0 ? `${lowStock.length} items` : 'All items'}
              subLabel={lowStock.length > 0 ? 'need reorder' : 'fully stocked'}
            />
          </div>

          {/* ── Row 2: Chart + Top Products ───────────────────────────────── */}
          <div className="grid lg:grid-cols-3 gap-4 mb-4">

            {/* Revenue chart — 2/3 */}
            <div className="card-elevated p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Revenue This Week</p>
                  <p className="text-xs text-gray-400 mt-0.5">Daily sales overview</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-brand" />
                  <span className="text-xs text-gray-400">Revenue</span>
                </div>
              </div>

              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 2, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#E5484D" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#E5484D" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 500 }}
                      axisLine={false} tickLine={false} dy={6}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 500 }}
                      axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`}
                      width={44}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ stroke: '#E5E7EB', strokeWidth: 1, strokeDasharray: '4 3' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="Revenue"
                      stroke="#E5484D"
                      strokeWidth={2.5}
                      fill="url(#revGrad)"
                      dot={{ r: 3.5, fill: '#E5484D', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 5, fill: '#E5484D', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={TrendingUp}
                  title="No sales data yet"
                  description="Sales will appear here once transactions are recorded."
                  compact
                />
              )}
            </div>

            {/* Top products — 1/3 */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Top Products</p>
                  <p className="text-xs text-gray-400 mt-0.5">By revenue today</p>
                </div>
              </div>

              {topProducts.length === 0 ? (
                <EmptyState icon={Package} title="No sales today" compact />
              ) : (
                <div className="space-y-4">
                  {topProducts.slice(0, 5).map((p, i) => (
                    <div key={p.product_name} className="flex items-start gap-3">
                      <span className={`text-[11px] font-bold w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${rankStyle(i)}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-xs font-medium text-gray-700 truncate">{p.product_name}</p>
                          <span className="text-xs font-semibold text-gray-900 flex-shrink-0 tabular-nums">
                            {fmt(Number(p.revenue))}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand rounded-full"
                              style={{ width: `${(Number(p.revenue) / maxRevenue) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{p.quantity_sold} sold</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Row 3: Transactions + Low Stock ───────────────────────────── */}
          <div className="grid lg:grid-cols-3 gap-4">

            {/* Recent transactions — 2/3 */}
            <div className="card overflow-hidden lg:col-span-2">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">Recent Transactions</p>
                <button
                  onClick={() => navigate('/transactions')}
                  className="flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium transition-colors"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {transactions.length === 0 ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="No transactions today"
                  description="Start selling to see transactions here."
                  compact
                />
              ) : (
                <table className="w-full">
                  <thead className="table-head">
                    <tr>
                      <th>Receipt</th>
                      <th className="hidden sm:table-cell">Cashier</th>
                      <th>Method</th>
                      <th>Time</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr
                        key={t.id}
                        className="table-row cursor-pointer"
                        onClick={() => navigate(`/transactions/${t.id}`)}
                      >
                        <td>
                          <p className="text-sm font-medium text-gray-800">{t.receipt_no}</p>
                        </td>
                        <td className="hidden sm:table-cell">
                          <p className="text-sm text-gray-500">{t.staff_name}</p>
                        </td>
                        <td>
                          <Badge variant={paymentVariant(t.payment_method)}>{t.payment_method}</Badge>
                        </td>
                        <td>
                          <p className="text-xs text-gray-400">{timeAgo(t.created_at)}</p>
                        </td>
                        <td className="text-right">
                          <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(Number(t.total))}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Low stock — 1/3 */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">Low Stock</p>
                <button
                  onClick={() => navigate('/inventory/low-stock')}
                  className="flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium transition-colors"
                >
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="divide-y divide-gray-50">
                {lowStock.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title="All products stocked"
                    description="No reorders needed right now."
                    compact
                  />
                ) : (
                  lowStock.map((item) => {
                    const pct = stockPct(item)
                    const isCritical = item.stock <= 2
                    return (
                      <div key={item.product_name} className="flex items-start gap-3 px-5 py-3.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-xs font-medium text-gray-700 truncate">{item.product_name}</p>
                            <Badge variant={isCritical ? 'red' : 'yellow'}>
                              {isCritical ? 'Critical' : 'Low'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isCritical ? 'bg-red-500' : 'bg-amber-400'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">
                              {item.stock} / {item.reorder_point}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {lowStock.length > 0 && (
                <div className="px-5 py-3 border-t border-gray-100">
                  <button
                    onClick={() => navigate('/inventory')}
                    className="btn-secondary w-full text-xs justify-center"
                  >
                    Manage Inventory
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
