'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'

const STORAGE_KEY = 'peckham-auth-backup'

/**
 * Client-side auth guard with localStorage backup.
 *
 * Primary auth lives in cookies (for SSR).  On iOS standalone PWAs cookies
 * can vanish on hard-refresh, so we keep a backup of the refresh + access
 * tokens in localStorage.  On mount we:
 *
 *  1. Check cookies via supabase.auth.getSession()
 *  2. If cookies are gone, attempt to restore from the localStorage backup
 *     via supabase.auth.setSession() — which also re-sets cookies
 *  3. After recovery, call router.refresh() so server components re-run
 *     with the now-valid cookies
 *  4. If neither source has a session, redirect to /login
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const recovering = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function checkAuth() {
      // 1. Try cookie-based session (normal path, works on desktop)
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        // Cookies are fine — keep localStorage backup fresh
        persistBackup(session.access_token, session.refresh_token)
        if (!cancelled) setIsReady(true)
        return
      }

      // 2. No cookie session — try localStorage recovery (iOS PWA path)
      if (!recovering.current) {
        recovering.current = true
        const restored = await tryRecover()
        if (restored) {
          // Session restored, cookies re-set.  Refresh server components.
          router.refresh()
          if (!cancelled) setIsReady(true)
          return
        }
      }

      // 3. Nothing worked — send to login
      if (!cancelled) router.replace('/login')
    }

    async function tryRecover(): Promise<boolean> {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return false

        const { access_token, refresh_token } = JSON.parse(raw)
        if (!access_token || !refresh_token) return false

        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        })

        if (data.session && !error) {
          persistBackup(data.session.access_token, data.session.refresh_token)
          return true
        }

        // Tokens were stale — clean up
        localStorage.removeItem(STORAGE_KEY)
        return false
      } catch {
        localStorage.removeItem(STORAGE_KEY)
        return false
      }
    }

    checkAuth()

    // Keep localStorage backup in sync with every auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          persistBackup(session.access_token, session.refresh_token)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      },
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isReady) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-[#1a1a1a]">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}

function persistBackup(accessToken: string, refreshToken: string) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    )
  } catch {
    // Storage full or unavailable — not critical
  }
}
