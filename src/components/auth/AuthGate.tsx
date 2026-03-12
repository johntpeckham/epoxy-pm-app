'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Rendered by the dashboard layout when the server-side session check fails.
 * On iOS PWA cold starts, cookies are often cleared while localStorage persists.
 * This component rehydrates the session from localStorage before giving up.
 */
export default function AuthGate() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Session restored from localStorage — refresh so the server layout
        // re-runs with fresh cookies set by the SDK.
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
