import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ShoppingCart, Database, XCircle, WifiOff, Trash2 } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { getSyncLog, clearSyncLog, refreshProductCache, refreshInventoryCache } from '../../lib/sync'
import type { SyncLogEntry } from '../../lib/sync'

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const TYPE_CONFIG: Record<SyncLogEntry['type'], { icon: React.ElementType; label: string; dot: string; badge: string }> = {
  transaction: { icon: ShoppingCart, label: 'Transaction',   dot: 'bg-brand',    badge: 'bg-brand/10 text-brand' },
  cache:       { icon: Database,     label: 'Cache Refresh', dot: 'bg-blue-400', badge: 'bg-blue-50 text-blue-600' },
  failed:      { icon: XCircle,      label: 'Failed',        dot: 'bg-red-400',  badge: 'bg-red-50 text-red-600' },
}

export function SyncLog() {
  const [log, setLog]               = useState<SyncLogEntry[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter]         = useState<SyncLogEntry['type'] | 'all'>('all')

  const reload = useCallback(() => setLog(getSyncLog()), [])

  useEffect(() => { reload() }, [reload])

  const handleRefreshCache = async () => {
    setRefreshing(true)
    await Promise.all([refreshProductCache(), refreshInventoryCache()])
    reload()
    setRefreshing(false)
  }

  const handleClear = () => { clearSyncLog(); setLog([]) }

  const displayed = filter === 'all' ? log : log.filter((e) => e.type === filter)

  const totalTx    = log.filter((e) => e.type === 'transaction').length
  const totalCache = log.filter((e) => e.type === 'cache').length
  const totalFail  = log.filter((e) => e.type === 'failed').length
  const lastEntry  = log[0]

  return (
    <div>
      <PageHeader
        title="Sync Log"
        subtitle="History of transactions and cache refreshes"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshCache}
              disabled={refreshing}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh Cache'}
            </button>
            {log.length > 0 && (
              <button onClick={handleClear} className="btn-secondary flex items-center gap-2 text-red-500 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
                Clear Log
              </button>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="card px-5 py-4">
          <p className="text-xs text-gray-400 mb-1 font-medium">Transactions</p>
          <p className="text-3xl font-black text-gray-800">{totalTx}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-xs text-gray-400 mb-1 font-medium">Cache Refreshes</p>
          <p className="text-3xl font-black text-gray-800">{totalCache}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-xs text-gray-400 mb-1 font-medium">Failed</p>
          <p className={`text-3xl font-black ${totalFail > 0 ? 'text-red-500' : 'text-gray-300'}`}>{totalFail}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-xs text-gray-400 mb-1 font-medium">Last Event</p>
          <p className="text-lg font-bold text-gray-700 mt-0.5">
            {lastEntry ? timeAgo(lastEntry.timestamp) : '—'}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(['all', 'transaction', 'cache', 'failed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              filter === f
                ? 'bg-brand text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {f === 'all'         ? `All (${log.length})`
            : f === 'transaction' ? `Transactions (${totalTx})`
            : f === 'cache'       ? `Cache (${totalCache})`
            :                       `Failed (${totalFail})`}
          </button>
        ))}
      </div>

      {/* Log table */}
      <div className="card overflow-hidden">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <WifiOff className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-400">
              {log.length === 0 ? 'No sync events yet' : 'No events match this filter'}
            </p>
            <p className="text-xs text-gray-300 mt-1">
              {log.length === 0
                ? 'Events appear here as transactions are processed.'
                : 'Try selecting a different filter.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayed.map((entry) => {
              const cfg  = TYPE_CONFIG[entry.type]
              const Icon = cfg.icon
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <span className="text-sm font-medium text-gray-700 truncate">{entry.detail}</span>
                        {entry.count !== undefined && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            · {entry.count} {entry.type === 'transaction' ? 'item' : 'record'}{entry.count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtTime(entry.timestamp)}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 font-medium flex-shrink-0 ml-4 hidden sm:block">
                    {timeAgo(entry.timestamp)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
