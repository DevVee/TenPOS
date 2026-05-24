import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PrinterStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'printing' | 'error'

export interface BTDevice {
  name: string
  address: string
}

interface PrinterState {
  savedDevice: BTDevice | null
  autoprint: boolean
  paperWidth: '58mm' | '80mm'
  // Runtime (not persisted):
  status: PrinterStatus
  lastError: string
  // Actions:
  setSavedDevice: (device: BTDevice | null) => void
  setAutoprint: (v: boolean) => void
  setPaperWidth: (v: '58mm' | '80mm') => void
  setStatus: (status: PrinterStatus, err?: string) => void
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      savedDevice: null,
      autoprint: false,
      paperWidth: '58mm',
      status: 'idle',
      lastError: '',
      setSavedDevice: (savedDevice) => set({ savedDevice, status: 'idle', lastError: '' }),
      setAutoprint: (autoprint) => set({ autoprint }),
      setPaperWidth: (paperWidth) => set({ paperWidth }),
      setStatus: (status, lastError = '') => set({ status, lastError }),
    }),
    {
      name: 'tenpos-printer',
      partialize: (state) => ({
        savedDevice: state.savedDevice,
        autoprint: state.autoprint,
        paperWidth: state.paperWidth,
      }),
    },
  ),
)
