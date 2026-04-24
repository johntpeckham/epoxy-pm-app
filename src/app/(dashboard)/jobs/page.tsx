export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requirePermission } from '@/lib/requirePermission'
import JobsLayoutClient from '@/components/jobs/JobsLayoutClient'
import { Project } from '@/types'

export default async function JobsPage() {
  const { supabase, user } = await requirePermission('jobs', 'view')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <Suspense>
      <JobsLayoutClient
        initialProjects={(projects as Project[]) ?? []}
        userId={user.id}
      />
    </Suspense>
  )
}
