import { createBrowserClient } from '@supabase/ssr'

/**
 * Key used to back up session tokens to localStorage.
 * On iOS PWA cold starts, Safari clears cookies but preserves localStorage.
 * The @supabase/ssr browser client stores sessions in document.cookie only,
 * so we mirror tokens to localStorage as a recovery mechanism.
 */
export const SESSION_BACKUP_KEY = 'sb-session-backup'

let listenerAttached = false

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Set up a one-time listener that mirrors session tokens to localStorage
  // whenever auth state changes (login, token refresh, logout).
  if (!listenerAttached && typeof window !== 'undefined') {
    listenerAttached = true
    client.auth.onAuthStateChange((_event, session) => {
      try {
        if (session) {
          localStorage.setItem(
            SESSION_BACKUP_KEY,
            JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            })
          )
        } else {
          localStorage.removeItem(SESSION_BACKUP_KEY)
        }
      } catch {
        // localStorage unavailable — nothing we can do
      }
    })
  }

  return client
}
