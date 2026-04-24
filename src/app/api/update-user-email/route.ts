import { createClient } from '@/lib/supabase/server'
import { getUserPermissions } from '@/lib/getUserPermissions'
import { NextRequest, NextResponse } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getUserPermissions(supabase, user.id)
  if (!permissions.canEdit('user_management')) {
    return NextResponse.json({ error: 'Insufficient permissions to update user emails' }, { status: 403 })
  }

  const { user_id, new_email } = await request.json()

  if (!user_id || typeof user_id !== 'string' || !UUID_RE.test(user_id)) {
    return NextResponse.json({ error: 'A valid user_id is required' }, { status: 400 })
  }

  if (!new_email || typeof new_email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const email = new_email.trim()
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error: missing service role key' }, { status: 500 })
  }

  // email_confirm: true marks the address as already verified so Supabase
  // doesn't send a confirmation email to the new address — this is the
  // admin-override pattern, same shape as create-user / update-user-password.
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${user_id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ email, email_confirm: true }),
    }
  )

  if (!response.ok) {
    const result = await response.json().catch(() => ({ msg: 'Failed to update email' }))
    return NextResponse.json({ error: result.msg || result.message || 'Failed to update email' }, { status: response.status })
  }

  return NextResponse.json({ success: true, email })
}
