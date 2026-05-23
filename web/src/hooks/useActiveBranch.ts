import { useAuthStore } from '../store/authStore'
import { useBranchStore } from '../store/branchStore'

/**
 * Returns the effective branch ID for data filtering.
 * - Admin: whichever branch they've set as "active" (null = all branches)
 * - Manager / Cashier: always their own branch
 */
export function useActiveBranch(): string | null {
  const { user } = useAuthStore()
  const { activeBranchId } = useBranchStore()

  if (user?.role === 'admin') return activeBranchId
  return user?.branch_id ?? null
}
