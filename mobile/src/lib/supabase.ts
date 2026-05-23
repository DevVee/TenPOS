// ============================================================
// Supabase client — mobile/src/lib/supabase.ts
// Same project as web. Mobile uses offline-first (Dexie cache).
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    '[TenPOS Mobile] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env\n' +
    'Copy mobile/.env.example to mobile/.env and fill in your Supabase project values.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,  // No URL-based auth on mobile/Capacitor
  },
  realtime: {
    params: { eventsPerSecond: 1 },  // conserve battery on mobile
  },
})

export type SupabaseClient = typeof supabase

// Project ref for session key construction (mirrors web)
export const PROJECT_REF = 'einqluaxetbcuafxkwok'
export const SESSION_KEY = `sb-${PROJECT_REF}-auth-token`
