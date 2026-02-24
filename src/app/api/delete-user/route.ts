import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: 'Only admins can delete users' }, { status: 403 })
  }

  const { user_id } = await request.json()

  if (!user_id || typeof user_id !== 'string') {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  if (user_id === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error: missing service role key' }, { status: 500 })
  }

  // Call Supabase Auth Admin API to delete the user
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user_id}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    }
  )

  if (!response.ok) {
    const result = await response.json().catch(() => ({ msg: 'Failed to delete user' }))
    return NextResponse.json({ error: result.msg || result.message || 'Failed to delete user' }, { status: response.status })
  }

  return NextResponse.json({ success: true })
}
