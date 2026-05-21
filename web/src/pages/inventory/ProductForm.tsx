import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Save, Plus, Trash2, ImagePlus, X, Loader2,
  Images, Upload, ChevronDown, Package,
} from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { apiGetProduct, apiCreateProduct, apiUpdateProduct, apiGetCategories } from '../../lib/api'
import { supabase } from '../../lib/supabase'

interface Category { id: string; name: string }
interface Variant  { label: string; value: string; priceAdj: string }

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
  { file: 'dino-medium.png',      label: 'Malakas Medium Dinosaur' },
  { file: 'dalmatian-medium.png', label: 'Malakas Medium Dalmatian' },
  { file: 'red-medium.png',       label: 'Malakas Medium Firecracker Red' },
  { file: 'lime-medium.png',      label: 'Malakas Medium Lime' },
  { file: 'mustard-medium.png',   label: 'Malakas Medium Mustard' },
]

const MATERIALS = ['', 'Canvas', 'Nylon', 'Polyester', 'Leather', 'PVC', 'Oxford Cloth', 'Denim', 'Mesh', 'Suede', 'Other']

// ── Collapsible section wrapper ──────────────────────────────────────────────
function Collapsible({ title, badge, children, defaultOpen = false }: {
  title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-gray-800">{title}</p>
          {badge && <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{badge}</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-50">{children}</div>}
    </div>
  )
}

// ── Image gallery picker ─────────────────────────────────────────────────────
function ImageGallery({ selected, onSelect, onClose }: {
  selected: string; onSelect: (url: string) => void; onClose: () => void
}) {
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([])
  const [loadingUploads, setLoadingUploads] = useState(true)

  // Pull previously-uploaded images from Supabase Storage on open
  useEffect(() => {
    const load = async () => {
      setLoadingUploads(true)
      try {
        const { data: files } = await supabase.storage.from('products').list('', {
          limit: 100, sortBy: { column: 'created_at', order: 'desc' },
        })
        if (files) {
          const urls = files
            .filter((f) => f.name !== '.emptyFolderPlaceholder' && f.name !== '')
            .map((f) => supabase.storage.from('products').getPublicUrl(f.name).data.publicUrl)
          setUploadedUrls(urls)
        }
      } catch { /* ignore */ }
      setLoadingUploads(false)
    }
    load()
  }, [])

  function ThumbBtn({ url, label }: { url: string; label?: string }) {
    return (
      <button
        onClick={() => { onSelect(url); onClose() }}
        title={label}
        className={`aspect-square rounded-xl border-2 overflow-hidden transition-all active:scale-95 ${
          selected === url
            ? 'border-brand ring-2 ring-brand/30 shadow-md'
            : 'border-gray-100 hover:border-brand/40'
        }`}
      >
        <img src={url} alt={label ?? ''} className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-900">Choose Product Image</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select from uploads or built-in gallery</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-gray-100 text-gray-400 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-5">

          {/* ── Uploaded (Supabase Storage) ───────────────────────── */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
              <Upload className="w-3 h-3" /> Previously Uploaded
            </p>
            {loadingUploads ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            ) : uploadedUrls.length === 0 ? (
              <p className="text-xs text-gray-300 italic py-1">No uploads yet — images you upload will appear here.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
                {uploadedUrls.map((url) => <ThumbBtn key={url} url={url} />)}
              </div>
            )}
          </div>

          {/* ── Built-in gallery ──────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
              <Images className="w-3 h-3" /> Built-in Gallery
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
              {/* No image option */}
              <button
                onClick={() => { onSelect(''); onClose() }}
                className={`aspect-square rounded-xl border-2 flex items-center justify-center transition-all active:scale-95 ${
                  selected === '' ? 'border-brand bg-brand-pale' : 'border-dashed border-gray-200 hover:border-gray-300'
                }`}
              >
                <X className="w-5 h-5 text-gray-300" />
              </button>
              {GALLERY_IMAGES.map((img) => (
                <ThumbBtn key={img.file} url={`/products/${img.file}`} label={img.label} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export function ProductForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const isEdit = id !== undefined && id !== 'new'
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    // Core
    name: '', sku: '', barcode: '', category_id: '', price: '', imageUrl: '',
    // Details
    description: '', brand: '', material: '', color: '',
    // Dimensions
    length_cm: '', width_cm: '', height_cm: '', weight_grams: '',
    // Internal
    tags: '', notes: '',
  })
  const [variants, setVariants]       = useState<Variant[]>([])
  const [categories, setCategories]   = useState<Category[]>([])
  const [errors, setErrors]           = useState<Record<string, string>>({})
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [loadingData, setLoadingData] = useState(true)
  const [showGallery, setShowGallery] = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoadingData(true)
      try {
        const cats = await apiGetCategories() as Category[]
        setCategories(cats)
        if (isEdit && id) {
          const p = await apiGetProduct(id) as {
            name: string; sku: string; barcode?: string | null; category_id: string | null
            price: number; image_url?: string | null
            description?: string | null; brand?: string | null; material?: string | null
            color?: string | null; weight_grams?: number | null
            length_cm?: number | null; width_cm?: number | null; height_cm?: number | null
            tags?: string[] | null; notes?: string | null
            variants: { label: string; value: string; price_adjustment: number }[]
          }
          setForm({
            name:         p.name,
            sku:          p.sku ?? '',
            barcode:      p.barcode ?? '',
            category_id:  p.category_id ?? '',
            price:        String(p.price),
            imageUrl:     p.image_url ?? '',
            description:  p.description ?? '',
            brand:        p.brand ?? '',
            material:     p.material ?? '',
            color:        p.color ?? '',
            weight_grams: p.weight_grams != null ? String(p.weight_grams) : '',
            length_cm:    p.length_cm    != null ? String(p.length_cm)    : '',
            width_cm:     p.width_cm     != null ? String(p.width_cm)     : '',
            height_cm:    p.height_cm    != null ? String(p.height_cm)    : '',
            tags:         p.tags?.join(', ') ?? '',
            notes:        p.notes ?? '',
          })
          setVariants(p.variants.map((v) => ({
            label: v.label, value: v.value, priceAdj: String(v.price_adjustment),
          })))
        }
      } catch { /* ignore */ }
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
    e.target.value = ''
    if (file.size > 5 * 1024 * 1024) { setUploadError('File too large. Max 5 MB.'); return }
    if (!file.type.startsWith('image/')) { setUploadError('Only image files are allowed.'); return }
    setUploading(true); setUploadError('')
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('products').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('products').getPublicUrl(path)
      set('imageUrl', data.publicUrl)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
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
    setSaving(true); setSaveError('')
    try {
      const tagsArr = form.tags.trim()
        ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined

      const payload: Record<string, unknown> = {
        name:         form.name.trim(),
        sku:          form.sku.trim() || `SKU-${Date.now()}`,
        barcode:      form.barcode.trim() || undefined,
        category_id:  form.category_id || undefined,
        price:        parseFloat(form.price),
        image_url:    form.imageUrl || undefined,
        description:  form.description.trim() || undefined,
        brand:        form.brand.trim() || undefined,
        material:     form.material || undefined,
        color:        form.color.trim() || undefined,
        weight_grams: form.weight_grams ? parseFloat(form.weight_grams) : undefined,
        length_cm:    form.length_cm   ? parseFloat(form.length_cm)    : undefined,
        width_cm:     form.width_cm    ? parseFloat(form.width_cm)     : undefined,
        height_cm:    form.height_cm   ? parseFloat(form.height_cm)    : undefined,
        tags:         tagsArr,
        notes:        form.notes.trim() || undefined,
        variants: variants
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

  if (loadingData) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>

  // Does the details/dimensions/notes section have data? (for badge)
  const hasDetails    = !!(form.brand || form.material || form.color)
  const hasDimensions = !!(form.length_cm || form.width_cm || form.height_cm || form.weight_grams)
  const hasNotes      = !!(form.tags || form.notes)

  return (
    <div>
      {showGallery && (
        <ImageGallery selected={form.imageUrl} onSelect={(url) => set('imageUrl', url)} onClose={() => setShowGallery(false)} />
      )}

      <PageHeader
        title={isEdit ? 'Edit Product' : 'Add New Product'}
        subtitle="Fill in product details. Only Name and Price are required."
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(isEdit ? `/inventory/${id}` : '/inventory')} className="btn-secondary">
              <ArrowLeft className="w-4 h-4" /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Save Changes' : 'Save Product'}
            </button>
          </div>
        }
      />

      <div className="space-y-4">

        {/* ── Product Image ────────────────────────────────────────────── */}
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
              <button onClick={() => setShowGallery(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-brand/50 hover:bg-brand-pale hover:text-brand transition-all">
                <Images className="w-4 h-4" /> Choose from Gallery
              </button>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-100" /><span className="text-xs text-gray-400">or</span><div className="flex-1 h-px bg-gray-100" />
              </div>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-60">
                {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload from device</>}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
              {form.imageUrl && (
                <button onClick={() => set('imageUrl', '')} className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-brand py-1 transition-colors">
                  <X className="w-3.5 h-3.5" /> Remove image
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Core Info ───────────────────────────────────────────────── */}
        <div className="card p-5">
          <p className="section-label mb-4">Product Information</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Product Name <span className="text-brand">*</span></label>
              <input className={`input-base ${errors.name ? 'border-red-400' : ''}`}
                placeholder="e.g. Pagasa Large Butterfly"
                value={form.name} onChange={(e) => set('name', e.target.value)} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">SKU <span className="text-gray-400 font-normal">(auto-generated if blank)</span></label>
              <input className="input-base font-mono" placeholder="e.g. PAG-L-BUT" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Barcode <span className="text-gray-400 font-normal">(optional)</span></label>
              <input className="input-base font-mono" placeholder="Scan or type barcode" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
              <select className="input-base" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                <option value="">Select category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                rows={3}
                className="input-base resize-none"
                placeholder="Describe the product — material, features, recommended use…"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Pricing ─────────────────────────────────────────────────── */}
        <div className="card p-5">
          <p className="section-label mb-4">Pricing</p>
          <div className="max-w-xs">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Selling Price <span className="text-brand">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₱</span>
              <input type="number" className={`input-base pl-7 text-lg font-bold ${errors.price ? 'border-red-400' : ''}`}
                placeholder="0.00" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </div>
            {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
          </div>
        </div>

        {/* ── Product Details (optional, collapsible) ──────────────────── */}
        <Collapsible title="Product Details" badge={hasDetails ? 'Filled' : 'Optional'} defaultOpen={hasDetails}>
          <div className="grid sm:grid-cols-3 gap-4 pt-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Brand</label>
              <input className="input-base" placeholder="e.g. Pagasa, Malakas" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Material</label>
              <select className="input-base" value={form.material} onChange={(e) => set('material', e.target.value)}>
                {MATERIALS.map((m) => <option key={m} value={m}>{m || 'Select material…'}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Color / Print</label>
              <input className="input-base" placeholder="e.g. Butterfly Print, Camo Blue" value={form.color} onChange={(e) => set('color', e.target.value)} />
            </div>
          </div>
        </Collapsible>

        {/* ── Dimensions & Weight (optional, collapsible) ──────────────── */}
        <Collapsible title="Dimensions & Weight" badge={hasDimensions ? 'Filled' : 'Optional'} defaultOpen={hasDimensions}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Length (cm)</label>
              <input type="number" min="0" step="0.1" className="input-base" placeholder="e.g. 35"
                value={form.length_cm} onChange={(e) => set('length_cm', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Width (cm)</label>
              <input type="number" min="0" step="0.1" className="input-base" placeholder="e.g. 25"
                value={form.width_cm} onChange={(e) => set('width_cm', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Height (cm)</label>
              <input type="number" min="0" step="0.1" className="input-base" placeholder="e.g. 12"
                value={form.height_cm} onChange={(e) => set('height_cm', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Weight (grams)</label>
              <input type="number" min="0" step="1" className="input-base" placeholder="e.g. 450"
                value={form.weight_grams} onChange={(e) => set('weight_grams', e.target.value)} />
            </div>
          </div>
          {(form.length_cm && form.width_cm && form.height_cm) && (
            <p className="text-xs text-gray-400 mt-3">
              <Package className="w-3 h-3 inline mr-1" />
              {form.length_cm} × {form.width_cm} × {form.height_cm} cm
              {form.weight_grams && ` · ${parseFloat(form.weight_grams) >= 1000
                ? `${(parseFloat(form.weight_grams) / 1000).toFixed(2)} kg`
                : `${form.weight_grams} g`}`}
            </p>
          )}
        </Collapsible>

        {/* ── Variants ────────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-label">Product Variants</p>
              <p className="text-xs text-gray-400 mt-0.5">Optional: size, color, or other options with price adjustments</p>
            </div>
            <button onClick={() => setVariants((v) => [...v, { label: 'Size', value: '', priceAdj: '0' }])} className="btn-secondary text-xs py-1.5 px-3">
              <Plus className="w-3.5 h-3.5" /> Add Variant
            </button>
          </div>
          {variants.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No variants. Click "Add Variant" to create options like Small / Large.</p>
          ) : (
            <div className="space-y-2.5">
              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                  <select value={v.label}
                    onChange={(e) => setVariants((vs) => vs.map((vv, idx) => idx === i ? { ...vv, label: e.target.value } : vv))}
                    className="input-base w-28 text-xs py-1.5">
                    <option>Size</option><option>Color</option><option>Material</option><option>Style</option>
                  </select>
                  <input placeholder="e.g. Large" className="input-base flex-1 text-xs py-1.5" value={v.value}
                    onChange={(e) => setVariants((vs) => vs.map((vv, idx) => idx === i ? { ...vv, value: e.target.value } : vv))} />
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">±₱</span>
                    <input placeholder="0" type="number" className="input-base pl-7 text-xs py-1.5 w-full" value={v.priceAdj}
                      onChange={(e) => setVariants((vs) => vs.map((vv, idx) => idx === i ? { ...vv, priceAdj: e.target.value } : vv))} />
                  </div>
                  <button onClick={() => setVariants((vs) => vs.filter((_, idx) => idx !== i))} className="p-1.5 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Internal Notes (optional, collapsible) ───────────────────── */}
        <Collapsible title="Tags & Internal Notes" badge={hasNotes ? 'Filled' : 'Optional'} defaultOpen={hasNotes}>
          <div className="space-y-4 pt-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tags</label>
              <input className="input-base" placeholder="e.g. large, waterproof, back-to-school (comma-separated)"
                value={form.tags} onChange={(e) => set('tags', e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Comma-separated tags for filtering and search</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Internal Notes</label>
              <textarea rows={3} className="input-base resize-none"
                placeholder="Supplier info, storage notes, reorder details — not shown to customers"
                value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </Collapsible>

        {saveError && <div className="card p-4 text-sm text-red-600 bg-red-50 border-red-100">{saveError}</div>}

        <div className="flex gap-2">
          <button onClick={() => navigate(isEdit ? `/inventory/${id}` : '/inventory')} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 disabled:opacity-50 justify-center">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  )
}
