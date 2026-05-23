import { useState, useEffect, useCallback } from 'react'
import { Save, Check, Store, Receipt, Shield, RefreshCw, Clock, Printer, Package, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Archive, Download, Calendar, MapPin } from 'lucide-react'
import { PageHeader } from '../../components/ui/PageHeader'
import { Modal } from '../../components/ui/Modal'
import { useSettingsStore } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import { useBranchStore } from '../../store/branchStore'
import { apiGetMyPinStatus, apiSetOverridePin, apiClearOverridePin } from '../../lib/api'
import {
  runBackup, runSQLBackup, getLastBackup, isAutoBackupEnabled, setAutoBackupEnabled,
  isAutoBackupDue, daysSinceLastBackup, type BackupMeta,
} from '../../lib/backup'

/**
 * Toggle — pill switch.
 * Uses stopPropagation so a parent <div onClick> can also handle the toggle
 * without the click firing twice (which would cancel itself out).
 */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 p-0 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ${
        checked ? 'bg-brand' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
      <div className="w-7 h-7 rounded-lg bg-brand-pale flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-brand" />
      </div>
      <p className="text-sm font-bold text-gray-800">{title}</p>
    </div>
  )
}

export function Settings() {
  const s = useSettingsStore()
  const { user } = useAuthStore()
  const { activeBranchId, activeBranchName, activeBranchAddress } = useBranchStore()
  const [saved, setSaved] = useState(false)

  // ── Backup state ────────────────────────────────────────────────────────────
  const [backupRunning,  setBackupRunning]  = useState(false)
  const [backupError,    setBackupError]    = useState('')
  const [backupDone,     setBackupDone]     = useState(false)
  const [lastBackup,     setLastBackup]     = useState<BackupMeta | null>(() => getLastBackup())
  const [autoBackup,     setAutoBackup]     = useState(() => isAutoBackupEnabled())
  const [sqlRunning,     setSqlRunning]     = useState(false)
  const [sqlDone,        setSqlDone]        = useState(false)
  const [sqlError,       setSqlError]       = useState('')

  const handleToggleAutoBackup = (v: boolean) => {
    setAutoBackup(v)
    setAutoBackupEnabled(v)
  }

  const handleBackupNow = useCallback(async () => {
    setBackupRunning(true)
    setBackupError('')
    setBackupDone(false)
    try {
      const meta = await runBackup()
      setLastBackup(meta)
      setBackupDone(true)
      setTimeout(() => setBackupDone(false), 4000)
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Backup failed. Please try again.')
    } finally {
      setBackupRunning(false)
    }
  }, [])

  const handleSQLBackup = useCallback(async () => {
    setSqlRunning(true)
    setSqlError('')
    setSqlDone(false)
    try {
      await runSQLBackup()
      setSqlDone(true)
      setTimeout(() => setSqlDone(false), 4000)
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : 'SQL export failed. Please try again.')
    } finally {
      setSqlRunning(false)
    }
  }, [])

  // Auto-backup: trigger silently when the page loads and it's due
  useEffect(() => {
    if (isAutoBackupDue()) {
      void handleBackupNow()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once on mount

  // ── Manager Override PIN state ──────────────────────────────────────────────
  const isManager = user?.role === 'admin' || user?.role === 'manager'
  const [pinHasSet,       setPinHasSet]       = useState(false)
  const [showPinModal,    setShowPinModal]     = useState(false)
  const [showClearConfirm,setShowClearConfirm] = useState(false)
  const [pinValue,        setPinValue]         = useState('')
  const [pinConfirm,      setPinConfirm]       = useState('')
  const [showPin,         setShowPin]          = useState(false)
  const [pinSaving,       setPinSaving]        = useState(false)
  const [pinError,        setPinError]         = useState('')
  const [pinClearing,     setPinClearing]      = useState(false)

  useEffect(() => {
    if (!isManager) return
    apiGetMyPinStatus().then(setPinHasSet).catch(() => {})
  }, [isManager])

  const openSetPin = () => {
    setPinValue(''); setPinConfirm(''); setPinError(''); setShowPin(false)
    setShowPinModal(true)
  }

  const handleSavePin = async () => {
    if (!/^\d{4,8}$/.test(pinValue)) { setPinError('PIN must be 4–8 digits.'); return }
    if (pinValue !== pinConfirm)      { setPinError('PINs do not match.'); return }
    setPinSaving(true); setPinError('')
    try {
      await apiSetOverridePin(pinValue)
      setPinHasSet(true)
      setShowPinModal(false)
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to save PIN')
    } finally {
      setPinSaving(false)
    }
  }

  const handleClearPin = async () => {
    setPinClearing(true)
    try {
      await apiClearOverridePin()
      setPinHasSet(false)
      setShowClearConfirm(false)
    } catch {
      /* show nothing — rare */
    } finally {
      setPinClearing(false)
    }
  }

  const [form, setForm] = useState({
    storeName:             activeBranchName    ?? s.storeName,
    address:               activeBranchAddress ?? s.address,
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

  // When the active branch changes, update the store name/address fields to
  // reflect that branch's identity so receipts and reports use the right info.
  useEffect(() => {
    if (activeBranchId) {
      setForm((f) => ({
        ...f,
        storeName: activeBranchName    ?? f.storeName,
        address:   activeBranchAddress ?? f.address,
      }))
    } else {
      setForm((f) => ({ ...f, storeName: s.storeName, address: s.address }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, activeBranchName, activeBranchAddress])

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
    <div>
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

        {/* ── Row 1: Store Information (full width) ───────────────────── */}
        <div className="card p-5">
          <SectionHeader icon={Store} title="Store Information" />
          {activeBranchId && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-brand-pale border border-brand/20 rounded-xl text-sm text-brand">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                Showing <strong>{activeBranchName}</strong> — name and address reflect the active branch.
                {' '}<a href="/settings/branches" className="underline underline-offset-2 text-brand/70 hover:text-brand text-xs">Change in Branch Settings</a>
              </span>
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Business Name</label>
              <input className="input-base" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
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

        {/* ── Manager Override PIN (managers/admins only) ──────────────── */}
        {isManager && (
          <div className="card p-5">
            <SectionHeader icon={KeyRound} title="Manager Override PIN" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-gray-600">
                  Set a personal PIN so cashiers can request manager authorization for voids and discounts
                  without you being physically present.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  {pinHasSet ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> PIN is set
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                      <AlertCircle className="w-3.5 h-3.5" /> No PIN set
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={openSetPin} className="btn-secondary text-sm flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  {pinHasSet ? 'Change PIN' : 'Set PIN'}
                </button>
                {pinHasSet && (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Backup & Export ─────────────────────────────────────────── */}
        <div className="card p-5">
          <SectionHeader icon={Archive} title="Backup & Export" />

          {/* Auto-backup due banner */}
          {isAutoBackupDue() && lastBackup && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <Calendar className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-800 font-medium flex-1">
                Weekly backup is running automatically…
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-6">

            {/* Left — last backup info + trigger */}
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Downloads a complete JSON snapshot of all your data — transactions, products,
                staff, categories and vouchers. Store it in Google Drive, Dropbox, or a USB drive.
              </p>

              {/* Last backup status */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4">
                {lastBackup ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <p className="text-sm font-semibold text-gray-800">Last backup successful</p>
                    </div>
                    <p className="text-xs text-gray-500 pl-6">
                      {new Date(lastBackup.date).toLocaleString('en-PH', {
                        weekday: 'long', month: 'long', day: 'numeric',
                        year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    <p className="text-xs text-gray-400 pl-6">
                      {lastBackup.records.toLocaleString()} records exported
                      {daysSinceLastBackup() !== null && (
                        <span className="ml-1">
                          · {daysSinceLastBackup() === 0
                              ? 'today'
                              : `${daysSinceLastBackup()} day${daysSinceLastBackup() === 1 ? '' : 's'} ago`}
                        </span>
                      )}
                    </p>
                    <div className="pl-6 pt-1 flex gap-3 text-[11px] text-gray-400">
                      <span>{lastBackup.tables.transactions} txns</span>
                      <span>·</span>
                      <span>{lastBackup.tables.products} products</span>
                      <span>·</span>
                      <span>{lastBackup.tables.staff} staff</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-sm text-amber-700 font-medium">No backup on record</p>
                  </div>
                )}
              </div>

              {backupError && (
                <div className="flex items-center gap-2 text-sm text-red-600 mb-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {backupError}
                </div>
              )}

              <button
                onClick={handleBackupNow}
                disabled={backupRunning}
                className="btn-primary flex items-center gap-2"
              >
                {backupRunning ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
                ) : backupDone ? (
                  <><Check className="w-4 h-4" /> Downloaded!</>
                ) : (
                  <><Download className="w-4 h-4" /> Back Up Now</>
                )}
              </button>
            </div>

            {/* Right — auto-backup schedule */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Schedule</p>

              <div
                className="flex items-start gap-3 cursor-pointer mb-4"
                onClick={() => handleToggleAutoBackup(!autoBackup)}
              >
                <Toggle checked={autoBackup} onChange={handleToggleAutoBackup} />
                <div>
                  <p className="text-sm font-medium text-gray-700">Weekly auto-backup</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Automatically downloads a backup when you open this page after 7 days
                  </p>
                </div>
              </div>

              {autoBackup && (
                <div className="bg-brand-pale border border-brand/15 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="text-xs font-semibold text-brand">Auto-backup is on</p>
                  {lastBackup ? (
                    <p className="text-xs text-gray-500">
                      Next backup in approximately{' '}
                      <strong className="text-gray-700">
                        {Math.max(0, 7 - (daysSinceLastBackup() ?? 0))} day{Math.max(0, 7 - (daysSinceLastBackup() ?? 0)) === 1 ? '' : 's'}
                      </strong>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">Run your first backup manually to start the schedule.</p>
                  )}
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Format</p>
                <div className="flex items-start gap-2.5 mb-4">
                  <div className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-black text-emerald-700 leading-none">XLS</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Excel (.xlsx) — 7 sheets</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Summary, Transactions, Items, Products, Staff, Categories &amp; Vouchers.
                      Opens directly in Excel or Google Sheets.
                    </p>
                  </div>
                </div>

                {/* SQL export */}
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="w-6 h-6 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-black text-blue-700 leading-none">SQL</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">PostgreSQL (.sql) — INSERT dump</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      All records as INSERT statements — import into any PostgreSQL-compatible database.
                    </p>
                  </div>
                </div>
                {sqlError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 mb-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {sqlError}
                  </div>
                )}
                <button
                  onClick={handleSQLBackup}
                  disabled={sqlRunning}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  {sqlRunning ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting SQL…</>
                  ) : sqlDone ? (
                    <><Check className="w-3.5 h-3.5 text-green-600" /> Downloaded!</>
                  ) : (
                    <><Download className="w-3.5 h-3.5" /> Export SQL</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2: Two columns ───────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4">

          {/* LEFT column */}
          <div className="space-y-4">

            {/* Receipt Customization */}
            <div className="card p-5">
              <SectionHeader icon={Receipt} title="Receipt Customization" />
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Receipt Header</label>
                  <input className="input-base" value={form.receiptHeader} onChange={(e) => set('receiptHeader', e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Appears at the top of every printed receipt</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Receipt Footer / Thank-you Message</label>
                  <input className="input-base" value={form.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} />
                  <p className="text-xs text-gray-400 mt-1">Appears at the bottom — e.g. "Thank you for shopping!"</p>
                </div>
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => set('receiptShowLogo', !form.receiptShowLogo)}>
                  <Toggle checked={form.receiptShowLogo} onChange={(v) => set('receiptShowLogo', v)} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Show logo on receipt</p>
                    <p className="text-xs text-gray-400 mt-0.5">Print store logo at the top of the receipt</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Printer Settings */}
            <div className="card p-5">
              <SectionHeader icon={Printer} title="Printer Settings" />
              <div className="space-y-4">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => set('printerEnabled', !form.printerEnabled)}>
                  <Toggle checked={form.printerEnabled} onChange={(v) => set('printerEnabled', v)} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Thermal Printer Enabled</p>
                    <p className="text-xs text-gray-400 mt-0.5">Auto-print receipts after each completed transaction</p>
                  </div>
                </div>
                {form.printerEnabled && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Paper Width</label>
                    <select className="input-base" value={form.printerWidth} onChange={(e) => set('printerWidth', e.target.value)}>
                      <option value="58mm">58mm — Narrow</option>
                      <option value="80mm">80mm — Standard</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT column */}
          <div className="space-y-4">

            {/* Date & Time */}
            <div className="card p-5">
              <SectionHeader icon={Clock} title="Date & Time" />
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Date Format</label>
                    <select className="input-base" value={form.dateFormat} onChange={(e) => set('dateFormat', e.target.value)}>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (PH)</option>
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
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Timezone</label>
                  <select className="input-base" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                    <option value="Asia/Manila">Asia/Manila (GMT+8) — Philippines</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="Asia/Hong_Kong">Asia/Hong_Kong (GMT+8)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                    <option value="UTC">UTC</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Current time: {new Date().toLocaleTimeString('en-PH', {
                      timeZone: form.timezone,
                      hour: '2-digit', minute: '2-digit',
                      hour12: form.timeFormat === '12h',
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Authorization */}
            <div className="card p-5">
              <SectionHeader icon={Shield} title="Authorization Requirements" />
              <div className="space-y-4">
                {[
                  {
                    key:  'requirePinForDiscount',
                    label: 'Manager approval for custom discounts',
                    desc:  'Cashiers need manager authorization to apply manual discounts',
                  },
                  {
                    key:  'requirePinForVoid',
                    label: 'Manager approval to void transactions',
                    desc:  'All transaction voids need manager authorization',
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => set(item.key, !(form[item.key as keyof typeof form] as boolean))}
                  >
                    <Toggle
                      checked={form[item.key as keyof typeof form] as boolean}
                      onChange={(v) => set(item.key, v)}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-700">{item.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Inventory + Sync side by side */}
            <div className="grid grid-cols-2 gap-4">

              {/* Inventory */}
              <div className="card p-5">
                <SectionHeader icon={Package} title="Inventory" />
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Low Stock Threshold</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="input-base"
                    value={form.lowStockThreshold}
                    onChange={(e) => set('lowStockThreshold', e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">Products at or below this level trigger a warning</p>
                </div>
              </div>

              {/* Sync */}
              <div className="card p-5">
                <SectionHeader icon={RefreshCw} title="Sync" />
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Auto-Sync Interval</label>
                  <select className="input-base" value={form.autoSyncInterval} onChange={(e) => set('autoSyncInterval', e.target.value)}>
                    <option value="15">Every 15 sec</option>
                    <option value="30">Every 30 sec</option>
                    <option value="60">Every 1 min</option>
                    <option value="300">Every 5 min</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">How often POS syncs when online</p>
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>

      {/* ── Set / Change PIN modal ────────────────────────────────────────── */}
      <Modal open={showPinModal} onClose={() => setShowPinModal(false)} title={pinHasSet ? 'Change Override PIN' : 'Set Override PIN'}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Cashiers will enter this PIN to request your authorization when you're not at the counter.
            Use 4–8 digits.
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">New PIN</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={8}
                className="input-base pr-10"
                placeholder="••••"
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirm PIN</label>
            <input
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={8}
              className="input-base"
              placeholder="••••"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          {pinError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {pinError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowPinModal(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleSavePin}
              disabled={!pinValue || !pinConfirm || pinSaving}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {pinSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {pinHasSet ? 'Update PIN' : 'Save PIN'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Clear PIN confirm modal ───────────────────────────────────────── */}
      <Modal open={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="Remove Override PIN">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure? Cashiers will no longer be able to use your PIN to authorize voids or discounts.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowClearConfirm(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={handleClearPin}
              disabled={pinClearing}
              className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {pinClearing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Yes, Remove PIN
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
