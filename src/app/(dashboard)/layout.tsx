export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/ui/Sidebar'
import AuthGate from '@/components/auth/AuthGate'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // On iOS PWA cold starts, cookies are wiped but localStorage still has the
  // session. Instead of hard-redirecting to /login, render a client component
  // that rehydrates the session from localStorage and refreshes the page.
  if (!user) {
    return <AuthGate />
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col bg-gray-50 overflow-hidden">
      <Sidebar
        userId={user.id}
        userEmail={user.email}
        displayName={profile?.display_name ?? undefined}
        avatarUrl={profile?.avatar_url ?? undefined}
      />
      {/* Main content — offset for mobile top bar (+ safe area on iOS) / desktop sidebar */}
      <div className="flex-1 min-h-0 safe-top lg:pl-56 overflow-hidden">
        <main className="h-full overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
