import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // If the redirect target is the reset-password page, go there
      const redirectTo = next.startsWith('/reset-password')
        ? `${origin}/reset-password`
        : `${origin}${next}`
      return NextResponse.redirect(redirectTo)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
