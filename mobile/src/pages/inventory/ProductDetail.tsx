import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Edit, Trash2, TrendingDown, Loader2, Tag } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { apiGetProduct, apiDeleteProduct, apiGetAdjustments } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

function fmt(n: number) { return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` }

interface Variant { id: string; label: string; value: string; price_adjustment: number }
interface Product {
  id: string; sku: string; barcode: string | null; name: string
  description?: string | null; category_name?: string | null
  price: number; cost: number | null; active: boolean
  stock: number; reorder_point: number
  image_url?: string
  variants: Variant[]
  // Extended optional fields
  brand?:        string
  material?:     string
  color?:        string
  weight_grams?: number
  length_cm?:    number
  width_cm?:     number
  height_cm?:    number
  tags?:         string[]
  notes?:        string
}

interface Adjustment {
  id: string; type: string; quantity: number; reason: string
  created_at: string; branch_id: string
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-700 text-right">{value}</span>
    </div>
  )
}

export function ProductDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data: product, loading, error } = useApiData<Product>(
    () => apiGetProduct(id!) as Promise<Product>,
    [id]
  )

  const { data: adjData } = useApiData<{ data: Adjustment[] }>(
    () => apiGetAdjustments({ product_id: id!, limit: '20' }) as Promise<{ data: Adjustment[] }>,
    [id]
  )
  const movements = adjData?.data ?? []

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiDeleteProduct(id!)
      navigate('/inventory')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div>
        <button onClick={() => navigate('/inventory')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Inventory
        </button>
        <div className="card p-6 text-center text-red-500">{error || 'Product not found'}</div>
      </div>
    )
  }

  const totalStock = product.stock
  const margin = product.cost != null && product.price > 0
    ? ((product.price - product.cost) / product.price * 100).toFixed(1)
    : null

  // Build dimension + weight string
  const hasDims = product.length_cm || product.width_cm || product.height_cm
  const dimStr = hasDims
    ? [product.length_cm, product.width_cm, product.height_cm].map((v) => v ?? '—').join(' × ') + ' cm'
    : null
  const weightStr = product.weight_grams ? `${product.weight_grams} g` : null

  // Check if any extended info is filled
  const hasExtended = !!(
    product.brand || product.material || product.color ||
    dimStr || weightStr || (product.tags?.length) || product.notes
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{product.name}</h1>
            <p className="text-sm text-gray-400 font-mono">{product.sku}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/inventory/edit/${id}`)} className="btn-secondary flex items-center gap-1.5">
            <Edit className="w-4 h-4" /> Edit
          </button>
          <button
            onClick={() => setDeleteModal(true)}
            className="btn-secondary flex items-center gap-1.5 text-red-500 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {/* Image banner (if present) */}
      {product.image_url && (
        <div className="card mb-4 overflow-hidden">
          <div className="flex items-start gap-5 p-4">
            <img
              src={product.image_url}
              alt={product.name}
              className="w-32 h-32 rounded-xl object-cover flex-shrink-0 border border-gray-100"
            />
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-base font-bold text-gray-900 mb-1">{product.name}</p>
              {product.description && (
                <p className="text-sm text-gray-500 leading-relaxed line-clamp-4">{product.description}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <Badge variant={product.active ? 'green' : 'gray'}>{product.active ? 'Active' : 'Inactive'}</Badge>
                {product.category_name && <Badge variant="gray">{product.category_name}</Badge>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Product Details</p>
          <div className="space-y-2">
            <InfoRow label="SKU"      value={product.sku} />
            <InfoRow label="Barcode"  value={product.barcode ?? '—'} />
            <InfoRow label="Category" value={product.category_name ?? '—'} />
            {!product.image_url && product.description && (
              <div className="flex justify-between gap-3">
                <span className="text-sm text-gray-500 flex-shrink-0">Description</span>
                <span className="text-sm font-medium text-gray-700 text-right">{product.description}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-sm text-gray-500">Status</span>
              <Badge variant={product.active ? 'green' : 'gray'}>{product.active ? 'Active' : 'Inactive'}</Badge>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Pricing & Stock</p>
          <div className="space-y-2">
            {[
              ['Cost Price',    product.cost != null ? fmt(product.cost) : '—'],
              ['Selling Price', fmt(product.price)],
              ['Gross Margin',  margin ? `${margin}%` : '—'],
              ['Total Stock',   `${totalStock} units`],
              ['Reorder Point', `${product.reorder_point} units`],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between gap-3">
                <span className="text-sm text-gray-500">{l}</span>
                <span className={`text-sm font-medium ${l === 'Gross Margin' ? 'text-green-600' : l === 'Total Stock' && product.stock <= product.reorder_point ? 'text-brand' : 'text-gray-700'}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Extended info card — only when something is filled */}
      {hasExtended && (
        <div className="card p-4 mb-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Additional Info</p>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
            <InfoRow label="Brand"    value={product.brand} />
            <InfoRow label="Material" value={product.material} />
            <InfoRow label="Color"    value={product.color} />
            {dimStr && <InfoRow label="Dimensions" value={dimStr} />}
            {weightStr && <InfoRow label="Weight" value={weightStr} />}
          </div>

          {product.tags && product.tags.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                {product.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {product.notes && (
            <div className="mt-3 pt-3 border-t border-gray-50">
              <p className="text-xs font-medium text-gray-400 mb-1">Internal Notes</p>
              <p className="text-sm text-gray-600 leading-relaxed">{product.notes}</p>
            </div>
          )}
        </div>
      )}

      {product.variants.length > 0 && (
        <div className="card p-4 mb-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Variants</p>
          <div className="space-y-2">
            {product.variants.map((v) => (
              <div key={v.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <Badge variant="gray">{v.label}: {v.value}</Badge>
                <span className="text-sm text-gray-600">
                  {v.price_adjustment !== 0
                    ? `${fmt(product.price + v.price_adjustment)} (${v.price_adjustment > 0 ? '+' : ''}${fmt(v.price_adjustment)})`
                    : fmt(product.price)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <TrendingDown className="w-4 h-4 text-gray-400" />
          <p className="text-sm font-semibold text-gray-800">Stock Movement History</p>
        </div>
        {movements.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No stock movements yet</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400">Type</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-400">Change</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">Reason</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-400 hidden md:table-cell">Branch</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="table-row">
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(m.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={
                      m.type === 'in' || m.type === 'return' ? 'green' :
                      m.type === 'out' || m.type === 'damage' ? 'red' : 'yellow'
                    }>
                      {m.type}
                    </Badge>
                  </td>
                  <td className={`px-4 py-3 text-sm font-semibold text-right ${m.type === 'in' || m.type === 'return' ? 'text-green-600' : 'text-brand'}`}>
                    {m.type === 'in' || m.type === 'return' ? '+' : '-'}{m.quantity}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">{m.reason}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">{m.branch_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Deactivate Product">
        <p className="text-sm text-gray-600 mb-5">
          This will deactivate <strong>{product.name}</strong> and remove it from the POS. Existing transactions are unaffected.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setDeleteModal(false)} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Deactivate
          </button>
        </div>
      </Modal>
    </div>
  )
}
