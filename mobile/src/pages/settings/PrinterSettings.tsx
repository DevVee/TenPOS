import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bluetooth, BluetoothOff, Printer, RefreshCw,
  CheckCircle2, AlertCircle, Loader2, X, ChevronLeft,
} from 'lucide-react'
import { usePrinterStore } from '../../store/printerStore'
import { scanDevices, connectDevice, disconnectDevice, testPrint, checkConnection } from '../../lib/bluetoothPrint'
import type { BTDevice } from '../../store/printerStore'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none ${
        checked ? 'bg-brand' : 'bg-gray-300'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
        checked ? 'translate-x-6' : 'translate-x-0'
      }`} />
    </button>
  )
}

export function PrinterSettings() {
  const navigate = useNavigate()
  const printer = usePrinterStore()

  const [devices,       setDevices]       = useState<BTDevice[]>([])
  const [scanning,      setScanning]      = useState(false)
  const [scanError,     setScanError]     = useState('')
  const [connectingTo,  setConnectingTo]  = useState('')
  const [connectError,  setConnectError]  = useState('')
  const [testBusy,      setTestBusy]      = useState(false)
  const [testMsg,       setTestMsg]       = useState('')
  const [disconnecting, setDisconnecting] = useState(false)

  // Check live connection status on mount
  useEffect(() => {
    if (!printer.savedDevice) return
    checkConnection()
      .then((ok) => printer.setStatus(ok ? 'connected' : 'idle'))
      .catch(() => printer.setStatus('idle'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleScan = async () => {
    setScanning(true)
    setScanError('')
    setConnectError('')
    setDevices([])
    try {
      const found = await scanDevices()
      setDevices(found)
      if (found.length === 0) {
        setScanError('No paired Bluetooth devices found. Pair your printer in Android Settings → Bluetooth first, then come back.')
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  const handleConnect = async (device: BTDevice) => {
    setConnectingTo(device.address)
    setConnectError('')
    printer.setStatus('connecting')
    try {
      const res = await connectDevice(device.address)
      if (res.isConnected || res.code === 0) {
        printer.setSavedDevice(device)
        printer.setStatus('connected')
        setDevices([])       // hide list — printer is now saved at top
        setScanError('')
      } else {
        const msg = res.desc ?? 'Could not connect. Make sure the printer is on and nearby.'
        setConnectError(msg)
        printer.setStatus('error', msg)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed'
      setConnectError(msg)
      printer.setStatus('error', msg)
    } finally {
      setConnectingTo('')
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    if (printer.savedDevice) {
      await disconnectDevice(printer.savedDevice.address)
    }
    printer.setSavedDevice(null)
    printer.setStatus('idle')
    setDevices([])
    setDisconnecting(false)
  }

  const handleTest = async () => {
    setTestBusy(true)
    setTestMsg('')
    try {
      await testPrint()
      setTestMsg('✓ Test page sent!')
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : 'Test print failed')
    } finally {
      setTestBusy(false)
      setTimeout(() => setTestMsg(''), 4000)
    }
  }

  const statusColor = {
    connected:  'text-emerald-600 bg-emerald-50 border-emerald-200',
    connecting: 'text-blue-600 bg-blue-50 border-blue-200',
    printing:   'text-blue-600 bg-blue-50 border-blue-200',
    error:      'text-red-600 bg-red-50 border-red-200',
    idle:       'text-gray-500 bg-gray-100 border-gray-200',
    scanning:   'text-gray-500 bg-gray-100 border-gray-200',
  }[printer.status]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900 leading-tight">Printer Settings</h1>
          <p className="text-xs text-gray-400">Bluetooth thermal receipt printer</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* ── Connected printer card ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Current Printer</p>
          </div>
          <div className="p-4">
            {printer.savedDevice ? (
              <div>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    printer.status === 'connected' ? 'bg-emerald-50' :
                    printer.status === 'error'     ? 'bg-red-50' : 'bg-blue-50'
                  }`}>
                    {printer.status === 'error'
                      ? <BluetoothOff className="w-5 h-5 text-red-400" />
                      : <Bluetooth className={`w-5 h-5 ${printer.status === 'connected' ? 'text-emerald-500' : 'text-blue-400'}`} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{printer.savedDevice.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{printer.savedDevice.address}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusColor} flex items-center gap-1`}>
                    {(printer.status === 'connecting' || printer.status === 'printing') && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                    {printer.status === 'connected'  && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {{
                      connected:  'Connected',
                      connecting: 'Connecting…',
                      printing:   'Printing…',
                      error:      'Error',
                      idle:       'Saved',
                      scanning:   'Scanning',
                    }[printer.status]}
                  </span>
                </div>

                {printer.status === 'error' && printer.lastError && (
                  <p className="text-xs text-red-500 mt-2 ml-13">{printer.lastError}</p>
                )}

                {testMsg && (
                  <p className={`text-xs mt-2 font-medium ${testMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>
                    {testMsg}
                  </p>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleTest}
                    disabled={testBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium text-gray-700 disabled:opacity-50"
                  >
                    {testBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                    Test Print
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 transition-colors text-sm font-medium text-red-600 disabled:opacity-50"
                  >
                    {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    Forget
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <BluetoothOff className="w-5 h-5 text-gray-300" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">No printer connected</p>
                  <p className="text-xs text-gray-400 mt-0.5">Search below to find your printer</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Paired Bluetooth Devices</p>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand disabled:opacity-50"
            >
              {scanning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Search</>
              }
            </button>
          </div>

          <div className="p-4">
            {/* Initial state */}
            {!scanning && devices.length === 0 && !scanError && (
              <div className="text-center py-6">
                <Bluetooth className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Tap "Search" to find paired printers</p>
                <p className="text-xs text-gray-300 mt-1">Pair your printer in Android Bluetooth settings first</p>
              </div>
            )}

            {/* Scanning spinner */}
            {scanning && (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <p className="text-sm text-gray-500">Searching for paired printers…</p>
              </div>
            )}

            {/* Error */}
            {scanError && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">{scanError}</p>
              </div>
            )}

            {/* Connect error */}
            {connectError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3 mt-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{connectError}</p>
              </div>
            )}

            {/* Device list */}
            {devices.length > 0 && (
              <div className="space-y-2">
                {devices.map((device) => {
                  const isThis    = connectingTo === device.address
                  const isSaved   = printer.savedDevice?.address === device.address
                  return (
                    <div key={device.address} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isSaved ? 'bg-emerald-100' : 'bg-blue-50'
                      }`}>
                        <Bluetooth className={`w-4 h-4 ${isSaved ? 'text-emerald-500' : 'text-blue-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{device.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{device.address}</p>
                      </div>
                      <button
                        onClick={() => handleConnect(device)}
                        disabled={!!connectingTo}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1 ${
                          isSaved
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-brand text-white hover:bg-brand/90'
                        }`}
                      >
                        {isThis
                          ? <><Loader2 className="w-3 h-3 animate-spin" />Connecting</>
                          : isSaved
                          ? <><CheckCircle2 className="w-3 h-3" />Connected</>
                          : 'Connect'
                        }
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Settings ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Options</p>
          </div>
          <div className="divide-y divide-gray-100">

            {/* Auto-print */}
            <div className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Auto-print after sale</p>
                <p className="text-xs text-gray-400 mt-0.5">Send receipt to printer when a transaction completes</p>
              </div>
              <Toggle checked={printer.autoprint} onChange={printer.setAutoprint} />
            </div>

            {/* Paper width */}
            <div className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Paper Width</p>
                <p className="text-xs text-gray-400 mt-0.5">Match your printer's paper roll</p>
              </div>
              <select
                className="text-sm font-medium text-gray-700 bg-gray-100 border-0 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
                value={printer.paperWidth}
                onChange={(e) => printer.setPaperWidth(e.target.value as '58mm' | '80mm')}
              >
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Help note ──────────────────────────────────────────────────── */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
          <Bluetooth className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-600 space-y-1">
            <p className="font-semibold">How to connect your printer</p>
            <p>1. Turn on your thermal printer (JK-5801H / XP-58)</p>
            <p>2. Open Android <strong>Settings → Bluetooth</strong> and pair it</p>
            <p>3. Come back here and tap <strong>Search</strong></p>
            <p>4. Tap your printer in the list to connect</p>
          </div>
        </div>

      </div>
    </div>
  )
}
