// ─────────────────────────────────────────────────────────────────────────────
// TenPOS — Supabase Edge Function: create-staff
//
// POST /functions/v1/create-staff
//   Body: { email: string, password: string }
//   Auth: Bearer <staff_access_token>  (admin or manager role required)
//
// DELETE /functions/v1/create-staff
//   Body: { auth_id: string }
//   Auth: Bearer <staff_access_token>  (admin role required)
//
// The service role key lives ONLY here — never in the client bundle.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY        = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
}

// Admin client — server-side only, never exposed to browsers/APKs
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

serve(async (req) => {
  // ── CORS pre-flight ───────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // ── Authenticate the caller using their JWT ──────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    // ── Verify the caller has admin or manager role ──────────────────────────
    const { data: staffRow } = await userClient
      .from('staff')
      .select('role')
      .eq('auth_id', user.id)
      .single()

    const callerRole = (staffRow as { role: string } | null)?.role ?? ''

    // ── POST — create a new Auth user ───────────────────────────────────────
    if (req.method === 'POST') {
      if (!['admin', 'manager'].includes(callerRole)) {
        return json({ error: 'Forbidden: admin or manager role required' }, 403)
      }

      const body = await req.json() as { email?: string; password?: string }
      if (!body.email || !body.password) {
        return json({ error: 'email and password are required' }, 400)
      }
      if (body.password.length < 8) {
        return json({ error: 'Password must be at least 8 characters' }, 400)
      }

      const { data: authData, error: createErr } = await adminClient.auth.admin.createUser({
        email:         body.email.toLowerCase().trim(),
        password:      body.password,
        email_confirm: true,   // bypass email confirmation — account is immediately active
      })

      if (createErr) return json({ error: createErr.message }, 400)
      return json({ auth_id: authData.user.id })
    }

    // ── DELETE — deactivate Auth user (hard-delete) ─────────────────────────
    if (req.method === 'DELETE') {
      if (callerRole !== 'admin') {
        return json({ error: 'Forbidden: admin role required to delete users' }, 403)
      }

      const body = await req.json() as { auth_id?: string }
      if (!body.auth_id) return json({ error: 'auth_id is required' }, 400)

      // Prevent self-deletion
      if (body.auth_id === user.id) {
        return json({ error: 'Cannot delete your own account' }, 400)
      }

      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(body.auth_id)
      if (deleteErr) return json({ error: deleteErr.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Internal server error' }, 500)
  }
})
