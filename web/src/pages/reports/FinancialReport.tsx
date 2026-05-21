import { useState } from 'react'
import { Download, Printer, Loader2, TrendingUp, TrendingDown, DollarSign, ShoppingBag } from 'lucide-react'
import { downloadXLSX } from '../../lib/xlsxExport'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { apiFinancialReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

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
  const today = isoDate(new Date())
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo,   setDateTo]   = useState(today)

  const { data, loading } = useApiData<FinancialData>(
    () => apiFinancialReport({
      from: dateFrom + 'T00:00:00',
      to:   dateTo   + 'T23:59:59',
    }) as unknown as Promise<FinancialData>,
    [dateFrom, dateTo]
  )

  const payments      = Object.entries(data?.paymentBreakdown ?? {}).map(([method, total]) => ({ method, total }))
  const totalPayments = payments.reduce((s, p) => s + p.total, 0)

  const isSingleDay = dateFrom === dateTo
  const periodLabel = isSingleDay
    ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : `${new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(dateTo + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const COLOR: Record<string, string> = {
    cash: 'bg-green-500', gcash: 'bg-blue-500', card: 'bg-gray-400', paymaya: 'bg-purple-500',
  }
  const PIE_COLOR: Record<string, string> = {
    cash: '#27AE60', gcash: '#2980B9', card: '#6B7280', paymaya: '#8E44AD',
  }

  const handlePrint = () => window.print()

  const handleExport = () => {
    const d = data

    downloadXLSX(
      `TenPOS-Financial-${dateFrom}${isSingleDay ? '' : `-to-${dateTo}`}`,
      [
        // Sheet 1: P&L Summary
        {
          name: 'P&L Summary',
          periodLabel,
          columns: [
            { header: 'Line Item',    width: 28 },
            { header: 'Amount (₱)',   type: 'money', width: 22 },
            { header: 'Notes',        width: 30 },
          ],
          rows: [
            ['Revenue',           d?.revenue ?? 0,       'Total sales (completed transactions)'],
            ['Cost of Goods',     -(d?.cogs ?? 0),       'Cost price × units sold'],
            ['Gross Profit',      d?.gross_profit ?? 0,  'Revenue − COGS'],
            ['Gross Margin %',    Number(d?.gross_margin ?? 0), ''],
            ['Stock Value',       d?.stock_value ?? 0,   'Current inventory at cost'],
            ['Transactions',      d?.transaction_count ?? 0, 'Number of completed sales'],
          ],
          totalsRow: ['NET PROFIT (Gross)', d?.gross_profit ?? 0, ''],
        },

        // Sheet 2: Payment Breakdown
        {
          name: 'Payment Methods',
          periodLabel,
          columns: [
            { header: 'Payment Method', width: 22 },
            { header: 'Amount (₱)',     type: 'money',   width: 18 },
            { header: '% of Total',     type: 'percent', width: 14 },
          ],
          rows: payments.map((p) => [
            p.method.charAt(0).toUpperCase() + p.method.slice(1),
            p.total,
            totalPayments > 0 ? p.total / totalPayments : 0,
          ]),
          totalsRow: [
            'TOTAL',
            totalPayments,
            1,
          ],
        },
      ],
      'Financial Report'
    )
  }

  return (
    <div>
      <PageHeader
        title="Financial Report"
        subtitle={`P&L and payment breakdown · ${periodLabel}`}
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            {/* Date range */}
            <div className="flex items-center gap-1.5 text-xs">
              <label className="text-gray-400 text-xs font-medium">From</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-base text-sm py-2"
              />
              <label className="text-gray-400 text-xs font-medium">To</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-base text-sm py-2"
              />
            </div>

            {/* Quick presets */}
            <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
              {([
                { label: 'Today',  from: today, to: today },
                { label: 'Week',   from: isoDate(new Date(Date.now() - 7  * 86400000)), to: today },
                { label: 'Month',  from: isoDate(new Date(Date.now() - 30 * 86400000)), to: today },
              ]).map((p) => (
                <button
                  key={p.label}
                  onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
                  className={`px-3 py-2 font-bold transition-colors ${
                    dateFrom === p.from && dateTo === p.to
                      ? 'bg-brand text-white'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >{p.label}</button>
              ))}
            </div>

            <button onClick={handlePrint}  className="btn-secondary flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print</button>
            <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> Export Excel</button>
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
            <StatCard label="Revenue"      value={fmt(data?.revenue ?? 0)}      icon={DollarSign} />
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
              <p className="text-sm text-gray-300 text-center py-4">No transactions for this period</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={payments.map((p) => ({ name: p.method, value: p.total }))}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
                    >
                      {payments.map((p) => (
                        <Cell key={p.method} fill={PIE_COLOR[p.method] ?? '#E5E7EB'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'Revenue']} />
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
