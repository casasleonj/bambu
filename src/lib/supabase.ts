import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  return supabaseAdmin
}
