export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CalendarEvent } from '@/types'
import type { UserRole } from '@/types'
import CalendarPageClient from '@/components/calendar/CalendarPageClient'

export default async function CalendarPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: events }, { data: profile }] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .order('start_date', { ascending: true }),
    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single(),
  ])

  return (
    <CalendarPageClient
      initialEvents={(events as CalendarEvent[]) ?? []}
      userId={user.id}
      userRole={(profile?.role as UserRole) ?? 'crew'}
    />
  )
}
