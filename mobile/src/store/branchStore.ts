// ─────────────────────────────────────────────────────────────────────────────
// TenPOS Mobile — Active Branch Store
//
// Admins can select any branch to view analytics/data from.
// Managers and cashiers are always locked to their own branch.
// Persisted to localStorage via Zustand persist middleware.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BranchState {
  activeBranchId:      string | null
  activeBranchName:    string | null
  activeBranchAddress: string | null
  setActiveBranch: (id: string | null, name: string | null, address?: string | null) => void
  clearActiveBranch: () => void
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      activeBranchId:      null,
      activeBranchName:    null,
      activeBranchAddress: null,

      setActiveBranch: (id, name, address = null) =>
        set({ activeBranchId: id, activeBranchName: name, activeBranchAddress: address }),

      clearActiveBranch: () =>
        set({ activeBranchId: null, activeBranchName: null, activeBranchAddress: null }),
    }),
    { name: 'tenpos-active-branch', version: 1 }
  )
)
