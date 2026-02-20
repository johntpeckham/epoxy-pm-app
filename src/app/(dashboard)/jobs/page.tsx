export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import JobsLayoutClient from '@/components/jobs/JobsLayoutClient'
import { Project } from '@/types'

export default async function JobsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
