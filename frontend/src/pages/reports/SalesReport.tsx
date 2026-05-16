import { useState } from 'react'
import { Download, TrendingUp, Loader2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { DollarSign, ShoppingBag } from 'lucide-react'
import { apiSalesReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

type Period = 'today' | 'week' | 'month' | 'year'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface SalesData {
  summary: { total_revenue: string; transaction_count: number; avg_order_value: string }
  salesByPeriod: { date: string; revenue: string; count: number }[]
  topProducts: { product_name: string; quantity_sold: number; revenue: string; category_name: string }[]
  byPaymentMethod: { method: string; total: string; count: number }[]
  hourlyHeatmap: { hour: number; revenue: string; count: number }[]
}

function periodDates(p: Period): Record<string, string> {
  const today = new Date().toISOString().slice(0, 10)
  const daysBack = { today: 0, week: 7, month: 30, year: 365 }[p]
  if (daysBack === 0) return { from: today + 'T00:00:00', to: today + 'T23:59:59' }
  const from = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10)
  return { from: from + 'T00:00:00', to: today + 'T23:59:59' }
}

export function SalesReport() {
  const [period, setPeriod] = useState<Period>('week')

  const { data, loading } = useApiData<SalesData>(
    () => apiSalesReport(periodDates(period)) as Promise<SalesData>,
    [period]
  )

  const summary = data?.summary
  const dailyData = (data?.salesByPeriod ?? []).map((p) => ({
    date: new Date(p.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    sales: Number(p.revenue),
    txns: Number(p.count),
  }))
  const hourlyData = (data?.hourlyHeatmap ?? []).map((h) => ({
    hour: `${h.hour}:00`,
    sales: Number(h.revenue),
  }))
  const topProducts = data?.topProducts ?? []
  const totalRevenue = summary ? Number(summary.total_revenue) : 0
  const totalTxns    = summary ? Number(summary.transaction_count) : 0

  return (
    <div>
      <PageHeader
        title="Sales Report"
        subtitle="Revenue analysis and trends"
        actions={
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {(['today', 'week', 'month', 'year'] as Period[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setPeriod(t)}
                  className={`px-3 py-2 font-medium capitalize transition-colors ${t === period ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >{t}</button>
              ))}
            </div>
            <button className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> Export</button>
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
            <StatCard label="Total Revenue" value={fmt(totalRevenue)} icon={DollarSign} />
            <StatCard label="Transactions" value={String(totalTxns)} icon={ShoppingBag} iconColor="text-blue-600" iconBg="bg-blue-50" />
            <StatCard
              label="Avg. Order Value"
              value={fmt(summary ? Number(summary.avg_order_value) : 0)}
              icon={TrendingUp}
              iconColor="text-green-600"
              iconBg="bg-green-50"
            />
            <StatCard
              label="Top Category"
              value={topProducts[0]?.category_name ?? '—'}
              sub={topProducts[0] ? fmt(Number(topProducts[0].revenue)) : ''}
              icon={TrendingUp}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <div className="card p-4">
              <p className="text-sm font-semibold text-gray-800 mb-4">Revenue by Day</p>
              {dailyData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-gray-300 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: unknown) => [fmt(v as number), 'Revenue']} contentStyle={{ border: '1px solid #f0f0f0', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="sales" fill="#C0392B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card p-4">
              <p className="text-sm font-semibold text-gray-800 mb-4">Hourly Sales</p>
              {hourlyData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-gray-300 text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: unknown) => [fmt(v as number), 'Sales']} contentStyle={{ border: '1px solid #f0f0f0', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="sales" fill="#E74C3C" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-800">Top Products</p>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Product</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Units Sold</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Revenue</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 w-36">Share</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-300">No sales data</td></tr>
                ) : (
                  topProducts.slice(0, 10).map((p) => {
                    const pct = totalRevenue > 0 ? ((Number(p.revenue) / totalRevenue) * 100).toFixed(1) : '0'
                    return (
                      <tr key={p.product_name} className="table-row">
                        <td className="px-4 py-3 text-sm font-medium text-gray-700">{p.product_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 text-right">{p.quantity_sold}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(Number(p.revenue))}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
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
