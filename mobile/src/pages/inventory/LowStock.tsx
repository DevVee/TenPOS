import { useState, useEffect } from 'react'
import { AlertTriangle, Download, ShoppingCart, Loader2, Package } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import { apiGetLowStock } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useApiData } from '../../hooks/useApiData'
import { downloadXLSX } from '../../lib/xlsxExport'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface LowStockItem {
  product_id: string; product_name: string; sku: string
  category_name: string; stock: number; reorder_point: number; cost: number
}

export function LowStock() {
  const [tick, setTick] = useState(0)
  const { data, loading, error } = useApiData<LowStockItem[]>(
    () => apiGetLowStock() as Promise<LowStockItem[]>, [tick],
  )

  useEffect(() => {
    const channel = supabase
      .channel('low-stock-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stock_levels' }, () => setTick((t) => t + 1))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_levels' }, () => setTick((t) => t + 1))
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  const items = data ?? []
  const REORDER_QTY = 15
  const totalReorderCost = items.reduce((s, p) => s + Number(p.cost) * REORDER_QTY, 0)

  // Sort: critical first (stock ≤ 2), then low
  const sorted = [...items].sort((a, b) => Number(a.stock) - Number(b.stock))

  const handleExport = () => {
    downloadXLSX(
      `TenPOS-Reorder-List-${new Date().toISOString().slice(0, 10)}`,
      [{
        name: 'Reorder List',
        columns: [
          { header: 'Product',          width: 32 },
          { header: 'SKU',              width: 16 },
          { header: 'Category',         width: 20 },
          { header: 'Current Stock',    type: 'number', width: 14 },
          { header: 'Reorder Point',    type: 'number', width: 14 },
          { header: 'Suggested Order',  type: 'number', width: 16 },
          { header: 'Unit Cost',        type: 'money',  width: 14 },
          { header: 'Est. Reorder Cost',type: 'money',  width: 18 },
        ],
        rows: items.map((p) => [
          p.product_name, p.sku, p.category_name,
          Number(p.stock), Number(p.reorder_point), REORDER_QTY,
          Number(p.cost), Number(p.cost) * REORDER_QTY,
        ]),
        totalsRow: [
          `${items.length} items to reorder`, '', '', '', '',
          items.length * REORDER_QTY, '',
          items.reduce((s, p) => s + Number(p.cost) * REORDER_QTY, 0),
        ],
      }],
      'Reorder List'
    )
  }

  return (
    <div>
      <PageHeader
        title="Low Stock Alerts"
        subtitle={
          loading
            ? 'Loading…'
            : items.length > 0
              ? `${items.length} products need reordering · Est. reorder cost ${fmt(totalReorderCost)}`
              : 'All products are well stocked'
        }
        actions={
          <button onClick={handleExport} className="btn-secondary">
            <Download className="w-3.5 h-3.5" /> Export Reorder List
          </button>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Package}
            title="All products are well stocked"
            description="No reorders needed right now. Check back later."
          />
        </div>
      ) : (
        <>
          {/* Alert banner */}
          <div className="flex items-start gap-3 px-4 py-3.5 mb-5 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {items.length} {items.length === 1 ? 'product is' : 'products are'} at or below reorder point
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Estimated reorder cost: <strong>{fmt(totalReorderCost)}</strong> ({REORDER_QTY} units each)
              </p>
            </div>
          </div>

          {/* Table view */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="table-head">
                <tr>
                  <th>Product</th>
                  <th className="hidden sm:table-cell">Category</th>
                  <th>Stock</th>
                  <th className="hidden md:table-cell">Progress</th>
                  <th className="hidden lg:table-cell text-right">Est. Cost</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const isCritical = Number(p.stock) <= 2
                  const pct = Math.min(100, (Number(p.stock) / Math.max(1, Number(p.reorder_point) * 2.5)) * 100)
                  return (
                    <tr key={p.product_id} className="table-row">
                      <td>
                        <p className="text-sm font-medium text-gray-800">{p.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{p.sku}</p>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="text-sm text-gray-500">{p.category_name}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold tabular-nums ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>
                            {p.stock}
                          </span>
                          <Badge variant={isCritical ? 'red' : 'yellow'}>
                            {isCritical ? 'Critical' : 'Low'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">Reorder at {p.reorder_point}</p>
                      </td>
                      <td className="hidden md:table-cell">
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isCritical ? 'bg-red-500' : 'bg-amber-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="hidden lg:table-cell text-right">
                        <span className="text-sm text-gray-500 tabular-nums">
                          {fmt(Number(p.cost) * REORDER_QTY)}
                        </span>
                        <p className="text-xs text-gray-400">for {REORDER_QTY} units</p>
                      </td>
                      <td className="text-right">
                        <button
                          disabled
                          title="Purchase orders — coming soon"
                          className="btn-secondary btn-sm"
                        >
                          <ShoppingCart className="w-3 h-3" /> PO
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
