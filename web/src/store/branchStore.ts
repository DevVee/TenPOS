// ─────────────────────────────────────────────────────────────────────────────
// TenPOS — Active Branch Store
//
// Admins can select any branch to view analytics/data from.
// Managers and cashiers are always locked to their own branch.
// The selected branch is persisted to localStorage so it survives refresh.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BranchState {
  activeBranchId:   string | null
  activeBranchName: string | null
  setActiveBranch: (id: string | null, name: string | null) => void
  clearActiveBranch: () => void
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      activeBranchId:   null,
      activeBranchName: null,

      setActiveBranch: (id, name) =>
        set({ activeBranchId: id, activeBranchName: name }),

      clearActiveBranch: () =>
        set({ activeBranchId: null, activeBranchName: null }),
    }),
    { name: 'tenpos-active-branch', version: 1 }
  )
)
