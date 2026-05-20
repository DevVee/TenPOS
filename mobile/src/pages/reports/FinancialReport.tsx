import { useState } from 'react'
import { Download, Printer, Loader2, TrendingUp, TrendingDown, DollarSign, ShoppingBag } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { apiFinancialReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface FinancialData {
  revenue: number
  cogs: number
  gross_profit: number
  gross_margin: string
  stock_value: number
  transaction_count: number
  paymentBreakdown: Record<string, number>
}

export function FinancialReport() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)

  const { data, loading } = useApiData<FinancialData>(
    () => apiFinancialReport({
      from: date + 'T00:00:00',
      to:   date + 'T23:59:59',
    }) as unknown as Promise<FinancialData>,
    [date]
  )

  const payments = Object.entries(data?.paymentBreakdown ?? {}).map(([method, total]) => ({ method, total }))
  const totalPayments = payments.reduce((s, p) => s + p.total, 0)

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const COLOR: Record<string, string> = {
    cash: 'bg-green-500', gcash: 'bg-blue-500', card: 'bg-gray-400', paymaya: 'bg-purple-500',
  }
  const PIE_COLOR: Record<string, string> = {
    cash: '#27AE60', gcash: '#2980B9', card: '#6B7280', paymaya: '#8E44AD',
  }

  return (
    <div>
      <PageHeader
        title="Financial Report"
        subtitle={`Daily P&L and payment breakdown · ${dateLabel}`}
        actions={
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-base text-sm py-2"
            />
            <button className="btn-secondary flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print</button>
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
            <StatCard label="Revenue" value={fmt(data?.revenue ?? 0)} icon={DollarSign} />
            <StatCard label="Gross Profit" value={fmt(data?.gross_profit ?? 0)} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
            <StatCard label="Gross Margin" value={`${data?.gross_margin ?? '0'}%`} icon={TrendingUp} iconColor="text-blue-600" iconBg="bg-blue-50" />
            <StatCard label="Transactions" value={String(data?.transaction_count ?? 0)} icon={ShoppingBag} iconColor="text-purple-600" iconBg="bg-purple-50" />
          </div>

          {/* P&L Summary */}
          <div className="card p-5 mb-4">
            <p className="text-sm font-semibold text-gray-800 mb-4">Profit & Loss Summary</p>
            <div className="space-y-3">
              {[
                { label: 'Revenue',       value: data?.revenue ?? 0,       color: 'text-gray-800', icon: TrendingUp },
                { label: 'Cost of Goods', value: -(data?.cogs ?? 0),       color: 'text-red-500',  icon: TrendingDown },
                { label: 'Gross Profit',  value: data?.gross_profit ?? 0,  color: 'text-green-600', icon: TrendingUp },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-500">{label}</span>
                  <span className={`text-sm font-semibold ${color}`}>
                    {value < 0 ? `-${fmt(Math.abs(value))}` : fmt(value)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-medium text-gray-600">Gross Margin</span>
                <span className="text-sm font-semibold text-blue-600">{data?.gross_margin ?? '0'}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Stock Value (at cost)</span>
                <span className="text-sm font-semibold text-gray-700">{fmt(data?.stock_value ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Payment method breakdown */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-800 mb-4">Payment Method Breakdown</p>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-4">No transactions for this date</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={payments.map((p) => ({ name: p.method, value: p.total }))} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {payments.map((p) => (
                        <Cell key={p.method} fill={PIE_COLOR[p.method] ?? '#E5E7EB'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmt(v), 'Revenue']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-4 flex flex-col justify-center">
                  {payments.map((p) => {
                    const pct   = totalPayments > 0 ? ((p.total / totalPayments) * 100).toFixed(1) : '0'
                    const color = COLOR[p.method] ?? 'bg-yellow-500'
                    return (
                      <div key={p.method} className="flex items-center gap-4">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} />
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="font-medium text-gray-700 capitalize">{p.method}</span>
                            <span className="font-semibold text-gray-800">{fmt(p.total)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
