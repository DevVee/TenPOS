// ============================================================
// Supabase client — web/src/lib/supabase.ts
//
// Usage:
//   import { supabase } from './supabase'
//   const { data, error } = await supabase.from('products').select('*')
// ============================================================

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    '[TenPOS] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env\n' +
    'Copy web/.env.example to web/.env and fill in your Supabase project values.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    // Persist session in localStorage so refresh survives page reload
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  // Realtime options — conserve bandwidth on slow connections
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
})

// ─── Type helpers ─────────────────────────────────────────────────────────────
// These will grow as we add tables. For now just the most-used ones.

export type SupabaseClient = typeof supabase
