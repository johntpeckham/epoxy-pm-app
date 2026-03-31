import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: '/',
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        // Persist cookies well beyond the access token lifetime so the
        // refresh token survives PWA backgrounding / device restarts.
        maxAge: 60 * 60 * 24 * 400,
      },
    }
  )
}
