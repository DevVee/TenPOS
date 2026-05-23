import { create } from 'zustand'
import type { User } from '../types'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { clearTokens } from '../lib/api'
import { stopSyncLoop } from '../lib/sync'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  pinLocked: boolean
  isLoading: boolean
  login: (user: User) => void
  logout: () => void
  lockPin: () => void
  unlockPin: () => void
  updateUser: (patch: Partial<User>) => void
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  pinLocked: false,
  isLoading: true,

  login: (user) => set({ user, isAuthenticated: true, pinLocked: false }),

  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),

  logout: () => {
    stopSyncLoop()   // M-9: stop background sync before clearing session
    clearTokens()
    set({ user: null, isAuthenticated: false, pinLocked: false })
  },

  lockPin: () => set({ pinLocked: true }),
  unlockPin: () => set({ pinLocked: false }),

  restoreSession: async () => {
    try {
      // getSession() validates JWT locally — no network needed
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        set({ isLoading: false })
        return
      }

      // Try Dexie cache first (works fully offline)
      const cachedStaff = await db.staff.where('auth_id').equals(session.user.id).first()
      if (cachedStaff) {
        const initials = cachedStaff.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()

        set({
          user: {
            id:             cachedStaff.id,
            name:           cachedStaff.name,
            email:          cachedStaff.email,
            role:           cachedStaff.role as User['role'],
            avatarInitials: initials,
            branch:         cachedStaff.branch_name ?? 'Unknown Branch',
            branch_id:      cachedStaff.branch_id,
          },
          isAuthenticated: true,
          isLoading: false,
        })
        return
      }

      // No Dexie cache yet — need network to fetch staff row
      if (!navigator.onLine) {
        // Can't restore without cache and without network
        set({ isLoading: false })
        return
      }

      const { data: staff, error: staffErr } = await supabase
        .from('staff')
        .select('id, name, email, role, branch_id, status, sales_count, branches(name)')
        .eq('auth_id', session.user.id)
        .single()

      if (staffErr || !staff) {
        set({ isLoading: false })
        return
      }

      const s = staff as Record<string, unknown>
      const branchName = ((s.branches as { name: string } | null)?.name) ?? undefined

      // Warm the Dexie cache
      await db.staff.put({
        id:          s.id as string,
        auth_id:     session.user.id,
        name:        s.name as string,
        email:       (s.email as string | null) ?? (session.user.email ?? ''),
        role:        s.role as string,
        branch_id:   s.branch_id as string | null,
        branch_name: branchName,
        status:      s.status as string,
        sales_count: Number(s.sales_count ?? 0),
        cached_at:   Date.now(),
      })

      const initials = (s.name as string)
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

      set({
        user: {
          id:             s.id as string,
          name:           s.name as string,
          email:          (s.email as string | null) ?? (session.user.email ?? ''),
          role:           s.role as User['role'],
          avatarInitials: initials,
          branch:         branchName ?? 'Unknown Branch',
          branch_id:      s.branch_id as string | null,
        },
        isAuthenticated: true,
        isLoading: false,
      })
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },
}))

// Forced logout from api.ts (session expired)
if (typeof window !== 'undefined') {
  window.addEventListener('tenpos:logout', () => {
    useAuthStore.getState().logout()
  })
}
