import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let clientInstance: SupabaseClient | null = null

/**
 * Browser-side Supabase client using @supabase/supabase-js directly.
 *
 * We bypass @supabase/ssr's createBrowserClient because it forces
 * cookie-based storage which iOS Safari clears on PWA cold starts.
 * The vanilla client uses localStorage natively, which persists
 * across full app closes on iOS.
 */
export function createClient() {
  if (clientInstance) return clientInstance

  clientInstance = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'peckham-auth-token',
        detectSessionInUrl: true,
      },
    }
  )

  return clientInstance
}
