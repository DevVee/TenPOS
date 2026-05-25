import { useState, useMemo } from 'react'
import { TrendingUp, Loader2, CalendarRange, DollarSign, ShoppingBag } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { apiSalesReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { useAuthStore } from '../../store/authStore'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'

type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }
function fmtShort(n: number) { return n >= 1000 ? `₱${(n / 1000).toFixed(1)}k` : `₱${n.toFixed(0)}` }

interface SalesData {
  summary: { total_revenue: number; transaction_count: number; avg_order_value: number }
  salesByPeriod: { date: string; revenue: number; count: number }[]
  topProducts: { product_name: string; quantity_sold: number; revenue: number; category_name?: string }[]
  byPaymentMethod?: { method: string; total: number; count: number }[]
  hourlyHeatmap?: { hour: number; revenue: number; count: number }[]
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

function presetDates(p: Exclude<Period, 'custom'>): { from: string; to: string } {
  const today = isoDate(new Date())
  const daysBack = { today: 0, week: 7, month: 30, year: 365 }[p]
  if (daysBack === 0) return { from: today + 'T00:00:00', to: today + 'T23:59:59' }
  const from = isoDate(new Date(Date.now() - daysBack * 86400000))
  return { from: from + 'T00:00:00', to: today + 'T23:59:59' }
}

function periodLabel(period: Period, customFrom: string, customTo: string): string {
  if (period === 'custom') {
    const f = new Date(customFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    const t = new Date(customTo   + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${f} – ${t}`
  }
  return { today: 'Today', week: 'Last 7 days', month: 'Last 30 days', year: 'Last 365 days' }[period] ?? ''
}

const BRAND   = '#E5484D'
const PALETTE = ['#E5484D', '#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#06B6D4']

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-panel px-3 py-2.5 text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-semibold text-gray-900">{fmt(p.value)}</p>
      ))}
    </div>
  )
}

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today', week: '7d', month: '30d', year: '1y', custom: 'Custom',
}

export function SalesReport() {
  const { user } = useAuthStore()
  const [period, setPeriod]         = useState<Period>('week')
  const [customFrom, setCustomFrom] = useState(isoDate(new Date(Date.now() - 7 * 86400000)))
  const [customTo, setCustomTo]     = useState(isoDate(new Date()))
  const [category, setCategory]     = useState('All')

  const queryParams = useMemo(() => {
    const dates = period === 'custom'
      ? { from: customFrom + 'T00:00:00', to: customTo + 'T23:59:59' }
      : presetDates(period)
    return user?.branch_id ? { ...dates, branch_id: user.branch_id } : dates
  }, [period, customFrom, customTo, user?.branch_id])

  const { data, loading } = useApiData<SalesData>(
    () => apiSalesReport(queryParams) as Promise<SalesData>,
    [queryParams]
  )

  const summary      = data?.summary
  const totalRevenue = summary ? Number(summary.total_revenue) : 0
  const totalTxns    = summary ? Number(summary.transaction_count) : 0

  const dailyData = (data?.salesByPeriod ?? []).map((p) => ({
    date:    new Date(p.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    Revenue: Number(p.revenue),
    Orders:  Number(p.count),
  }))

  const hourlyData = (data?.hourlyHeatmap ?? []).map((h) => ({
    hour:    `${String(h.hour).padStart(2, '0')}:00`,
    Revenue: Number(h.revenue),
    Orders:  Number(h.count),
  }))

  const allProducts = data?.topProducts ?? []
  const categories = useMemo(
    () => ['All', ...[...new Set(allProducts.map((p) => p.category_name ?? 'Uncategorized').filter(Boolean))].sort()],
    [allProducts]
  )
  const topProducts = useMemo(
    () => category === 'All' ? allProducts : allProducts.filter((p) => (p.category_name ?? 'Uncategorized') === category),
    [allProducts, category]
  )

  const paymentData = (data?.byPaymentMethod ?? []).map((m) => ({
    name:  m.method.charAt(0).toUpperCase() + m.method.slice(1),
    value: Number(m.total),
    count: Number(m.count),
  }))

  return (
    <div>
      <PageHeader
        title="Sales Report"
        subtitle={`${periodLabel(period, customFrom, customTo)} · Revenue analysis`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Period tabs */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {(['today', 'week', 'month', 'year', 'custom'] as Period[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setPeriod(t)}
                  className={`h-7 px-3 rounded-md text-xs font-medium transition-all ${
                    t === period
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'custom' ? <CalendarRange className="w-3.5 h-3.5" /> : PERIOD_LABELS[t]}
                </button>
              ))}
            </div>

            {/* Custom date range */}
            {period === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date" value={customFrom} max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="input-base h-8 text-xs"
                />
                <span className="text-xs text-gray-400">–</span>
                <input
                  type="date" value={customTo} min={customFrom} max={isoDate(new Date())}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="input-base h-8 text-xs"
                />
              </div>
            )}

            {/* Category filter */}
            {categories.length > 2 && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="select-base h-8 text-xs"
              >
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            )}

          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* KPI strip — always 2 per row */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <StatCard label="Total Revenue"    value={fmt(totalRevenue)}  icon={DollarSign}  iconColor="emerald" />
            <StatCard label="Transactions"     value={String(totalTxns)}  icon={ShoppingBag} iconColor="blue"    />
            <StatCard
              label="Avg. Order Value"
              value={fmt(summary ? Number(summary.avg_order_value) : 0)}
              icon={TrendingUp}
              iconColor="violet"
            />
            <StatCard
              label="Top Product"
              value={allProducts[0]?.product_name?.split(' ').slice(0, 2).join(' ') ?? '—'}
              subLabel={allProducts[0] ? fmt(Number(allProducts[0].revenue)) : ''}
              icon={TrendingUp}
              iconColor="orange"
            />
          </div>

          {/* Revenue chart + Payment breakdown */}
          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <div className="card-elevated p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">Revenue by Day</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-brand" />
                  <span className="text-xs text-gray-400">Revenue</span>
                </div>
              </div>
              {dailyData.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No data for this period" compact />
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={dailyData} margin={{ top: 4, right: 2, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={BRAND} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={44} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#E5E7EB', strokeWidth: 1, strokeDasharray: '4 3' }} />
                    <Area type="monotone" dataKey="Revenue" stroke={BRAND} strokeWidth={2.5} fill="url(#salesGrad)"
                      dot={{ r: 3, fill: BRAND, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: BRAND, stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <p className="text-sm font-semibold text-gray-800 mb-4">Payment Methods</p>
              {paymentData.length === 0 ? (
                <EmptyState icon={DollarSign} title="No data" compact />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={paymentData} cx="50%" cy="50%" innerRadius={42} outerRadius={68}
                        paddingAngle={3} dataKey="value">
                        {paymentData.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {paymentData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                          <span className="text-xs text-gray-600">{d.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-gray-800 tabular-nums">{fmt(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Orders per day + Hourly */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <div className="card p-5">
              <p className="text-sm font-semibold text-gray-800 mb-4">Orders per Day</p>
              {dailyData.length === 0 ? (
                <EmptyState icon={ShoppingBag} title="No data" compact />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dailyData} margin={{ top: 4, right: 2, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip formatter={(v) => [Number(v ?? 0), 'Orders']} />
                    <Bar dataKey="Orders" fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-5">
              <p className="text-sm font-semibold text-gray-800 mb-4">Hourly Revenue</p>
              {hourlyData.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No hourly data" compact />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={hourlyData} margin={{ top: 4, right: 2, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={44} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="Revenue" stroke="#8B5CF6" strokeWidth={2.5} dot={false}
                      activeDot={{ r: 4, fill: '#8B5CF6', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top products table */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800">
                Top Products
                {category !== 'All' && <span className="ml-2 text-xs text-brand font-normal">· {category}</span>}
              </p>
              <span className="text-xs text-gray-400">{topProducts.length} products</span>
            </div>
            <table className="w-full">
              <thead className="table-head">
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className="hidden sm:table-cell">Category</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Revenue</th>
                  <th className="hidden md:table-cell">Share</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState icon={TrendingUp} title="No sales data" compact />
                    </td>
                  </tr>
                ) : (
                  topProducts.slice(0, 20).map((p, i) => {
                    const pct = totalRevenue > 0 ? ((Number(p.revenue) / totalRevenue) * 100).toFixed(1) : '0'
                    return (
                      <tr key={p.product_name} className="table-row">
                        <td>
                          <span className="text-xs font-medium text-gray-400 tabular-nums">{i + 1}</span>
                        </td>
                        <td>
                          <span className="text-sm font-medium text-gray-800">{p.product_name}</span>
                        </td>
                        <td className="hidden sm:table-cell">
                          <span className="text-sm text-gray-400">{p.category_name ?? '—'}</span>
                        </td>
                        <td className="text-right">
                          <span className="text-sm text-gray-600 tabular-nums">{p.quantity_sold}</span>
                        </td>
                        <td className="text-right">
                          <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(Number(p.revenue))}</span>
                        </td>
                        <td className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{pct}%</span>
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
