export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import JobsLayoutClient from '@/components/jobs/JobsLayoutClient'
import { Project } from '@/types'

export default async function JobsPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const user = session.user

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <JobsLayoutClient
      initialProjects={(projects as Project[]) ?? []}
      userId={user.id}
    />
  )
}
