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
  transaction: { icon: ShoppingCart, label: 'Transaction',   dot: 'bg-brand',      badge: 'bg-brand/10 text-brand'   },
  cache:       { icon: Database,     label: 'Cache Refresh', dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-600' },
  failed:      { icon: XCircle,      label: 'Failed',        dot: 'bg-red-400',    badge: 'bg-red-50 text-red-600'   },
  info:        { icon: RefreshCw,    label: 'Info',          dot: 'bg-gray-300',   badge: 'bg-gray-50 text-gray-500' },
}

export function SyncLog() {
  const [log, setLog]         = useState<SyncLogEntry[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter]   = useState<SyncLogEntry['type'] | 'all'>('all')

  const reload = useCallback(() => setLog(getSyncLog()), [])

  useEffect(() => { reload() }, [reload])

  const handleRefreshCache = async () => {
    setRefreshing(true)
    await Promise.all([refreshProductCache(), refreshInventoryCache()])
    reload()
    setRefreshing(false)
  }

  const handleClear = () => { clearSyncLog(); setLog([]) }

  const displayed = filter === 'all' ? log : log.filter(e => e.type === filter)

  const totalTx    = log.filter(e => e.type === 'transaction').length
  const totalCache = log.filter(e => e.type === 'cache').length
  const totalFail  = log.filter(e => e.type === 'failed').length
  const lastEntry  = log[0]

  return (
    <div>
      <PageHeader
        title="Sync Log"
        subtitle="History of transactions and cache refreshes"
        actions={
          <div className="flex items-center" style={{ gap: '8px' }}>
            <button
              onClick={handleRefreshCache}
              disabled={refreshing}
              className="btn-secondary text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing…' : 'Refresh Cache'}</span>
            </button>
            {log.length > 0 && (
              <button onClick={handleClear} className="btn-secondary text-sm text-red-500 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
                <span>Clear</span>
              </button>
            )}
          </div>
        }
      />
      <div className="space-y-5">

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card px-4 py-4">
          <p className="text-xs text-gray-400 mb-1">Transactions</p>
          <p className="text-3xl font-black text-gray-700">{totalTx}</p>
        </div>
        <div className="card px-4 py-4">
          <p className="text-xs text-gray-400 mb-1">Cache Refreshes</p>
          <p className="text-3xl font-black text-gray-700">{totalCache}</p>
        </div>
        <div className="card px-4 py-4">
          <p className="text-xs text-gray-400 mb-1">Failed</p>
          <p className={`text-3xl font-black ${totalFail > 0 ? 'text-red-500' : 'text-gray-300'}`}>{totalFail}</p>
        </div>
        <div className="card px-4 py-4">
          <p className="text-xs text-gray-400 mb-1">Last Event</p>
          <p className="text-sm font-bold text-gray-700 mt-1">
            {lastEntry ? timeAgo(lastEntry.timestamp) : '—'}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {(['all', 'transaction', 'cache', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              filter === f
                ? 'bg-brand text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? `All (${log.length})` : f === 'transaction' ? `Transactions (${totalTx})` : f === 'cache' ? `Cache (${totalCache})` : `Failed (${totalFail})`}
          </button>
        ))}
      </div>

      {/* Log */}
      <div className="card divide-y divide-gray-50">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <WifiOff className="w-8 h-8 text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-400">
              {log.length === 0 ? 'No sync events yet' : 'No events match this filter'}
            </p>
            <p className="text-xs text-gray-300 mt-1">
              {log.length === 0 ? 'Events appear here as transactions are processed.' : 'Try selecting a different filter.'}
            </p>
          </div>
        ) : (
          displayed.map(entry => {
            const cfg = TYPE_CONFIG[entry.type]
            const Icon = cfg.icon
            return (
              <div key={entry.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                      <span className="text-sm font-medium text-gray-700">{entry.detail}</span>
                      {entry.count !== undefined && (
                        <span className="text-xs text-gray-400">· {entry.count} {entry.type === 'transaction' ? 'item' : 'record'}{entry.count !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtTime(entry.timestamp)}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400 font-medium flex-shrink-0 ml-4">{timeAgo(entry.timestamp)}</span>
              </div>
            )
          })
        )}
      </div>
      </div>
    </div>
  )
}
