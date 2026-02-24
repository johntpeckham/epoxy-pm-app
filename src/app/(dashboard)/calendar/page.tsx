export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CalendarEvent } from '@/types'
import CalendarPageClient from '@/components/calendar/CalendarPageClient'

export default async function CalendarPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: events } = await supabase
    .from('calendar_events')
    .select('*')
    .order('start_date', { ascending: true })

  return (
    <CalendarPageClient
      initialEvents={(events as CalendarEvent[]) ?? []}
      userId={user.id}
    />
  )
}
