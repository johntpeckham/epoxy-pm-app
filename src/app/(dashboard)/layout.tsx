export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/ui/Sidebar'
import AuthProvider from '@/components/auth/AuthProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  // If cookies are present, fetch sidebar data server-side.
  // If cookies are missing (iOS PWA hard-refresh), skip — the client-side
  // AuthProvider will recover the session from localStorage and trigger
  // router.refresh() which re-runs this layout with valid cookies.
  const user = session?.user
  let profile: { display_name?: string; avatar_url?: string } | null = null

  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <AuthProvider>
      <div className="min-h-[100dvh] h-[100dvh] flex flex-col bg-gray-50 overflow-hidden">
        <Suspense>
          <Sidebar
            userId={user?.id ?? ''}
            userEmail={user?.email}
            displayName={profile?.display_name ?? undefined}
            avatarUrl={profile?.avatar_url ?? undefined}
          />
        </Suspense>
        {/* Main content — offset for mobile top bar (+ safe area on iOS) / desktop sidebar */}
        <div className="flex-1 min-h-0 safe-top lg:pl-56 overflow-hidden">
          <main className="h-full overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}
