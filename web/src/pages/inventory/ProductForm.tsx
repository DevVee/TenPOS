import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Plus, Trash2, ImagePlus, X, Loader2, Images, Upload } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { apiGetProduct, apiCreateProduct, apiUpdateProduct, apiGetCategories } from '../../lib/api'
import { supabase } from '../../lib/supabase'

interface Category { id: string; name: string }
interface Variant { label: string; value: string; priceAdj: string }

// Images that exist in /public/products/
const GALLERY_IMAGES = [
  { file: 'butterfly-large.png',  label: 'Pagasa Large Butterfly' },
  { file: 'hearts-large.png',     label: 'Pagasa Large Hearts' },
  { file: 'balls-large.png',      label: 'Pagasa Large Balls' },
  { file: 'camo-large.png',       label: 'Pagasa Large Camo' },
  { file: 'triangles-large.png',  label: 'Pagasa Large Triangles' },
  { file: 'black-large.png',      label: 'Pagasa Large Black' },
  { file: 'bw-weave-large.png',   label: 'Pagasa Large B&W Weave' },
  { file: 'unicorn-large.png',    label: 'Pagasa Large Black Unicorn' },
  { file: 'blue-camo-large.png',  label: 'Pagasa Large Blue Camo' },
  { file: 'carnival-large.png',   label: 'Pagasa Large Carnival' },
  { file: 'squares-large.png',    label: 'Pagasa Large Coloured Squares' },
  { file: 'leaves-large.png',     label: 'Pagasa Large Colourful Leaves' },
  { file: 'dalmatian-large.png',  label: 'Pagasa Large Dalmatian' },
  { file: 'doodles-large.png',    label: 'Pagasa Large Doodles on Grey' },
  { file: 'blue-red-large.png',   label: 'Pagasa Large Blue and Red' },
  { file: 'camo2-large.png',      label: 'Pagasa Large Camo 2' },
  { file: 'grey-zoo-large.png',   label: 'Pagasa Large Grey Zoo' },
  { file: 'green-large.png',      label: 'Pagasa Large Green' },
  { file: 'stripes-large.png',    label: 'Pagasa Large Stripes' },
  { file: 'dino-medium.png',      label: 'Malakas Medium Dinosaur' },
  { file: 'dalmatian-medium.png', label: 'Malakas Medium Dalmatian' },
  { file: 'red-medium.png',       label: 'Malakas Medium Firecracker Red' },
  { file: 'lime-medium.png',      label: 'Malakas Medium Lime' },
  { file: 'mustard-medium.png',   label: 'Malakas Medium Mustard' },
]

function ImageGallery({ selected, onSelect, onClose }: {
  selected: string
  onSelect: (url: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900">Choose Product Image</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select from product gallery or upload your own</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
            {/* No image option */}
            <button
              onClick={() => { onSelect(''); onClose() }}
              className={`aspect-square rounded-xl border-2 flex items-center justify-center transition-all ${
                selected === '' ? 'border-brand bg-brand-pale' : 'border-dashed border-gray-200 hover:border-gray-300'
              }`}
            >
              <X className="w-6 h-6 text-gray-300" />
            </button>
            {GALLERY_IMAGES.map((img) => {
              const url = `/products/${img.file}`
              const isSelected = selected === url
              return (
                <button
                  key={img.file}
                  onClick={() => { onSelect(url); onClose() }}
                  title={img.label}
                  className={`aspect-square rounded-xl border-2 overflow-hidden transition-all ${
                    isSelected ? 'border-brand ring-2 ring-brand/30 shadow-md' : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  <img
                    src={url}
                    alt={img.label}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                  />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProductForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isEdit = id !== undefined && id !== 'new'
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', category_id: '',
    price: '', description: '', imageUrl: '',
  })
  const [variants, setVariants] = useState<Variant[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loadingData, setLoadingData] = useState(true)
  const [showGallery, setShowGallery] = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoadingData(true)
      try {
        const cats = await apiGetCategories() as Category[]
        setCategories(cats)
        if (isEdit && id) {
          const product = await apiGetProduct(id) as {
            name: string; sku: string; barcode?: string | null; category_id: string | null
            price: number; description?: string | null; image_url?: string | null
            variants: { label: string; value: string; price_adjustment: number }[]
          }
          setForm({
            name:        product.name,
            sku:         product.sku ?? '',
            barcode:     product.barcode ?? '',
            category_id: product.category_id ?? '',
            price:       String(product.price),
            description: product.description ?? '',
            imageUrl:    product.image_url ?? '',
          })
          setVariants(product.variants.map((v) => ({
            label: v.label, value: v.value, priceAdj: String(v.price_adjustment),
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected
    e.target.value = ''

    // Validate
    if (file.size > 5 * 1024 * 1024) { setUploadError('File too large. Max 5 MB.'); return }
    if (!file.type.startsWith('image/')) { setUploadError('Only image files are allowed.'); return }

    setUploading(true)
    setUploadError('')
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('products').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('products').getPublicUrl(path)
      set('imageUrl', data.publicUrl)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.price) errs.price = 'Selling price is required'
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
        sku:         form.sku.trim() || `SKU-${Date.now()}`,
        barcode:     form.barcode.trim() || undefined,
        category_id: form.category_id || undefined,
        price:       parseFloat(form.price),
        description: form.description.trim() || undefined,
        image_url:   form.imageUrl || undefined,
        variants:    variants
          .filter((v) => v.value.trim())
          .map((v) => ({ label: v.label, value: v.value.trim(), price_adjustment: parseFloat(v.priceAdj) || 0 })),
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
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      {showGallery && (
        <ImageGallery
          selected={form.imageUrl}
          onSelect={(url) => set('imageUrl', url)}
          onClose={() => setShowGallery(false)}
        />
      )}

      <PageHeader
        title={isEdit ? 'Edit Product' : 'Add New Product'}
        subtitle="Fill in product details"
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(isEdit ? `/inventory/${id}` : '/inventory')} className="btn-secondary flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
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
            <div
              className="w-28 h-28 rounded-2xl bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0 border-2 border-dashed border-gray-200 cursor-pointer hover:border-brand/50 transition-colors"
              onClick={() => setShowGallery(true)}
            >
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" onError={() => set('imageUrl', '')} />
              ) : (
                <ImagePlus className="w-8 h-8 text-gray-300" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <button
                onClick={() => setShowGallery(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-brand/50 hover:bg-brand-pale hover:text-brand transition-all"
              >
                <Images className="w-4 h-4" /> Choose from Gallery
              </button>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400">or</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {uploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                  : <><Upload className="w-4 h-4" /> Upload from device</>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
              {form.imageUrl && (
                <button onClick={() => set('imageUrl', '')} className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-brand transition-colors py-1">
                  <X className="w-3.5 h-3.5" /> Remove image
                </button>
              )}
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
                placeholder="e.g. Pagasa Large Butterfly"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                SKU <span className="text-gray-400 font-normal">(optional — auto-generated if blank)</span>
              </label>
              <input
                className="input-base font-mono"
                placeholder="e.g. PAG-L-BUT"
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
              />
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
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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

        {/* Pricing — selling price only */}
        <div className="card p-5">
          <p className="section-label mb-4">Pricing</p>
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Selling Price <span className="text-brand">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₱</span>
              <input
                type="number"
                className={`input-base pl-7 text-lg font-bold ${errors.price ? 'border-red-400' : ''}`}
                placeholder="0.00"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
              />
            </div>
            {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
          </div>
        </div>

        {/* Variants */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-label">Product Variants</p>
              <p className="text-xs text-gray-400 mt-0.5">Optional: size, color, or other options with price adjustments</p>
            </div>
            <button onClick={() => setVariants((v) => [...v, { label: 'Size', value: '', priceAdj: '0' }])} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Variant
            </button>
          </div>
          {variants.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No variants. Click "Add Variant" to create options like Small/Large.</p>
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
                    placeholder="e.g. Large"
                    className="input-base flex-1 text-xs py-1.5"
                    value={v.value}
                    onChange={(e) => setVariants((vs) => vs.map((vv, idx) => idx === i ? { ...vv, value: e.target.value } : vv))}
                  />
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">±₱</span>
                    <input
                      placeholder="0"
                      type="number"
                      className="input-base pl-7 text-xs py-1.5 w-full"
                      value={v.priceAdj}
                      onChange={(e) => setVariants((vs) => vs.map((vv, idx) => idx === i ? { ...vv, priceAdj: e.target.value } : vv))}
                    />
                  </div>
                  <button onClick={() => setVariants((v) => v.filter((_, idx) => idx !== i))} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {saveError && <div className="card p-4 text-sm text-red-600 bg-red-50 border-red-100">{saveError}</div>}

        <div className="flex gap-2">
          <button onClick={() => navigate(isEdit ? `/inventory/${id}` : '/inventory')} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  )
}
