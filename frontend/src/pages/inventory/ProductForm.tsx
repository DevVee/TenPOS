import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Plus, Trash2, ImagePlus, X, Loader2 } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { apiGetProduct, apiCreateProduct, apiUpdateProduct, apiGetCategories } from '../../lib/api'

interface Category { id: string; name: string }
interface Variant { label: string; value: string; priceAdj: string }

export function ProductForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isEdit = id !== undefined && id !== 'new'

  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', category_id: '', cost: '', price: '',
    description: '', imageUrl: '',
  })
  const [variants, setVariants] = useState<Variant[]>([])
  const [imagePreview, setImagePreview] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoadingData(true)
      try {
        const cats = await apiGetCategories() as Category[]
        setCategories(cats)

        if (isEdit && id) {
          const product = await apiGetProduct(id) as {
            name: string; sku: string; barcode: string | null; category_id: string | null
            cost: number | null; price: number; description: string | null; image_url: string | null
            variants: { label: string; value: string; price_adjustment: number }[]
          }
          setForm({
            name:        product.name,
            sku:         product.sku,
            barcode:     product.barcode ?? '',
            category_id: product.category_id ?? '',
            cost:        product.cost != null ? String(product.cost) : '',
            price:       String(product.price),
            description: product.description ?? '',
            imageUrl:    product.image_url ?? '',
          })
          setImagePreview(product.image_url ?? '')
          setVariants(product.variants.map((v) => ({
            label:    v.label,
            value:    v.value,
            priceAdj: String(v.price_adjustment),
          })))
        }
      } catch {}
      setLoadingData(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: '' }))
  }

  const addVariant = () => setVariants((v) => [...v, { label: 'Size', value: '', priceAdj: '0' }])
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i))

  const margin = form.cost && form.price
    ? (((parseFloat(form.price) - parseFloat(form.cost)) / parseFloat(form.price)) * 100).toFixed(1)
    : null

  const handleImageUrl = (url: string) => {
    set('imageUrl', url)
    setImagePreview(url)
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.sku.trim())  errs.sku  = 'SKU is required'
    if (!form.price)       errs.price = 'Selling price is required'
    else if (isNaN(parseFloat(form.price)) || parseFloat(form.price) <= 0) errs.price = 'Enter a valid price'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    setSaveError('')
    try {
      const payload: Record<string, unknown> = {
        name:        form.name.trim(),
        sku:         form.sku.trim(),
        barcode:     form.barcode.trim() || undefined,
        category_id: form.category_id || undefined,
        price:       parseFloat(form.price),
        cost:        form.cost ? parseFloat(form.cost) : undefined,
        description: form.description.trim() || undefined,
        image_url:   form.imageUrl.trim() || undefined,
        variants:    variants
          .filter((v) => v.value.trim())
          .map((v) => ({
            label:            v.label,
            value:            v.value.trim(),
            price_adjustment: parseFloat(v.priceAdj) || 0,
          })),
      }

      if (isEdit && id) {
        await apiUpdateProduct(id, payload)
        navigate(`/inventory/${id}`)
      } else {
        await apiCreateProduct(payload)
        navigate('/inventory')
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title={isEdit ? 'Edit Product' : 'Add New Product'}
        subtitle="Fill in product details and inventory"
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(isEdit ? `/inventory/${id}` : '/inventory')} className="btn-secondary flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Save Changes' : 'Save Product'}
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        {/* Product image */}
        <div className="card p-5">
          <p className="section-label mb-4">Product Image</p>
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-dashed border-gray-200">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" onError={() => setImagePreview('')} />
              ) : (
                <ImagePlus className="w-8 h-8 text-gray-300" />
              )}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Image URL</label>
              <div className="flex gap-2">
                <input
                  className="input-base flex-1"
                  placeholder="https://example.com/image.jpg"
                  value={form.imageUrl}
                  onChange={(e) => handleImageUrl(e.target.value)}
                />
                {form.imageUrl && (
                  <button onClick={() => handleImageUrl('')} className="p-2 text-gray-400 hover:text-brand transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Paste a public image URL. Shown in POS product grid.</p>
            </div>
          </div>
        </div>

        {/* Basic info */}
        <div className="card p-5">
          <p className="section-label mb-4">Product Information</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Product Name <span className="text-brand">*</span></label>
              <input
                className={`input-base ${errors.name ? 'border-red-400' : ''}`}
                placeholder="e.g. Tote Bag Classic"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">SKU <span className="text-brand">*</span></label>
              <input
                className={`input-base font-mono ${errors.sku ? 'border-red-400' : ''}`}
                placeholder="e.g. TBC-001"
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
              />
              {errors.sku && <p className="text-xs text-red-500 mt-1">{errors.sku}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Barcode <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input className="input-base font-mono" placeholder="Scan or enter barcode" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
              <select className="input-base" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                <option value="">Select category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input className="input-base" placeholder="Short product description" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="card p-5">
          <p className="section-label mb-4">Pricing</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Cost Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                <input type="number" className="input-base pl-7" placeholder="0.00" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Selling Price <span className="text-brand">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                <input
                  type="number"
                  className={`input-base pl-7 ${errors.price ? 'border-red-400' : ''}`}
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                />
              </div>
              {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Gross Margin</label>
              <div className={`input-base flex items-center ${margin ? (parseFloat(margin) > 30 ? 'text-green-600' : 'text-yellow-600') : 'text-gray-400'}`}>
                {margin ? `${margin}%` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Variants */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-label">Product Variants</p>
              <p className="text-xs text-gray-400 mt-0.5">Optional: add size, color, or material options</p>
            </div>
            <button onClick={addVariant} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Variant
            </button>
          </div>
          {variants.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No variants yet. Click "Add Variant" to create options like Small/Large.</p>
          ) : (
            <div className="space-y-2.5">
              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                  <select
                    value={v.label}
                    onChange={(e) => setVariants((vs) => vs.map((vv, idx) => idx === i ? { ...vv, label: e.target.value } : vv))}
                    className="input-base w-24 text-xs py-1.5"
                  >
                    <option>Size</option><option>Color</option><option>Material</option>
                  </select>
                  <input
                    placeholder="Value (e.g. Large)"
                    className="input-base flex-1 text-xs py-1.5"
                    value={v.value}
                    onChange={(e) => setVariants((vs) => vs.map((vv, idx) => idx === i ? { ...vv, value: e.target.value } : vv))}
                  />
                  <div className="relative w-20">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₱</span>
                    <input
                      placeholder="±0"
                      type="number"
                      className="input-base pl-5 text-xs py-1.5 w-full"
                      value={v.priceAdj}
                      onChange={(e) => setVariants((vs) => vs.map((vv, idx) => idx === i ? { ...vv, priceAdj: e.target.value } : vv))}
                    />
                  </div>
                  <button onClick={() => removeVariant(i)} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {saveError && (
          <div className="card p-4 text-sm text-red-600 bg-red-50 border-red-100">{saveError}</div>
        )}

        <div className="flex gap-2">
          <button onClick={() => navigate(isEdit ? `/inventory/${id}` : '/inventory')} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  )
}
