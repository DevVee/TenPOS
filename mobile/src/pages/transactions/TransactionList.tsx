import { useState, useEffect, useCallback } from 'react'
import { Search, Download, Loader2, ChevronLeft, ChevronRight, WifiOff, Calendar, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { apiGetTransactions } from '../../lib/api'
import { useAuthStore } from '../../store/authStore'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface Transaction {
  id: string
  receipt_no: string
  created_at: string
  staff_name: string
  items: unknown[]
  subtotal: number
  total: number
  payment_method: string
  status: string
  is_offline?: boolean
  synced?: boolean
}

const PAGE_SIZE = 20

function exportToCSV(transactions: Transaction[]) {
  const headers = ['Receipt #', 'Date', 'Cashier', 'Items', 'Payment', 'Total', 'Status']
  const rows = transactions.map((t) => [
    t.receipt_no,
    new Date(t.created_at).toLocaleString('en-PH'),
    t.staff_name,
    String((t.items as unknown[]).length),
    t.payment_method,
    String(Number(t.total).toFixed(2)),
    t.status,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function TransactionList() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage]               = useState(1)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  // Date range filter
  const today = new Date().toISOString().slice(0, 10)
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const hasDateFilter = dateFrom || dateTo

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        sort: 'desc',
      }
      if (statusFilter !== 'all') params.status = statusFilter
      if (search.trim())          params.search    = search.trim()
      if (dateFrom)               params.from      = dateFrom + 'T00:00:00'
      if (dateTo)                 params.to        = dateTo   + 'T23:59:59'
      if (user?.branch_id)        params.branch_id = user.branch_id

      const res = await apiGetTransactions(params) as { data: Transaction[]; total: number }
      setTransactions(res.data ?? [])
      setTotal(res.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page, dateFrom, dateTo, user?.branch_id])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const clearDates = () => { setDateFrom(''); setDateTo(''); setShowDateFilter(false); setPage(1) }

  const paymentBadge = (method: string): 'green' | 'blue' | 'gray' | 'yellow' => {
    const m = method?.toLowerCase()
    if (m === 'cash') return 'green'
    if (m === 'gcash') return 'blue'
    if (m === 'card') return 'gray'
    return 'yellow'
  }

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="All sales, voids, and returns"
        actions={
          <button
            onClick={() => exportToCSV(transactions)}
            disabled={transactions.length === 0}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      {/* Filters row */}
      <div className="flex flex-col gap-2.5 mb-4 md:mb-5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-base pl-9 w-full"
            placeholder="Search receipt # or cashier..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        {/* Status pills — horizontal scroll on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {['all', 'completed', 'voided', 'returned'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-brand text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {/* Date range button — sits on same row as status pills */}
        <button
          onClick={() => setShowDateFilter((v) => !v)}
          className={`flex-shrink-0 btn-secondary flex items-center gap-1.5 ml-auto ${hasDateFilter ? 'border-brand text-brand bg-brand/5' : ''}`}
        >
          <Calendar className="w-4 h-4" />
          <span className="hidden sm:inline">{hasDateFilter ? `${dateFrom || '…'} → ${dateTo || '…'}` : 'Date Range'}</span>
          <span className="sm:hidden">{hasDateFilter ? `${dateFrom || '…'}` : 'Date'}</span>
          {hasDateFilter && (
            <span
              onClick={(e) => { e.stopPropagation(); clearDates() }}
              className="ml-1 text-gray-400 hover:text-red-500"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </button>
      </div>

      {/* Date range picker */}
      {showDateFilter && (
        <div className="card p-4 mb-3 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">From</label>
            <input
              type="date"
              max={dateTo || today}
              className="input-base w-44"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">To</label>
            <input
              type="date"
              min={dateFrom}
              max={today}
              className="input-base w-44"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex gap-2">
            {/* Quick presets */}
            {[
              { label: 'Today',     fn: () => { setDateFrom(today); setDateTo(today) } },
              { label: 'This week', fn: () => { const d = new Date(); d.setDate(d.getDate() - 6); setDateFrom(d.toISOString().slice(0, 10)); setDateTo(today) } },
              { label: 'This month',fn: () => { const d = new Date(); d.setDate(1); setDateFrom(d.toISOString().slice(0, 10)); setDateTo(today) } },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => { p.fn(); setPage(1) }}
                className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
              >
                {p.label}
              </button>
            ))}
            <button onClick={clearDates} className="px-3 py-2 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="card p-4 mb-4 text-sm text-red-600 bg-red-50 border-red-100">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Receipt #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">Cashier</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">Items</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">No transactions found</td>
                    </tr>
                  ) : (
                    transactions.map((t) => (
                      <tr
                        key={t.id}
                        className="table-row cursor-pointer"
                        onClick={() => navigate(`/transactions/${t.id}`)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-700">{t.receipt_no}</p>
                          {t.is_offline && !t.synced && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 mt-0.5">
                              <WifiOff className="w-2.5 h-2.5" /> Pending sync
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-700">{new Date(t.created_at).toLocaleDateString('en-PH')}</p>
                          <p className="text-xs text-gray-400">{new Date(t.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{t.staff_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{(t.items as unknown[]).length}</td>
                        <td className="px-4 py-3">
                          <Badge variant={paymentBadge(t.payment_method)}>{t.payment_method}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={t.status === 'completed' ? 'green' : t.status === 'voided' ? 'red' : 'yellow'}>{t.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-800 text-right">{fmt(Number(t.total))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>Showing {transactions.length} of {total} transactions</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
