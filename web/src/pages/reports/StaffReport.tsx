import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { downloadCSV } from '../../lib/csvExport'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Users, TrendingUp, ShoppingBag } from 'lucide-react'
import { apiStaffReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

type Period = 'today' | 'week' | 'month'

interface StaffPerf {
  staff_id: string; name: string; role: string
  transaction_count: number; revenue: number; items_sold: number
}
interface StaffData { staffPerformance: StaffPerf[] }

function periodDates(p: Period): Record<string, string> {
  const today = new Date().toISOString().slice(0, 10)
  const daysBack = { today: 0, week: 7, month: 30 }[p]
  if (daysBack === 0) return { from: today + 'T00:00:00', to: today + 'T23:59:59' }
  const from = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10)
  return { from: from + 'T00:00:00', to: today + 'T23:59:59' }
}

export function StaffReport() {
  const [period, setPeriod] = useState<Period>('week')

  const { data, loading } = useApiData<StaffData>(
    () => apiStaffReport(periodDates(period)) as Promise<StaffData>,
    [period]
  )

  const staff = data?.staffPerformance ?? []
  const totalTxns    = staff.reduce((s, m) => s + m.transaction_count, 0)
  const totalRevenue = staff.reduce((s, m) => s + m.revenue, 0)
  const best         = staff[0]

  const barData = staff.map((s) => ({
    name:    s.name.split(' ')[0],
    revenue: s.revenue,
    txns:    s.transaction_count,
  }))

  const handleExport = () => {
    downloadCSV(
      `staff-report-${period}-${new Date().toISOString().slice(0, 10)}`,
      ['Staff', 'Role', 'Transactions', 'Items Sold', 'Revenue'],
      staff.map((s) => [s.name, s.role, s.transaction_count, s.items_sold, s.revenue])
    )
  }

  return (
    <div>
      <PageHeader
        title="Staff Performance"
        subtitle="Sales performance per cashier"
        actions={
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {(['today', 'week', 'month'] as Period[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setPeriod(t)}
                  className={`px-3 py-2 font-medium capitalize transition-colors ${t === period ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'}`}
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
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <StatCard label="Active Cashiers" value={String(staff.length)} icon={Users} />
            <StatCard label="Total Transactions" value={String(totalTxns)} icon={ShoppingBag} iconColor="text-blue-600" iconBg="bg-blue-50" />
            <StatCard
              label="Best Performer"
              value={best?.name ?? '—'}
              sub={best ? fmt(best.revenue) : ''}
              icon={TrendingUp}
              iconColor="text-green-600"
              iconBg="bg-green-50"
            />
          </div>

          {barData.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4 mb-4">
              <div className="card p-4">
                <p className="text-sm font-bold text-gray-800 mb-4">Revenue by Cashier</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData.map((d) => ({ ...d, Revenue: d.revenue }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `₱${(v/1000).toFixed(0)}k` : `₱${v}`} width={44} />
                    <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="Revenue" fill="#C0392B" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-4">
                <p className="text-sm font-bold text-gray-800 mb-4">Transactions per Cashier</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData.map((d) => ({ ...d, Transactions: d.txns }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip formatter={(v) => [Number(v ?? 0), 'Transactions']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="Transactions" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-800">Detailed Breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Cashier</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Txns</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Revenue</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Avg Value</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Voids</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Returns</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-300">No data for this period</td></tr>
                  ) : (
                    staff.map((s) => {
                      const pct = totalRevenue > 0 ? ((s.revenue / totalRevenue) * 100).toFixed(1) : '0'
                      const avg = s.transaction_count > 0 ? s.revenue / s.transaction_count : 0
                      return (
                        <tr key={s.staff_id} className="table-row">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-brand-pale flex items-center justify-center">
                                <span className="text-xs font-semibold text-brand">
                                  {s.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-gray-700">{s.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">{s.transaction_count}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(s.revenue)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">{fmt(avg)}</td>
                          <td className="px-4 py-3 text-sm text-right"><span className="text-gray-400">—</span></td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right">—</td>
                          <td className="px-4 py-3 text-xs text-gray-400 text-right">{pct}%</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
