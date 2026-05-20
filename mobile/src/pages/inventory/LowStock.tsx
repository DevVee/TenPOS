import { AlertTriangle, Download, ShoppingCart, Loader2 } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { apiGetLowStock } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface LowStockItem {
  product_id: string
  product_name: string
  sku: string
  category_name: string
  stock: number
  reorder_point: number
  cost: number
}

export function LowStock() {
  const { data, loading, error } = useApiData<LowStockItem[]>(
    () => apiGetLowStock() as Promise<LowStockItem[]>
  )

  const items = data ?? []
  const REORDER_QTY = 15
  const totalReorderCost = items.reduce((s, p) => s + Number(p.cost) * REORDER_QTY, 0)

  return (
    <div>
      <PageHeader
        title="Low Stock Alerts"
        subtitle={loading ? 'Loading...' : `${items.length} products need reordering · Estimated cost ${fmt(totalReorderCost)}`}
        actions={
          <button className="btn-secondary flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export Reorder List
          </button>
        }
      />

      {error && (
        <div className="card p-4 mb-4 text-sm text-red-600 bg-red-50 border-red-100">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
        </div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-400 text-sm">All products are well stocked. No reorders needed.</p>
        </div>
      ) : (
        <>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">{items.length} products are at or below reorder point</p>
              <p className="text-xs text-yellow-600 mt-0.5">Review and place orders to avoid stock-outs. Estimated reorder cost: <strong>{fmt(totalReorderCost)}</strong></p>
            </div>
          </div>

          <div className="space-y-3">
            {items.map((p) => {
              const stockPercent = Math.min(100, (Number(p.stock) / (Number(p.reorder_point) * 3)) * 100)
              return (
                <div key={p.product_id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{p.product_name}</p>
                        <p className="text-xs text-gray-400">{p.sku} · {p.category_name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-yellow-600">{p.stock}</p>
                        <p className="text-xs text-gray-400">units left</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${stockPercent}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">Reorder at {p.reorder_point}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0 text-right">
                    <p className="text-xs text-gray-500">Suggested order: <strong>{REORDER_QTY} units</strong></p>
                    <p className="text-xs text-gray-400">Est. cost: {fmt(Number(p.cost) * REORDER_QTY)}</p>
                    <button className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
                      <ShoppingCart className="w-3.5 h-3.5" /> Create PO
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
