import { create } from 'zustand'
import type { User } from '../types'
import { apiMe, clearTokens, getToken } from '../lib/api'
import { getAvatarInitials } from '@tenpos/shared'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  loginAt: string | null   // ISO timestamp of the current session start
  login: (user: User & { avatar_url?: string }) => void
  logout: () => void
  updateUser: (patch: Partial<User>) => void
  restoreSession: () => Promise<void>
}

/**
 * localStorage is used as an *offline fallback* only.
 * The source of truth is Supabase Auth user_metadata.avatar_url.
 */
function cachedAvatar(userId: string): string | undefined {
  try { return localStorage.getItem(`tenpos:avatar:${userId}`) ?? undefined } catch { return undefined }
}
function cacheAvatar(userId: string, url: string | undefined) {
  try {
    url
      ? localStorage.setItem(`tenpos:avatar:${userId}`, url)
      : localStorage.removeItem(`tenpos:avatar:${userId}`)
  } catch { /* storage full — ignore */ }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  loginAt: null,

  /** Called right after apiLogin — the API response now carries avatar_url from Supabase metadata. */
  login: (userData) => {
    const avatarUrl = userData.avatar_url ?? cachedAvatar(userData.id)
    if (avatarUrl) cacheAvatar(userData.id, avatarUrl)
    const { avatar_url: _, ...user } = userData as typeof userData & { avatar_url?: string }
    set({ user: { ...user, avatarUrl }, isAuthenticated: true, loginAt: new Date().toISOString() })
  },

  logout: () => {
    clearTokens()
    set({ user: null, isAuthenticated: false, loginAt: null })
  },

  /** Patch the in-memory user and keep localStorage in sync for offline fallback. */
  updateUser: (patch) => {
    const current = get().user
    if (!current) return
    if ('avatarUrl' in patch) cacheAvatar(current.id, patch.avatarUrl)
    set({ user: { ...current, ...patch } })
  },

  restoreSession: async () => {
    const token = getToken()
    if (!token) { set({ isLoading: false }); return }
    try {
      const me = await apiMe()
      const initials  = getAvatarInitials(me.name)
      // Prefer Supabase-stored URL; fall back to local cache for offline resilience
      const avatarUrl = me.avatar_url ?? cachedAvatar(me.id)
      if (avatarUrl) cacheAvatar(me.id, avatarUrl)  // keep cache warm
      set({
        user: {
          id:             me.id,
          name:           me.name,
          email:          me.email,
          role:           me.role as User['role'],
          avatarInitials: initials,
          branch:         me.branch_name ?? 'Unknown Branch',
          branch_id:      me.branch_id,
          avatarUrl,
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

if (typeof window !== 'undefined') {
  window.addEventListener('tenpos:logout', () => useAuthStore.getState().logout())
}
