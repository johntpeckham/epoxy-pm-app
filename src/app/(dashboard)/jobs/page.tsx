export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requirePermission } from '@/lib/requirePermission'
import JobsLayoutClient from '@/components/jobs/JobsLayoutClient'
import { Project } from '@/types'

export default async function JobsPage() {
  const { supabase, user } = await requirePermission('jobs', 'view')

  const { data: projects, error: projectsErr } = await supabase
    .from('projects')
    .select('*, companies(id, name)')
    .order('created_at', { ascending: false })
  if (projectsErr) {
    console.error('[JOBS PAGE PROJECTS FETCH ERROR]', {
      code: projectsErr.code,
      message: projectsErr.message,
      hint: projectsErr.hint,
      details: projectsErr.details,
    })
  }

  return (
    <Suspense>
      <JobsLayoutClient
        initialProjects={(projects as Project[]) ?? []}
        userId={user.id}
      />
    </Suspense>
  )
}
