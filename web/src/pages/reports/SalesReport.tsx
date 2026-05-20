import { useState } from 'react'
import { Download, TrendingUp, Loader2 } from 'lucide-react'
import { downloadCSV } from '../../lib/csvExport'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { DollarSign, ShoppingBag } from 'lucide-react'
import { apiSalesReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'

type Period = 'today' | 'week' | 'month' | 'year'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }
function fmtShort(n: number) { return n >= 1000 ? `₱${(n / 1000).toFixed(1)}k` : `₱${n.toFixed(0)}` }

interface SalesData {
  summary: { total_revenue: number; transaction_count: number; avg_order_value: number }
  salesByPeriod: { date: string; revenue: number; count: number }[]
  topProducts: { product_name: string; quantity_sold: number; revenue: number; category_name?: string }[]
  byPaymentMethod?: { method: string; total: number; count: number }[]
  hourlyHeatmap?: { hour: number; revenue: number; count: number }[]
}

function periodDates(p: Period): Record<string, string> {
  const today = new Date().toISOString().slice(0, 10)
  const daysBack = { today: 0, week: 7, month: 30, year: 365 }[p]
  if (daysBack === 0) return { from: today + 'T00:00:00', to: today + 'T23:59:59' }
  const from = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10)
  return { from: from + 'T00:00:00', to: today + 'T23:59:59' }
}

const BRAND   = '#C0392B'
const PALETTE = ['#C0392B', '#E67E22', '#2980B9', '#27AE60', '#8E44AD', '#16A085']

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-600 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-bold" style={{ color: BRAND }}>{fmt(p.value)}</p>
      ))}
    </div>
  )
}

export function SalesReport() {
  const [period, setPeriod] = useState<Period>('week')

  const { data, loading } = useApiData<SalesData>(
    () => apiSalesReport(periodDates(period)) as Promise<SalesData>,
    [period]
  )

  const summary     = data?.summary
  const totalRevenue = summary ? Number(summary.total_revenue) : 0
  const totalTxns   = summary ? Number(summary.transaction_count) : 0

  const dailyData = (data?.salesByPeriod ?? []).map((p) => ({
    date: new Date(p.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    Revenue: Number(p.revenue),
    Orders: Number(p.count),
  }))

  const hourlyData = (data?.hourlyHeatmap ?? []).map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    Revenue: Number(h.revenue),
    Orders: Number(h.count),
  }))

  const topProducts = data?.topProducts ?? []

  const paymentData = (data?.byPaymentMethod ?? []).map((m) => ({
    name: m.method.charAt(0).toUpperCase() + m.method.slice(1),
    value: Number(m.total),
    count: Number(m.count),
  }))

  const handleExport = () => {
    downloadCSV(
      `sales-report-${period}-${new Date().toISOString().slice(0, 10)}`,
      ['Product', 'Category', 'Units Sold', 'Revenue'],
      topProducts.map((p) => [p.product_name, p.category_name ?? '', p.quantity_sold, p.revenue])
    )
  }

  return (
    <div>
      <PageHeader
        title="Sales Report"
        subtitle="Revenue analysis and trends"
        actions={
          <div className="flex gap-2">
            <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
              {(['today', 'week', 'month', 'year'] as Period[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setPeriod(t)}
                  className={`px-3 py-2 font-bold capitalize transition-colors ${t === period ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >{t}</button>
              ))}
            </div>
            <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> Export</button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Total Revenue"   value={fmt(totalRevenue)}  icon={DollarSign} />
            <StatCard label="Transactions"    value={String(totalTxns)}  icon={ShoppingBag} iconColor="text-blue-600" iconBg="bg-blue-50" />
            <StatCard label="Avg. Order Value" value={fmt(summary ? Number(summary.avg_order_value) : 0)} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
            <StatCard
              label="Top Product"
              value={topProducts[0]?.product_name?.split(' ').slice(0, 2).join(' ') ?? '—'}
              sub={topProducts[0] ? fmt(Number(topProducts[0].revenue)) : ''}
              icon={TrendingUp}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
            />
          </div>

          {/* Revenue over time + Payment pie */}
          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <div className="card p-4 lg:col-span-2">
              <p className="text-sm font-bold text-gray-800 mb-4">Revenue by Day</p>
              {dailyData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-gray-300 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={BRAND} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="Revenue" stroke={BRAND} strokeWidth={2.5} fill="url(#revenueGrad)" dot={{ r: 3, fill: BRAND, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-4">
              <p className="text-sm font-bold text-gray-800 mb-4">Payment Methods</p>
              {paymentData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-gray-300 text-sm">No data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={paymentData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3} dataKey="value">
                        {paymentData.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {paymentData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                          <span className="text-gray-600 font-medium">{d.name}</span>
                        </div>
                        <span className="font-bold text-gray-800">{fmt(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Orders per day bar + Hourly heatmap */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <div className="card p-4">
              <p className="text-sm font-bold text-gray-800 mb-4">Orders per Day</p>
              {dailyData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={dailyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip formatter={(v) => [Number(v ?? 0), 'Orders']} />
                    <Bar dataKey="Orders" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-4">
              <p className="text-sm font-bold text-gray-800 mb-4">Hourly Revenue</p>
              {hourlyData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={hourlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={48} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="Revenue" stroke="#8B5CF6" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#8B5CF6' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top products table */}
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-800">Top Products</p>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Product</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Units</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Revenue</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 w-36">Share</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-300">No sales data</td></tr>
                ) : (
                  topProducts.slice(0, 10).map((p, i) => {
                    const pct = totalRevenue > 0 ? ((Number(p.revenue) / totalRevenue) * 100).toFixed(1) : '0'
                    return (
                      <tr key={p.product_name} className="table-row">
                        <td className="px-4 py-3 text-xs font-bold text-gray-300">{i + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-700">{p.product_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 text-right">{p.quantity_sold}</td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-800 text-right">{fmt(Number(p.revenue))}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
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
