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
    return NextResponse.json({ error: 'Only admins can invite users' }, { status: 403 })
  }

  const { email } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error: missing service role key' }, { status: 500 })
  }

  // Call Supabase Auth Admin API directly with service role key as Bearer token
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ email }),
  })

  if (!response.ok) {
    const result = await response.json().catch(() => ({ msg: 'Failed to invite user' }))
    return NextResponse.json({ error: result.msg || result.message || 'Failed to invite user' }, { status: response.status })
  }

  return NextResponse.json({ success: true })
}
