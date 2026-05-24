/**
 * bluetoothPrint.ts — Bluetooth thermal printer integration (Android / Capacitor)
 *
 * Uses the `capacitor-bluetooth-printer` plugin for Bluetooth Classic (SPP) printers.
 *
 * Print path: pre-formatted plain text → printLines() → myPrinter.printText() (ESC/POS)
 *
 * We bypass CustomUtil / bitmap rendering entirely. The printer's native ESC/POS font
 * is always the correct small monospace size for a thermal receipt. Bitmap rendering
 * scales with Android screen DPI and produces oversized output.
 */

import { BluetoothPrinter as BTPrinter } from './btPrinterPlugin'
import type { ThermalReceiptData } from './thermalPrint'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BTDevice {
  name: string
  address: string
}

interface BTPairedDevice { deviceName: string; deviceAddress: string }
interface PairedDevicesResult {
  code: number
  desc?: string
  pairedList?: BTPairedDevice[] | Record<string, BTPairedDevice>
}

interface ConnectResult {
  code: number
  desc?: string
  isConnected: boolean
  devicesName?: string
}

// ── Text layout helpers ───────────────────────────────────────────────────────

/** Characters per line for each paper width at ESC/POS default font */
const CHARS: Record<'58mm' | '80mm', number> = { '58mm': 32, '80mm': 48 }

/** Left-right padded row. Truncates left if it won't fit. */
function padLine(left: string, right: string, width: number): string {
  const maxLeft = width - right.length - 1
  if (left.length > maxLeft) left = left.substring(0, Math.max(0, maxLeft - 1)) + '.'
  const spaces = width - left.length - right.length
  return left + ' '.repeat(Math.max(1, spaces)) + right
}

/** Center a string within a fixed width using spaces. */
function centerPad(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width)
  const totalPad = width - text.length
  const left = Math.floor(totalPad / 2)
  return ' '.repeat(left) + text + ' '.repeat(totalPad - left)
}

/** Peso amount — "Php" prefix because ₱ is outside ASCII/Latin-1 */
function php(n: number): string {
  return `Php${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
}

// ── Receipt text builder ──────────────────────────────────────────────────────

/**
 * Builds a pre-formatted plain-text receipt string.
 * Sent directly to the printer via printText() (ESC/POS native font).
 * No bitmaps, no Android canvas, no DPI scaling — just tiny monospace text.
 */
export function buildReceiptText(
  data: ThermalReceiptData,
  paperWidth: '58mm' | '80mm' = '58mm',
): string {
  const W = CHARS[paperWidth]
  const lines: string[] = []
  const sep  = () => lines.push('-'.repeat(W))
  const feed = (n: number) => { for (let i = 0; i < n; i++) lines.push('') }

  // ESC/POS control bytes
  const ESC_INIT   = '\x1B\x40'       // ESC @     — initialize / reset printer to defaults
  const GS_NORMAL  = '\x1D\x21\x00'   // GS ! 0    — normal character size
  const ESC_LEFT   = '\x1B\x61\x00'   // ESC a 0   — left align
  // Line spacing: ESC 3 36 sets 36 dots per line (36/203" ≈ 4.5 mm).
  // Default after ESC@ is ~30 dots (~3.75 mm) which feels cramped.
  // 4.5 mm gives items and rows visible breathing room without wasting paper.
  const ESC_SPACING = '\x1B\x33\x24'  // ESC 3 36  — 4.5 mm line spacing

  // Paper cut: GS V B 0 — partial cut (most printers support this; full cut is GS V 0).
  // Executed after the paper-feed lines so the last content is past the cutter blade.
  const GS_CUT    = '\x1D\x56\x42\x00'

  // Cash drawer: ESC p pin=0 on=25 ms off=250 ms.
  // Sent after cut so the drawer fires once the receipt is detached.
  const ESC_DRAWER = '\x1B\x70\x00\x19\xFA'

  // ESC/POS bold on/off (non-printable — doesn't affect centerPad width)
  const BOLD_ON  = '\x1B\x45\x01'
  const BOLD_OFF = '\x1B\x45\x00'

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(BOLD_ON + centerPad(data.storeName, W) + BOLD_OFF)
  if (data.address)    lines.push(centerPad(data.address, W))
  if (data.branchName) lines.push(centerPad(data.branchName, W))
  sep()

  // ── Receipt info ─────────────────────────────────────────────────────────
  lines.push(`Receipt #: ${data.receiptNo}`)
  lines.push(`Date: ${data.date}`)
  if (data.cashierName) lines.push(`Served by: ${data.cashierName}`)
  sep()

  // ── Items ─────────────────────────────────────────────────────────────────
  // Each item is two lines (name + qty/price). A blank line after every item
  // prevents consecutive items from running together on the receipt.
  for (const item of data.items) {
    const nameMaxLen = W - 1
    const name = item.name.length > nameMaxLen
      ? item.name.substring(0, nameMaxLen - 1) + '.'
      : item.name
    lines.push(name)
    const detail = `  ${item.qty} x ${php(item.price)}${item.discount > 0 ? ` (-${php(item.discount)})` : ''}`
    lines.push(padLine(detail, php(item.total), W))
    lines.push('')  // item spacer — separates adjacent items visually
  }
  sep()

  // ── Totals ────────────────────────────────────────────────────────────────
  lines.push(padLine('Subtotal', php(data.subtotal), W))
  if (data.voucherDiscount && data.voucherDiscount > 0) {
    const label = data.voucherCode ? `Voucher (${data.voucherCode})` : 'Discount'
    lines.push(padLine(label, `-${php(data.voucherDiscount)}`, W))
  }
  sep()
  lines.push(padLine('TOTAL', php(data.total), W))
  sep()

  // ── Payment ───────────────────────────────────────────────────────────────
  lines.push(padLine(data.method.toUpperCase(), php(data.paid), W))
  if (data.change > 0) lines.push(padLine('CHANGE', php(data.change), W))
  sep()

  // ── Footer ────────────────────────────────────────────────────────────────
  lines.push(centerPad(data.footer ?? 'Thank you for your purchase!', W))
  lines.push(centerPad('Please come again!', W))
  if (data.transactionId) lines.push(centerPad(`Ref: ${data.transactionId}`, W))

  // Paper feed before cut.
  // 58mm printers typically have the cutter 20–30 mm from the print head.
  // 7 lines × 4.5 mm/line ≈ 31 mm — enough to clear even far-set cutters.
  feed(7)

  // Sequence: content → feed → cut → drawer
  return ESC_INIT + GS_NORMAL + ESC_LEFT + ESC_SPACING
    + lines.join('\n') + '\n'
    + GS_CUT
    + ESC_DRAWER
}

// ── Plugin wrappers ───────────────────────────────────────────────────────────

/**
 * Returns devices already paired with Android Bluetooth.
 * User must pair the printer in Android Settings → Bluetooth first.
 */
export async function scanDevices(): Promise<BTDevice[]> {
  const result = (await BTPrinter.searchPairedDevices()) as PairedDevicesResult
  if (result.code !== 0) {
    throw new Error(result.desc ?? 'Bluetooth scan failed. Make sure Bluetooth is enabled.')
  }
  if (!result.pairedList) return []
  const list: BTPairedDevice[] = Array.isArray(result.pairedList)
    ? result.pairedList
    : Object.values(result.pairedList)
  return list
    .filter((d) => d?.deviceAddress)
    .map((d) => ({ name: d.deviceName || 'Unknown Device', address: d.deviceAddress }))
}

/** Connect to a Bluetooth printer by MAC address. */
export async function connectDevice(address: string): Promise<ConnectResult> {
  const result = (await BTPrinter.connect({
    connect: true,
    devicesAddress: address,
  })) as ConnectResult
  return result
}

/** Disconnect. Silently ignores errors. */
export async function disconnectDevice(address: string): Promise<void> {
  await BTPrinter.connect({ connect: false, devicesAddress: address }).catch(() => {})
}

/**
 * Check whether the printer is currently connected.
 * code 1 = explicitly "not connected" in Java; negative = hardware status (still connected).
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const result = await BTPrinter.checkPrinterStatus()
    return result.code !== 1
  } catch {
    return false
  }
}

/** Print a small test receipt to verify the connection. */
export async function testPrint(): Promise<void> {
  const testData: ThermalReceiptData = {
    storeName:  'TenPOS',
    branchName: 'Printer Test',
    receiptNo:  'TEST-001',
    date:       new Date().toLocaleString('en-PH'),
    items:      [{ name: 'Test Item', qty: 1, price: 1.00, discount: 0, total: 1.00 }],
    subtotal:   1.00,
    total:      1.00,
    paid:       1.00,
    change:     0,
    method:     'CASH',
    footer:     '*** Printer is working! ***',
  }
  await printBluetooth(testData)
}

/**
 * Print a receipt over Bluetooth using the printer's native ESC/POS text font.
 * Much smaller and crisper than bitmap rendering.
 */
export async function printBluetooth(
  data: ThermalReceiptData,
  paperWidth: '58mm' | '80mm' = '58mm',
): Promise<void> {
  const text = buildReceiptText(data, paperWidth)
  const result = await BTPrinter.printLines({ value: text })
  if (result.code !== 0) throw new Error(`Bluetooth print failed (code ${result.code})`)
}
