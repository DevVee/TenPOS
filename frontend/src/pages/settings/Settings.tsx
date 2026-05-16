import { useState } from 'react'
import { Save, Check } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { useSettingsStore } from '../../store/settingsStore'

export function Settings() {
  const { storeName, address, phone, receiptHeader, receiptFooter,
    requirePinForDiscount, requirePinForVoid, autoSyncInterval, update } = useSettingsStore()

  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    storeName, address, phone,
    receiptHeader, receiptFooter, requirePinForDiscount, requirePinForVoid,
    autoSyncInterval: String(autoSyncInterval),
  })

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = () => {
    update({
      storeName: form.storeName,
      address: form.address,
      phone: form.phone,
      receiptHeader: form.receiptHeader,
      receiptFooter: form.receiptFooter,
      requirePinForDiscount: form.requirePinForDiscount,
      requirePinForVoid: form.requirePinForVoid,
      autoSyncInterval: parseInt(form.autoSyncInterval) || 30,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="System Settings"
        subtitle="Configure store information and POS behavior"
        actions={
          <button onClick={handleSave} className={`btn-primary flex items-center gap-1.5 transition-all ${saved ? 'bg-green-600 hover:bg-green-700' : ''}`}>
            {saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        }
      />

      <div className="space-y-4">
        {/* Store info */}
        <div className="card p-5">
          <p className="section-label mb-4">Store Information</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Store / Business Name</label>
              <input className="input-base" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Address</label>
              <input className="input-base" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone</label>
              <input className="input-base" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Receipt */}
        <div className="card p-5">
          <p className="section-label mb-4">Receipt Customization</p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Receipt Header</label>
              <input className="input-base" value={form.receiptHeader} onChange={(e) => set('receiptHeader', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Receipt Footer</label>
              <input className="input-base" value={form.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Authorization */}
        <div className="card p-5">
          <p className="section-label mb-4">Authorization Requirements</p>
          <div className="space-y-4">
            {[
              { key: 'requirePinForDiscount', label: 'Require manager PIN for custom discounts', desc: 'Cashiers need manager approval to apply manual discounts beyond pre-set limits' },
              { key: 'requirePinForVoid', label: 'Require manager PIN to void transactions', desc: 'All transaction voids need manager authorization. Voids are done from the Returns & Voids page.' },
            ].map((item) => (
              <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input type="checkbox" className="sr-only" checked={form[item.key as keyof typeof form] as boolean} onChange={(e) => set(item.key, e.target.checked)} />
                  <div className={`w-10 h-5 rounded-full transition-colors ${form[item.key as keyof typeof form] ? 'bg-brand' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[item.key as keyof typeof form] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Sync */}
        <div className="card p-5">
          <p className="section-label mb-4">Sync & Connectivity</p>
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Auto-Sync Interval</label>
            <select className="input-base" value={form.autoSyncInterval} onChange={(e) => set('autoSyncInterval', e.target.value)}>
              <option value="15">Every 15 seconds</option>
              <option value="30">Every 30 seconds</option>
              <option value="60">Every minute</option>
              <option value="300">Every 5 minutes</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">How often the POS syncs local data to the cloud when online</p>
          </div>
        </div>

        {/* How voids work info */}
        <div className="card p-4 bg-blue-50 border-blue-100">
          <p className="text-sm font-semibold text-blue-800 mb-1">How transaction voids work</p>
          <p className="text-xs text-blue-600 leading-relaxed">
            To void a transaction: go to <strong>Returns & Voids</strong> → click <strong>Void Transaction</strong> → enter the receipt number and reason → manager authorizes with PIN. Voided transactions are logged in the Audit Log and cannot be deleted. Inventory is automatically restocked on void.
          </p>
        </div>
      </div>
    </div>
  )
}
