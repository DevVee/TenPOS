import { Clock, TrendingUp, ShoppingBag, DollarSign, LogOut, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatCard } from '../../components/ui/StatCard'
import { Badge } from '../../components/ui/Badge'
import { apiGetTransactions } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface Txn {
  id: string
  receipt_no: string
  status: string
  total: number
  created_at: string
}

export function ShiftSummary() {
  const { user, logout } = useAuthStore()
  const navigate         = useNavigate()

  const today = new Date().toISOString().slice(0, 10)

  const { data, loading } = useApiData<{ data: Txn[]; total: number }>(
    () => apiGetTransactions({
      from:  today + 'T00:00:00',
      to:    today + 'T23:59:59',
      limit: '200',
    }) as Promise<{ data: Txn[]; total: number }>
  )

  const txns      = data?.data ?? []
  const completed = txns.filter((t) => t.status === 'completed')
  const voided    = txns.filter((t) => t.status === 'voided')

  const totalSales = completed.reduce((s, t) => s + Number(t.total), 0)
  const avgValue   = completed.length > 0 ? totalSales / completed.length : 0

  const first = txns.at(-1)
  const last  = txns.at(0)
  const shiftMins = (first && last && first.id !== last.id)
    ? Math.round((new Date(last.created_at).getTime() - new Date(first.created_at).getTime()) / 60000)
    : 0
  const shiftHours = shiftMins > 0
    ? `${Math.floor(shiftMins / 60)}h ${shiftMins % 60}m`
    : '—'

  const handleEndShift = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="My Shift Summary"
        subtitle={`${user?.name} · ${new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}`}
        actions={
          <button onClick={handleEndShift} className="btn-secondary flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
            <LogOut className="w-4 h-4" /> End Shift
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Sales"    value={fmt(totalSales)}          icon={DollarSign}  iconColor="emerald" />
            <StatCard label="Transactions"   value={String(completed.length)} icon={ShoppingBag} iconColor="blue"    />
            <StatCard label="Avg. Value"     value={fmt(avgValue)}            icon={TrendingUp}  iconColor="violet"  />
            <StatCard label="Shift Duration" value={shiftHours}               icon={Clock}       iconColor="gray"    />
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            <div className="card p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Shift Summary</p>
              <div className="space-y-2">
                {[
                  ['Completed', completed.length],
                  ['Voided',    voided.length],
                  ['Total Txns', txns.length],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label as string}</span>
                    <span className={`font-medium ${label === 'Voided' && Number(val) > 0 ? 'text-brand' : 'text-gray-800'}`}>
                      {val as number}
                    </span>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-sm">
                  <span>Total Revenue</span>
                  <span className="text-brand">{fmt(totalSales)}</span>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Timeline</p>
              <div className="space-y-2">
                {[
                  ['First Sale', first ? new Date(first.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'],
                  ['Last Sale',  last  ? new Date(last.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'],
                  ['Duration',   shiftHours],
                  ['Date',       new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label as string}</span>
                    <span className="font-medium text-gray-800">{val as string}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Transaction list */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-800">Today's Transactions</p>
            </div>
            {txns.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No transactions yet today</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Receipt #</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Status</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Total</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="table-row">
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">{t.receipt_no}</td>
                      <td className="px-4 py-3">
                        <Badge variant={t.status === 'completed' ? 'green' : t.status === 'voided' ? 'red' : 'yellow'}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(Number(t.total))}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">
                        {new Date(t.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
