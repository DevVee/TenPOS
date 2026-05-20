import { useState } from 'react'
import { Save, Check, Store, Receipt, Shield, RefreshCw, Clock, Printer, Package } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { useSettingsStore } from '../../store/settingsStore'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-brand' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function Settings() {
  const s = useSettingsStore()
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    storeName:             s.storeName,
    address:               s.address,
    phone:                 s.phone,
    email:                 s.email,
    website:               s.website,
    receiptHeader:         s.receiptHeader,
    receiptFooter:         s.receiptFooter,
    receiptShowLogo:       s.receiptShowLogo,
    requirePinForDiscount: s.requirePinForDiscount,
    requirePinForVoid:     s.requirePinForVoid,
    autoSyncInterval:      String(s.autoSyncInterval),
    currencySymbol:        s.currencySymbol,
    dateFormat:            s.dateFormat,
    timeFormat:            s.timeFormat,
    timezone:              s.timezone,
    lowStockThreshold:     String(s.lowStockThreshold),
    printerEnabled:        s.printerEnabled,
    printerWidth:          s.printerWidth,
  })

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = () => {
    s.update({
      storeName:             form.storeName,
      address:               form.address,
      phone:                 form.phone,
      email:                 form.email,
      website:               form.website,
      receiptHeader:         form.receiptHeader,
      receiptFooter:         form.receiptFooter,
      receiptShowLogo:       form.receiptShowLogo,
      requirePinForDiscount: form.requirePinForDiscount,
      requirePinForVoid:     form.requirePinForVoid,
      autoSyncInterval:      parseInt(form.autoSyncInterval) || 30,
      currencySymbol:        form.currencySymbol,
      dateFormat:            form.dateFormat as typeof s.dateFormat,
      timeFormat:            form.timeFormat as typeof s.timeFormat,
      timezone:              form.timezone,
      lowStockThreshold:     parseInt(form.lowStockThreshold) || 5,
      printerEnabled:        form.printerEnabled,
      printerWidth:          form.printerWidth as typeof s.printerWidth,
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
          <button
            onClick={handleSave}
            className={`btn-primary flex items-center gap-1.5 transition-all ${saved ? 'bg-green-600 hover:bg-green-700' : ''}`}
          >
            {saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        }
      />

      <div className="space-y-4">
        {/* ── Store Info ──────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Store className="w-4 h-4 text-brand" />
            <p className="section-label">Store Information</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Business Name</label>
              <input className="input-base" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Address</label>
              <input className="input-base" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone</label>
              <input className="input-base" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" className="input-base" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Website</label>
              <input className="input-base" value={form.website} onChange={(e) => set('website', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Date & Time ─────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-brand" />
            <p className="section-label">Date & Time</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Date Format</label>
              <select className="input-base" value={form.dateFormat} onChange={(e) => set('dateFormat', e.target.value)}>
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY (PH standard)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Time Format</label>
              <select className="input-base" value={form.timeFormat} onChange={(e) => set('timeFormat', e.target.value)}>
                <option value="12h">12-hour (AM/PM)</option>
                <option value="24h">24-hour</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Timezone</label>
              <select className="input-base" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                <option value="Asia/Manila">Asia/Manila (GMT+8) — Philippines</option>
                <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                <option value="Asia/Hong_Kong">Asia/Hong_Kong (GMT+8)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                <option value="UTC">UTC</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">Current: {new Date().toLocaleTimeString('en-PH', { timeZone: form.timezone, hour: '2-digit', minute: '2-digit', hour12: form.timeFormat === '12h' })}</p>
            </div>
          </div>
        </div>

        {/* ── Receipt ─────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-4 h-4 text-brand" />
            <p className="section-label">Receipt Customization</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Receipt Header</label>
              <input className="input-base" value={form.receiptHeader} onChange={(e) => set('receiptHeader', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Receipt Footer / Message</label>
              <input className="input-base" value={form.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4 pt-1">
              {[
                { key: 'receiptShowLogo', label: 'Show logo on receipt', desc: 'Print store logo at the top' },
              ].map((item) => (
                <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                  <Toggle checked={form[item.key as keyof typeof form] as boolean} onChange={(v) => set(item.key, v)} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">{item.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Printer ─────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Printer className="w-4 h-4 text-brand" />
            <p className="section-label">Printer Settings</p>
          </div>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <Toggle checked={form.printerEnabled} onChange={(v) => set('printerEnabled', v)} />
              <div>
                <p className="text-sm font-medium text-gray-700">Thermal Printer Enabled</p>
                <p className="text-xs text-gray-400 mt-0.5">Auto-print receipts after each completed transaction</p>
              </div>
            </label>
            {form.printerEnabled && (
              <div className="max-w-xs">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Paper Width</label>
                <select className="input-base" value={form.printerWidth} onChange={(e) => set('printerWidth', e.target.value)}>
                  <option value="58mm">58mm (Narrow)</option>
                  <option value="80mm">80mm (Standard)</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ── Inventory ───────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-brand" />
            <p className="section-label">Inventory</p>
          </div>
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Low Stock Alert Threshold</label>
            <input
              type="number"
              min="1"
              max="100"
              className="input-base"
              value={form.lowStockThreshold}
              onChange={(e) => set('lowStockThreshold', e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Products at or below this stock level will show a low-stock warning</p>
          </div>
        </div>

        {/* ── Authorization ───────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-brand" />
            <p className="section-label">Authorization Requirements</p>
          </div>
          <div className="space-y-4">
            {[
              { key: 'requirePinForDiscount', label: 'Require manager PIN for custom discounts', desc: 'Cashiers need manager approval to apply manual discounts beyond pre-set limits' },
              { key: 'requirePinForVoid',     label: 'Require manager PIN to void transactions',  desc: 'All transaction voids need manager authorization' },
            ].map((item) => (
              <label key={item.key} className="flex items-start gap-3 cursor-pointer">
                <Toggle checked={form[item.key as keyof typeof form] as boolean} onChange={(v) => set(item.key, v)} />
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Sync ────────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="w-4 h-4 text-brand" />
            <p className="section-label">Sync & Connectivity</p>
          </div>
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Auto-Sync Interval</label>
            <select className="input-base" value={form.autoSyncInterval} onChange={(e) => set('autoSyncInterval', e.target.value)}>
              <option value="15">Every 15 seconds</option>
              <option value="30">Every 30 seconds</option>
              <option value="60">Every minute</option>
              <option value="300">Every 5 minutes</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">How often the POS syncs local data when online</p>
          </div>
        </div>
      </div>
    </div>
  )
}
