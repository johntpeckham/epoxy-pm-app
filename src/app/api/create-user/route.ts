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
    return NextResponse.json({ error: 'Only admins can create users' }, { status: 403 })
  }

  const { email, password, display_name, role } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  if (!display_name || typeof display_name !== 'string') {
    return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
  }

  const validRoles = ['admin', 'salesman', 'foreman', 'crew']
  if (!role || !validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error: missing service role key' }, { status: 500 })
  }

  // Create the user via Supabase Auth Admin API
  const authResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    }
  )

  if (!authResponse.ok) {
    const result = await authResponse.json().catch(() => ({ msg: 'Failed to create user' }))
    return NextResponse.json({ error: result.msg || result.message || 'Failed to create user' }, { status: authResponse.status })
  }

  const authUser = await authResponse.json()

  // Upsert the profile with display_name and role
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: authUser.id,
      display_name: display_name.trim(),
      role,
      updated_at: new Date().toISOString(),
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message || 'User created but failed to set profile' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    user: {
      id: authUser.id,
      email: authUser.email,
      email_confirmed_at: authUser.email_confirmed_at,
      display_name: display_name.trim(),
      avatar_url: null,
      role,
    },
  })
}
