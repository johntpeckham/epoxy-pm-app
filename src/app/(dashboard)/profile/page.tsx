export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import ProfileClient from '@/components/profile/ProfileClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return null

  const user = session.user

  // Fetch or create profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <ProfileClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialProfile={profile ?? { id: user.id, display_name: null, avatar_url: null, updated_at: new Date().toISOString() }}
    />
  )
}
