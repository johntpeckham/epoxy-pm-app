import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  // Verify the requesting user is an admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can list users' }, { status: 403 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error: missing service role key' }, { status: 500 })
  }

  // Fetch all auth users via Supabase Admin REST API
  const authResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
    {
      method: 'GET',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    }
  )

  if (!authResponse.ok) {
    const err = await authResponse.json().catch(() => ({ msg: 'Failed to fetch users' }))
    return NextResponse.json({ error: err.msg || err.message || 'Failed to fetch users' }, { status: authResponse.status })
  }

  const authData = await authResponse.json()
  const authUsers: { id: string; email: string }[] = (authData.users ?? authData).map(
    (u: { id: string; email?: string }) => ({ id: u.id, email: u.email ?? '' })
  )

  // Fetch all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role')

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null; role: string }) => [p.id, p])
  )

  // Merge: every auth user gets profile data if it exists, otherwise defaults
  const users = authUsers.map((authUser) => {
    const p = profileMap.get(authUser.id)
    return {
      id: authUser.id,
      email: authUser.email,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      role: p?.role ?? 'crew',
    }
  })

  return NextResponse.json({ users })
}
