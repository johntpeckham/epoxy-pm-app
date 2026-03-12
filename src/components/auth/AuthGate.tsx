'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, SESSION_BACKUP_KEY } from '@/lib/supabase/client'

/**
 * Rendered by the dashboard layout when the server-side session check fails.
 *
 * On iOS PWA cold starts, Safari clears cookies but preserves localStorage.
 * Since @supabase/ssr stores sessions in cookies only, the server sees no
 * session. This component attempts to restore the session from a localStorage
 * backup before giving up and redirecting to /login.
 *
 * Flow:
 * 1. Try getSession() — if cookies somehow still have the session, refresh.
 * 2. Check localStorage backup — call setSession() to restore tokens and
 *    re-write cookies, then refresh so the server layout picks them up.
 * 3. If nothing works, redirect to /login.
 */
export default function AuthGate() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    async function restoreSession() {
      // 1. Check if the SDK already has a session (cookies intact)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.refresh()
        return
      }

      // 2. No cookies — try the localStorage backup (iOS PWA cold start)
      try {
        const stored = localStorage.getItem(SESSION_BACKUP_KEY)
        if (stored) {
          const { access_token, refresh_token } = JSON.parse(stored)
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            })
            if (!error) {
              // Session restored and cookies re-written by the SDK.
              // Refresh so the server layout re-runs with valid cookies.
              router.refresh()
              return
            }
            // Tokens were invalid/expired — clear the stale backup
            localStorage.removeItem(SESSION_BACKUP_KEY)
          }
        }
      } catch {
        // localStorage unavailable or corrupt — fall through to login
      }

      // 3. No session anywhere — redirect to login
      setChecked(true)
      router.replace('/login')
    }

    restoreSession()
  }, [router])

  if (checked) return null

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Restoring session…</p>
      </div>
    </div>
  )
}
