/**
 * btPrinterPlugin.ts — Capacitor 8 compatible shim for capacitor-bluetooth-printer
 *
 * The npm package (v0.0.1) uses the old Capacitor 2 API (`registerWebPlugin`),
 * which was removed in Capacitor 3+. This file registers the same native Android
 * plugin using the current `registerPlugin` API so Vite can build without errors.
 *
 * The plugin only works on Android native. All methods return error stubs on web.
 */

import { registerPlugin } from '@capacitor/core'
import type { BluetoothPrinterPlugin } from 'capacitor-bluetooth-printer'

// Extend the base plugin type with our custom printLines method
type BluetoothPrinterPluginExtended = BluetoothPrinterPlugin & {
  printLines(options: { value: string }): Promise<{ code: number }>
}

// Web-only stub — returns sensible no-op results so the app doesn't crash in a browser.
const webStub: BluetoothPrinterPluginExtended = {
  echo: async (o) => o,
  print: async () => ({ code: -1 }),
  printLines: async () => ({ code: -1 }),
  printSelfCheck: async () => ({ code: -1 }),
  connect: async () => ({ code: -1, desc: 'Bluetooth printing is not available on web.', isConnected: false, devicesName: '' }),
  checkPrinterStatus: async () => ({ code: -1, desc: 'Not available on web' }),
  searchPairedDevices: async () => ({ code: -1 }),
}

export const BluetoothPrinter = registerPlugin<BluetoothPrinterPluginExtended>(
  'BluetoothPrinter',
  { web: async () => webStub },
)
