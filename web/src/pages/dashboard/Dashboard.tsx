import { useCallback, useEffect, useState } from 'react'
import {
  ShoppingBag, Package, AlertTriangle, DollarSign,
  Users, Loader2, ShoppingCart,
} from 'lucide-react'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { useNavigate } from 'react-router-dom'
import { apiSalesReport, apiGetTransactions, apiGetLowStock } from '../../lib/api'
import { subscribeTransactions, subscribeStock } from '../../lib/realtime'
import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
  Tooltip, AreaChart, Area,
} from 'recharts'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }
function pct(a: number, b: number) {
  if (b === 0) return null
  const v = ((a - b) / b) * 100
  return { value: Math.abs(v).toFixed(1) + '%', positive: v >= 0 }
}

interface SalesData {
  summary: { total_revenue: number; transaction_count: number; total_items_sold: number; avg_order_value: number }
  salesByPeriod: { date: string; revenue: number; count: number }[]
  topProducts: { product_name: string; quantity_sold: number; revenue: number }[]
}
interface Transaction { id: string; receipt_no: string; created_at: string; staff_name: string; total: number; payment_method: string; status: string }
interface LowStockItem { product_name: string; stock: number; reorder_point: number }

const RANK_STYLES = [
  'bg-amber-100 text-amber-700 border border-amber-200',
  'bg-slate-100 text-slate-600 border border-slate-200',
  'bg-orange-100 text-orange-600 border border-orange-200',
]

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-lg px-4 py-3 min-w-[140px]">
      <div className="h-0.5 w-full bg-gradient-to-r from-brand to-brand-light rounded-full mb-2.5" />
      <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
      <p className="text-base font-bold text-gray-900 tabular-nums">{fmt(Number(payload[0].value ?? 0))}</p>
    </div>
  )
}

function paymentStripe(method: string) {
  const m = method?.toLowerCase()
  if (m === 'cash')  return 'border-l-[3px] border-l-emerald-400'
  if (m === 'gcash') return 'border-l-[3px] border-l-blue-400'
  if (m === 'card')  return 'border-l-[3px] border-l-gray-300'
  return 'border-l-[3px] border-l-amber-400'
}

export function Dashboard() {
  const navigate = useNavigate()
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)

  const [salesData,  setSalesData]  = useState<SalesData | null>(null)
  const [yestData,   setYestData]   = useState<SalesData | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [lowStock,   setLowStock]   = useState<LowStockItem[]>([])
  const [loading,    setLoading]    = useState(true)

  const load = useCallback(async () => {
    try {
      const [sales, yest, txns, ls] = await Promise.all([
        apiSalesReport({ from: today     + 'T00:00:00', to: today     + 'T23:59:59' }) as Promise<SalesData>,
        apiSalesReport({ from: yesterday + 'T00:00:00', to: yesterday + 'T23:59:59' }) as Promise<SalesData>,
        apiGetTransactions({ limit: '5', sort: 'desc' }) as Promise<{ data: Transaction[] }>,
        apiGetLowStock() as Promise<LowStockItem[]>,
      ])
      setSalesData(sales)
      setYestData(yest)
      setTransactions(txns.data ?? [])
      setLowStock(Array.isArray(ls) ? ls.slice(0, 5) : [])
    } catch { /* silently fallback */ }
    finally   { setLoading(false) }
  }, [today, yesterday])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const u1 = subscribeTransactions(load)
    const u2 = subscribeStock(load)
    return () => { u1(); u2() }
  }, [load])

  const s  = salesData?.summary
  const sy = yestData?.summary

  // Weekly sparkline (last 7 entries in salesByPeriod)
  const sparkline = (salesData?.salesByPeriod ?? []).map((p) => Number(p.revenue))

  const chartData   = (salesData?.salesByPeriod ?? []).map((p) => ({
    day:     new Date(p.date).toLocaleDateString('en-PH', { weekday: 'short' }),
    Revenue: Number(p.revenue),
  }))
  const topProducts = salesData?.topProducts ?? []
  const maxRevenue  = Math.max(...topProducts.map((p) => Number(p.revenue)), 1)

  const revenueTrend = s && sy ? pct(Number(s.total_revenue),     Number(sy.total_revenue))     : undefined
  const txnTrend     = s && sy ? pct(Number(s.transaction_count), Number(sy.transaction_count)) : undefined
  const itemsTrend   = s && sy ? pct(Number(s.total_items_sold),  Number(sy.total_items_sold))  : undefined

  const paymentBadge = (m: string) => {
    const lm = m?.toLowerCase()
    if (lm === 'cash') return 'green'
    if (lm === 'gcash') return 'blue'
    if (lm === 'card') return 'gray'
    return 'yellow'
  }

  const stockBarColor = (item: LowStockItem) => {
    const p = item.stock / Math.max(1, item.reorder_point * 3)
    if (p < 0.2) return 'bg-red-500'
    if (p < 0.5) return 'bg-orange-400'
    return 'bg-yellow-400'
  }

  const stockBadge = (item: LowStockItem) => {
    if (item.stock <= 2) return <span className="badge-red text-[10px] py-0.5 px-1.5">Critical</span>
    const p = item.stock / Math.max(1, item.reorder_point * 3)
    if (p < 0.3) return <span className="badge-yellow text-[10px] py-0.5 px-1.5">Low</span>
    return null
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
          {/* ── Stat Cards — 2-col to give each card more breathing room ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <StatCard
              label="Today's Revenue"
              value={s ? fmt(Number(s.total_revenue)) : '—'}
              icon={DollarSign}
              accentColor="#C0392B"
              iconColor="text-brand"
              iconBg="bg-red-50"
              live
              trend={revenueTrend ?? undefined}
              subIcon={ShoppingCart}
              subValue={s ? String(s.transaction_count) : '—'}
              subLabel="Transactions"
              sparkline={sparkline.length >= 2 ? sparkline : undefined}
            />
            <StatCard
              label="Total Transactions"
              value={s ? String(s.transaction_count) : '—'}
              icon={ShoppingBag}
              accentColor="#2563EB"
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
              live
              trend={txnTrend ?? undefined}
              subIcon={DollarSign}
              subValue={s ? fmt(Number(s.avg_order_value)) : '—'}
              subLabel="Avg per order"
            />
            <StatCard
              label="Items Sold"
              value={s ? String(s.total_items_sold) : '—'}
              icon={Package}
              accentColor="#059669"
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
              trend={itemsTrend ?? undefined}
              subIcon={Package}
              subValue={String(topProducts.length)}
              subLabel="Products"
            />
            <StatCard
              label="Low Stock Alerts"
              value={String(lowStock.length)}
              icon={lowStock.length > 0 ? AlertTriangle : Users}
              accentColor={lowStock.length > 0 ? '#D97706' : '#7C3AED'}
              iconColor={lowStock.length > 0 ? 'text-amber-600' : 'text-violet-600'}
              iconBg={lowStock.length > 0 ? 'bg-amber-50' : 'bg-violet-50'}
              subIcon={Package}
              subValue={lowStock.length > 0 ? `${lowStock.length} items` : 'All clear'}
              subLabel={lowStock.length > 0 ? 'Need reorder' : 'Fully stocked'}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            {/* ── Sales Chart ─────────────────────────────────────────── */}
            <div className="card-elevated p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-sm font-bold text-gray-800">Sales This Week</p>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">Daily revenue overview</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-brand to-brand-light" />
                  <span className="text-xs text-gray-400 font-medium">Revenue</span>
                </div>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#C0392B" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#C0392B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 500 }} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 500 }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`} width={46} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#E5E7EB', strokeWidth: 1.5, strokeDasharray: '4 4' }} />
                    <Area type="monotone" dataKey="Revenue" stroke="#C0392B" strokeWidth={2.5} fill="url(#dashGrad)"
                      dot={{ r: 4, fill: '#C0392B', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6, fill: '#C0392B', stroke: '#fff', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[210px] flex flex-col items-center justify-center text-gray-300 gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-sm">No sales data yet</p>
                </div>
              )}
            </div>

            {/* ── Top Products ─────────────────────────────────────────── */}
            <div className="card p-5">
              <div className="mb-4">
                <p className="text-sm font-bold text-gray-800">Top Products Today</p>
                <p className="text-xs text-gray-400 font-medium mt-0.5">By revenue</p>
              </div>
              {topProducts.length === 0 ? (
                <p className="text-sm text-gray-300 text-center py-6">No sales today yet</p>
              ) : (
                <div className="space-y-4">
                  {topProducts.slice(0, 5).map((p, i) => (
                    <div key={p.product_name} className="flex items-start gap-2.5">
                      <span className={`text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${RANK_STYLES[i] ?? 'bg-gray-100 text-gray-500'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-700 truncate">{p.product_name}</p>
                          <span className="text-xs font-bold text-brand flex-shrink-0">{fmt(Number(p.revenue))}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 mb-1">{p.quantity_sold} sold</p>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-brand to-brand-light rounded-full transition-all"
                            style={{ width: `${(Number(p.revenue) / maxRevenue) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* ── Recent Transactions ──────────────────────────────────── */}
            <div className="card lg:col-span-2 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-800">Recent Transactions</p>
                <button onClick={() => navigate('/transactions')} className="text-xs text-brand hover:text-brand-dark font-semibold transition-colors">View all →</button>
              </div>
              {transactions.length === 0 ? (
                <div className="px-4 py-10 text-center text-gray-300 text-sm">No transactions today</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-gray-100">
                      <th className="px-5 py-2.5 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide">Receipt</th>
                      <th className="px-5 py-2.5 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide hidden sm:table-cell">Cashier</th>
                      <th className="px-5 py-2.5 text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide">Method</th>
                      <th className="px-5 py-2.5 text-right text-[11px] font-bold text-gray-400 uppercase tracking-wide">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className={`table-row cursor-pointer ${paymentStripe(t.payment_method)}`}
                        onClick={() => navigate(`/transactions/${t.id}`)}>
                        <td className="px-5 py-3">
                          <p className="text-sm font-semibold text-gray-700">{t.receipt_no}</p>
                          <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</p>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-500 hidden sm:table-cell">{t.staff_name}</td>
                        <td className="px-5 py-3">
                          <Badge variant={paymentBadge(t.payment_method) as 'green' | 'blue' | 'gray' | 'yellow'}>{t.payment_method}</Badge>
                        </td>
                        <td className="px-5 py-3 text-sm font-bold text-gray-800 text-right tabular-nums">{fmt(Number(t.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Low Stock Alerts ────────────────────────────────────── */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <p className="text-sm font-bold text-gray-800">Low Stock Alerts</p>
                <button onClick={() => navigate('/inventory/low-stock')} className="text-xs text-brand hover:text-brand-dark font-semibold transition-colors">View all →</button>
              </div>
              <div className="p-4 space-y-3.5">
                {lowStock.length === 0 ? (
                  <div className="py-6 text-center">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                      <Package className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-sm text-gray-400">All products well stocked</p>
                  </div>
                ) : (
                  lowStock.slice(0, 4).map((item) => (
                    <div key={item.product_name} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 border border-amber-100">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className="text-xs font-semibold text-gray-700 truncate">{item.product_name}</p>
                          {stockBadge(item)}
                        </div>
                        <p className="text-[10px] text-gray-400 mb-1.5">{item.stock} units · Reorder at {item.reorder_point}</p>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${stockBarColor(item)}`}
                            style={{ width: `${Math.min(100, (item.stock / Math.max(1, item.reorder_point * 3)) * 100)}%` }} />
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
