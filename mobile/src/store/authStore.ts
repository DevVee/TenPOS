import { create } from 'zustand'
import type { User } from '../types'
import { apiMe, clearTokens, getToken } from '../lib/api'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  pinLocked: boolean
  isLoading: boolean
  login: (user: User) => void
  logout: () => void
  lockPin: () => void
  unlockPin: () => void
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  pinLocked: false,
  isLoading: true,

  login: (user) => set({ user, isAuthenticated: true, pinLocked: false }),

  logout: () => {
    clearTokens()
    set({ user: null, isAuthenticated: false, pinLocked: false })
  },

  lockPin: () => set({ pinLocked: true }),
  unlockPin: () => set({ pinLocked: false }),

  restoreSession: async () => {
    const token = getToken()
    if (!token) {
      set({ isLoading: false })
      return
    }
    try {
      const me = await apiMe()
      const initials = me.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
      set({
        user: {
          id: me.id,
          name: me.name,
          email: me.email,
          role: me.role as User['role'],
          avatarInitials: initials,
          branch: 'Main Branch',
          branch_id: me.branch_id,
        },
        isAuthenticated: true,
        isLoading: false,
      })
    } catch {
      clearTokens()
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
