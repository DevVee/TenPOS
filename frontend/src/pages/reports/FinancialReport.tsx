import { useState } from 'react'
import { Download, Printer, Loader2 } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { apiFinancialReport } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface ZReport {
  gross_sales: string
  net_sales: string
  total_discount: string
  total_tax: string
  transaction_count: number
  completed_count: number
  voided_count: number
  return_count: number
  avg_order_value: string
}
interface PaymentBreakdown { method: string; total: string; count: number }
interface VatSummary { vatable_sales: string; vat_amount: string; vat_exempt: string; total: string }
interface FinancialData { zReport: ZReport; paymentBreakdown: PaymentBreakdown[]; vatSummary: VatSummary }

export function FinancialReport() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)

  const { data, loading } = useApiData<FinancialData>(
    () => apiFinancialReport({
      from: date + 'T00:00:00',
      to:   date + 'T23:59:59',
    }) as Promise<FinancialData>,
    [date]
  )

  const zr       = data?.zReport
  const payments = data?.paymentBreakdown ?? []
  const vat      = data?.vatSummary
  const gross    = zr ? Number(zr.gross_sales) : 0
  const totalPayments = payments.reduce((s, p) => s + Number(p.total), 0)

  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div>
      <PageHeader
        title="Financial Report / Z-Report"
        subtitle={`End-of-day reconciliation · ${dateLabel}`}
        actions={
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-base text-sm py-2"
            />
            <button className="btn-secondary flex items-center gap-1.5"><Printer className="w-4 h-4" /> Print Z-Report</button>
            <button className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> Export PDF</button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
        </div>
      ) : (
        <>
          {/* Z-Report card */}
          <div className="card p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-gray-900">Daily Z-Report</p>
                <p className="text-xs text-gray-400 mt-0.5">Ten Foundation Philippines Inc. · Main Branch</p>
              </div>
              <Badge variant="green">Reconciled</Badge>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Sales Summary</p>
                <div className="space-y-2">
                  {[
                    ['Gross Sales',       fmt(gross)],
                    ['Total Discounts',   zr ? `-${fmt(Number(zr.total_discount))}` : '—'],
                    ['Net Sales',         zr ? fmt(Number(zr.net_sales)) : '—'],
                    ['VAT Collected',     vat ? fmt(Number(vat.vat_amount)) : '—'],
                    ['Avg. Order Value',  zr ? fmt(Number(zr.avg_order_value)) : '—'],
                  ].map(([l, v]) => (
                    <div key={l as string} className="flex justify-between text-sm">
                      <span className="text-gray-500">{l}</span>
                      <span className="font-medium text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Transaction Count</p>
                <div className="space-y-2">
                  {[
                    ['Total Transactions', zr ? String(zr.transaction_count) : '—'],
                    ['Completed',          zr ? String(zr.completed_count)   : '—'],
                    ['Voided',             zr ? String(zr.voided_count)      : '—'],
                    ['Returns / Refunds',  zr ? String(zr.return_count)      : '—'],
                  ].map(([l, v]) => (
                    <div key={l as string} className="flex justify-between text-sm">
                      <span className="text-gray-500">{l}</span>
                      <span className="font-medium text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* VAT Summary */}
          {vat && (
            <div className="card p-5 mb-4">
              <p className="text-sm font-semibold text-gray-800 mb-4">VAT Summary (12%)</p>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Vatable Sales</p>
                  <p className="text-xl font-semibold text-gray-900">{fmt(Number(vat.vatable_sales))}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">VAT Amount</p>
                  <p className="text-xl font-semibold text-green-600">{fmt(Number(vat.vat_amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Total (incl. VAT)</p>
                  <p className="text-xl font-semibold text-gray-900">{fmt(Number(vat.total))}</p>
                </div>
              </div>
            </div>
          )}

          {/* Payment method breakdown */}
          <div className="card p-5">
            <p className="text-sm font-semibold text-gray-800 mb-4">Payment Method Breakdown</p>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-4">No transactions for this date</p>
            ) : (
              <div className="space-y-3">
                {payments.map((p) => {
                  const pct   = totalPayments > 0 ? ((Number(p.total) / totalPayments) * 100).toFixed(1) : '0'
                  const color = p.method === 'cash' ? 'bg-green-500' : p.method === 'gcash' ? 'bg-blue-500' : p.method === 'card' ? 'bg-gray-400' : 'bg-yellow-500'
                  return (
                    <div key={p.method} className="flex items-center gap-4">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700 capitalize">{p.method}</span>
                          <span className="font-semibold text-gray-800">{fmt(Number(p.total))}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-16 text-right">{pct}% · {p.count} txns</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
