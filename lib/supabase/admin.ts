import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client. Bypasses RLS. NEVER import this into a client component.
// Used only by the detached review pipeline, which has no user cookie.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
