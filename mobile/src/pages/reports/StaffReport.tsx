import { useState, useMemo } from 'react'
import { Loader2, CalendarRange } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Users, TrendingUp, ShoppingBag } from 'lucide-react'
import { apiStaffReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

type Period = 'today' | 'week' | 'month' | 'custom'

interface StaffPerf {
  staff_id: string; name: string; role: string
  transaction_count: number; revenue: number; items_sold: number
}
interface StaffData { staffPerformance: StaffPerf[] }

function presetDates(p: Exclude<Period, 'custom'>): Record<string, string> {
  const today = isoDate(new Date())
  const daysBack = { today: 0, week: 7, month: 30 }[p]
  if (daysBack === 0) return { from: today + 'T00:00:00', to: today + 'T23:59:59' }
  const from = isoDate(new Date(Date.now() - daysBack * 86400000))
  return { from: from + 'T00:00:00', to: today + 'T23:59:59' }
}


export function StaffReport() {
  const [period,      setPeriod]      = useState<Period>('week')
  const [customFrom,  setCustomFrom]  = useState(isoDate(new Date(Date.now() - 7 * 86400000)))
  const [customTo,    setCustomTo]    = useState(isoDate(new Date()))
  const [cashierFilter, setCashierFilter] = useState('All')

  const queryDates = useMemo(() => {
    if (period === 'custom') return { from: customFrom + 'T00:00:00', to: customTo + 'T23:59:59' }
    return presetDates(period)
  }, [period, customFrom, customTo])

  const { data, loading } = useApiData<StaffData>(
    () => apiStaffReport(queryDates) as Promise<StaffData>,
    [queryDates]
  )

  const allStaff = data?.staffPerformance ?? []

  const cashiers = useMemo(
    () => ['All', ...allStaff.map((s) => s.name).sort()],
    [allStaff]
  )

  const staff = useMemo(
    () => cashierFilter === 'All' ? allStaff : allStaff.filter((s) => s.name === cashierFilter),
    [allStaff, cashierFilter]
  )

  const totalTxns    = staff.reduce((s, m) => s + Number(m.transaction_count), 0)
  const totalRevenue = staff.reduce((s, m) => s + Number(m.revenue), 0)
  const best         = [...staff].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0]

  const barData = staff.map((s) => ({
    name:         s.name.split(' ')[0],
    Revenue:      s.revenue,
    Transactions: s.transaction_count,
  }))

  return (
    <div>
      <PageHeader
        title="Staff Performance"
        subtitle="Sales performance per cashier"
      />

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center mb-5" style={{ gap: '8px' }}>
        {/* Cashier filter — left */}
        {cashiers.length > 2 && (
          <select value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)} className="input-base py-1.5 text-xs">
            {cashiers.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}

        <div className="flex-1" />

        {/* Custom date range */}
        {period === 'custom' && (
          <div className="flex items-center space-x-1.5 text-xs">
            <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="input-base py-1.5 text-xs" />
            <span className="text-gray-400">to</span>
            <input type="date" value={customTo} min={customFrom} max={isoDate(new Date())} onChange={(e) => setCustomTo(e.target.value)} className="input-base py-1.5 text-xs" />
          </div>
        )}

        {/* Period tabs — right */}
        <div className="flex border border-gray-200 overflow-hidden text-xs">
          {(['today', 'week', 'month', 'custom'] as Period[]).map((t) => (
            <button
              key={t}
              onClick={() => setPeriod(t)}
              className={`px-3 py-2 font-bold capitalize transition-colors ${t === period ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {t === 'custom' ? <CalendarRange className="w-3.5 h-3.5 inline -mt-0.5" /> : t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
        </div>
      ) : (
        <>
          {/* KPI strip — 2 per row always */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <StatCard label="Active Cashiers"    value={String(staff.length)} icon={Users}      iconColor="blue"    />
            <StatCard label="Total Transactions" value={String(totalTxns)}   icon={ShoppingBag} iconColor="violet"  />
            <StatCard label="Total Revenue"      value={fmt(totalRevenue)}   icon={TrendingUp}  iconColor="emerald" />
            <StatCard
              label="Best Performer"
              value={best?.name?.split(' ')[0] ?? '—'}
              subLabel={best ? fmt(best.revenue) : ''}
              icon={TrendingUp}
              iconColor="orange"
            />
          </div>

          {barData.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4 mb-4">
              <div className="card p-4">
                <p className="text-sm font-bold text-gray-800 mb-4">Revenue by Cashier</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `₱${(v/1000).toFixed(0)}k` : `₱${v}`} width={44} />
                    <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="Revenue" fill="#E5484D" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-4">
                <p className="text-sm font-bold text-gray-800 mb-4">Transactions per Cashier</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
              <p className="text-sm font-semibold text-gray-800">
                Detailed Breakdown
                {cashierFilter !== 'All' && <span className="ml-2 text-xs text-brand font-medium">· {cashierFilter}</span>}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Cashier</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Txns</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Revenue</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Avg Value</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400 hidden md:table-cell">Items</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-300">No data for this period</td></tr>
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
                              <div>
                                <span className="text-sm font-medium text-gray-700">{s.name}</span>
                                <span className="ml-2 text-xs text-gray-400 capitalize">{s.role}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">{s.transaction_count}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(s.revenue)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-right">{fmt(avg)}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 text-right hidden md:table-cell">{s.items_sold}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
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
          </div>
        </>
      )}
    </div>
  )
}
