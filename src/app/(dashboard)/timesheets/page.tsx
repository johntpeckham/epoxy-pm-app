export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TimecardContent, Project } from '@/types'
import TimesheetsPageClient from '@/components/timesheets/TimesheetsPageClient'

export default async function TimesheetsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch active projects for the "New Timecard" dropdown
  const { data: projectRows } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'Active')
    .order('name', { ascending: true })

  // Fetch all timecard posts with joined project name
  const { data: posts } = await supabase
    .from('feed_posts')
    .select('id, project_id, created_at, content, projects(name)')
    .eq('post_type', 'timecard')
    .order('created_at', { ascending: false })

  const timecards = (posts ?? [])
    .map((row) => ({
      id: row.id,
      project_id: row.project_id,
      created_at: row.created_at,
      content: row.content as TimecardContent,
      project_name:
        (row.projects as unknown as { name: string } | null)?.name ?? 'Unknown Project',
    }))
    .sort((a, b) => {
      const dateA = a.content.date || a.created_at.slice(0, 10)
      const dateB = b.content.date || b.created_at.slice(0, 10)
      return dateB.localeCompare(dateA)
    })

  return (
    <TimesheetsPageClient
      initialTimecards={timecards}
      projects={(projectRows as Project[]) ?? []}
      userId={user.id}
    />
  )
}
