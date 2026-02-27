export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/ui/Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
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
