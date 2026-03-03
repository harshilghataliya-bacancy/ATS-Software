import { createClient, type SupabaseClient } from '@supabase/supabase-js'

declare global {
  // eslint-disable-next-line no-var
  var __atsSupabaseAdmin__: SupabaseClient | undefined
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

export function getAdminClient(): SupabaseClient {
  const existing = globalThis.__atsSupabaseAdmin__
  if (existing) return existing

  const client = createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  globalThis.__atsSupabaseAdmin__ = client
  return client
}

// Backwards-compatible alias (minimal change): existing code imports `createAdminClient()`.
export function createAdminClient(): SupabaseClient {
  return getAdminClient()
}
