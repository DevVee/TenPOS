import { create } from 'zustand'

interface ThemeState {
  isDark: boolean
  toggle: () => void
  setDark: (v: boolean) => void
}

function getInitial(): boolean {
  try {
    const stored = localStorage.getItem('tenpos-theme')
    if (stored !== null) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch { return false }
}

function apply(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
  try { localStorage.setItem('tenpos-theme', isDark ? 'dark' : 'light') } catch {}
}

const initial = getInitial()
apply(initial)

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: initial,
  toggle: () => set((s) => { apply(!s.isDark); return { isDark: !s.isDark } }),
  setDark: (v) => set(() => { apply(v); return { isDark: v } }),
}))
