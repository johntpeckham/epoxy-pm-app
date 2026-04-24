export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import { CalendarEvent, Project } from '@/types'
import type { UserRole } from '@/types'
import CalendarPageClient from '@/components/calendar/CalendarPageClient'

export default async function CalendarPage() {
  const { supabase, user, permissions } = await requirePermission('calendar', 'view')

  const [{ data: events }, { data: projects }] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*')
      .order('start_date', { ascending: true }),
    supabase
      .from('projects')
      .select('*')
      .order('name', { ascending: true }),
  ])

  return (
    <CalendarPageClient
      initialEvents={(events as CalendarEvent[]) ?? []}
      initialProjects={(projects as Project[]) ?? []}
      userId={user.id}
      userRole={(permissions.role as UserRole) ?? 'crew'}
    />
  )
}
