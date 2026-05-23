import { useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Modal } from '../../components/ui/Modal'
import { apiGetCategories, apiCreateCategory, apiUpdateCategory, apiDeleteCategory } from '../../lib/api'
import { useApiData } from '../../hooks/useApiData'

interface Category { id: string; name: string; description: string | null }

function categoryInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export function Categories() {
  const [tick, setTick] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '' })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [inlineEdit, setInlineEdit] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fetchCats = useCallback(
    () => apiGetCategories() as Promise<Category[]>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick]
  )
  const { data, loading } = useApiData(fetchCats, [tick])
  const categories = data ?? []

  const openAdd = () => {
    setEditingId(null)
    setForm({ name: '' })
    setSaveError('')
    setShowModal(true)
  }

  const openEdit = (id: string, name: string) => {
    setEditingId(id)
    setForm({ name })
    setSaveError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      if (editingId) {
        await apiUpdateCategory(editingId, { name: form.name.trim() })
      } else {
        await apiCreateCategory({ name: form.name.trim() })
      }
      setShowModal(false)
      setTick((t) => t + 1)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await apiDeleteCategory(deleteId)
      setDeleteId(null)
      setTick((t) => t + 1)
    } catch {}
  }

  const saveInlineEdit = async () => {
    if (!inlineEdit || !inlineEdit.name.trim()) return
    try {
      await apiUpdateCategory(inlineEdit.id, { name: inlineEdit.name.trim() })
      setInlineEdit(null)
      setTick((t) => t + 1)
    } catch {}
  }

  return (
    <div>
      <PageHeader
        title="Product Categories"
        subtitle="Manage categories shown in the POS product grid"
        actions={
          <button onClick={openAdd} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Category
          </button>
        }
      />

      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="grid grid-cols-12 gap-3">
            <span className="col-span-1 text-xs font-medium text-gray-500"></span>
            <span className="col-span-8 text-xs font-medium text-gray-500">Name</span>
            <span className="col-span-3"></span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {categories.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">No categories yet. Add one to get started.</p>
              </div>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="grid grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="col-span-1">
                    <div className="w-8 h-8 rounded-lg bg-brand-pale flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-brand">{categoryInitials(cat.name)}</span>
                    </div>
                  </div>
                  <div className="col-span-8">
                    {inlineEdit?.id === cat.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          className="input-base text-sm py-1"
                          value={inlineEdit.name}
                          onChange={(e) => setInlineEdit({ ...inlineEdit, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveInlineEdit(); if (e.key === 'Escape') setInlineEdit(null) }}
                        />
                        <button onClick={saveInlineEdit} className="p-1 text-green-500 hover:text-green-600"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setInlineEdit(null)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <span
                        className="text-sm font-medium text-gray-800 cursor-pointer hover:text-brand transition-colors"
                        onDoubleClick={() => setInlineEdit({ id: cat.id, name: cat.name })}
                        title="Double-click to rename"
                      >{cat.name}</span>
                    )}
                  </div>
                  <div className="col-span-3 flex justify-end gap-1">
                    <button
                      onClick={() => openEdit(cat.id, cat.name)}
                      className="p-1.5 text-gray-300 hover:text-brand transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteId(cat.id)}
                      className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Category' : 'Add Category'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Category Name <span className="text-brand">*</span></label>
            <input
              autoFocus
              className="input-base"
              placeholder="e.g. Tote Bags"
              value={form.name}
              onChange={(e) => setForm({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            />
          </div>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
              className="btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingId ? 'Save Changes' : 'Add Category'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Category">
        <p className="text-sm text-gray-600 mb-5">
          Are you sure you want to delete <strong>{categories.find((c) => c.id === deleteId)?.name}</strong>? Products in this category will become uncategorized.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Delete</button>
        </div>
      </Modal>
    </div>
  )
}
