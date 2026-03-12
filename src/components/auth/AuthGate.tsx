'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Rendered by the dashboard layout when the server-side cookie check fails.
 *
 * On iOS PWA cold starts, cookies are cleared but localStorage persists.
 * The vanilla @supabase/supabase-js client stores its session in localStorage,
 * so getSession() here will find it even when server cookies are gone.
 * If a session is found, we refresh so the server layout re-runs (middleware
 * will pick up the refreshed cookie on the next request). If no session
 * exists, we redirect to /login.
 */
export default function AuthGate() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Session restored from localStorage — refresh so the server layout
        // re-runs. The middleware will pick up the session on subsequent requests.
        router.refresh()
      } else {
        // No session anywhere — send to login.
        setChecked(true)
        router.replace('/login')
      }
    })
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
