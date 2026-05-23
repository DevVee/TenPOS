import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, Download, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { apiGetTransactions } from '../../lib/api'
import { subscribeTransactions } from '../../lib/realtime'
import { downloadXLSX } from '../../lib/xlsxExport'
import { useActiveBranch } from '../../hooks/useActiveBranch'

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
}

const PAGE_SIZE = 20

export function TransactionList() {
  const navigate = useNavigate()
  const activeBranch = useActiveBranch()
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage]                 = useState(1)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  // Date range filter
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [dateFrom, setDateFrom]             = useState('')
  const [dateTo, setDateTo]                 = useState('')

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
      if (search.trim()) params.search = search.trim()
      if (dateFrom) params.from = dateFrom + 'T00:00:00'
      if (dateTo)   params.to   = dateTo   + 'T23:59:59'
      if (activeBranch) params.branch_id = activeBranch

      const res = await apiGetTransactions(params) as { data: Transaction[]; total: number }
      setTransactions(res.data ?? [])
      setTotal(res.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, page, dateFrom, dateTo, activeBranch])

  useEffect(() => { load() }, [load])

  // Live updates: refresh when a new transaction is created/updated
  useEffect(() => {
    const unsub = subscribeTransactions(() => { load() })
    return unsub
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const paymentBadge = (method: string): 'green' | 'blue' | 'gray' | 'yellow' => {
    const m = method?.toLowerCase()
    if (m === 'cash') return 'green'
    if (m === 'gcash') return 'blue'
    if (m === 'card') return 'gray'
    return 'yellow'
  }

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10)
    downloadXLSX(
      `TenPOS-Transactions-${today}`,
      [{
        name: 'Transactions',
        periodLabel: dateFrom || dateTo ? `${dateFrom || '…'} → ${dateTo || today}` : 'All dates',
        columns: [
          { header: 'Receipt #',      width: 16 },
          { header: 'Date',           type: 'date',   width: 14 },
          { header: 'Time',           width: 10 },
          { header: 'Cashier',        width: 22 },
          { header: 'Items',          type: 'number', width: 8  },
          { header: 'Payment Method', width: 18 },
          { header: 'Status',         width: 12 },
          { header: 'Total',          type: 'money',  width: 16 },
        ],
        rows: transactions.map((t) => [
          t.receipt_no,
          new Date(t.created_at).toLocaleDateString('en-PH'),
          new Date(t.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          t.staff_name,
          (t.items as unknown[]).length,
          t.payment_method,
          t.status,
          Number(t.total),
        ]),
        totalsRow: [
          `${transactions.length} transactions`, '', '', '',
          transactions.reduce((s, t) => s + (t.items as unknown[]).length, 0),
          '', '',
          transactions.reduce((s, t) => s + Number(t.total), 0),
        ],
      }],
      'Transaction List'
    )
  }

  const clearDateFilter = () => {
    setDateFrom(''); setDateTo(''); setPage(1)
  }

  return (
    <div>
      {/* ─── Print-only report header ─────────────────────────────────────── */}
      <div className="print-only print-report-header">
        <h1>Transaction List</h1>
        <p>
          {dateFrom || dateTo
            ? `Period: ${dateFrom || '…'} → ${dateTo || '…'}`
            : `Generated: ${new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}`
          }
        </p>
        {statusFilter !== 'all' && <p>Status: {statusFilter}</p>}
      </div>

      <PageHeader
        title="Transactions"
        subtitle="All sales, voids, and returns"
        actions={
          <button onClick={handleExport} className="no-print btn-secondary flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
        }
      />

      <div className="no-print flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-base pl-9"
            placeholder="Search receipt # or cashier..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex gap-1.5">
          {['all', 'completed', 'voided', 'returned'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-brand text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowDateFilter((v) => !v)}
          className={`btn-secondary flex items-center gap-1.5 ${showDateFilter ? 'bg-brand-pale border-brand/30 text-brand' : ''}`}
        >
          <Filter className="w-4 h-4" />
          {dateFrom || dateTo ? `${dateFrom || '…'} → ${dateTo || '…'}` : 'Date Range'}
          {(dateFrom || dateTo) && (
            <span onClick={(e) => { e.stopPropagation(); clearDateFilter() }} className="ml-1 hover:text-brand">
              <X className="w-3 h-3" />
            </span>
          )}
        </button>
      </div>

      {/* Date range row */}
      {showDateFilter && (
        <div className="no-print flex flex-wrap items-center gap-3 mb-4 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 w-8">From</label>
            <input
              type="date"
              className="input-base py-1.5 text-sm"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 w-4">To</label>
            <input
              type="date"
              className="input-base py-1.5 text-sm"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={clearDateFilter} className="text-xs text-gray-400 hover:text-brand underline">
              Clear
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="table-head">
                  <tr>
                    <th>Receipt #</th>
                    <th>Date &amp; Time</th>
                    <th className="hidden md:table-cell">Cashier</th>
                    <th className="hidden sm:table-cell">Items</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
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
                        <td className="px-4 py-3 text-sm font-medium text-gray-700">{t.receipt_no}</td>
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
            <div className="no-print px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
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
