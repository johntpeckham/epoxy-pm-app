export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requirePermission } from '@/lib/requirePermission'
import JobBoardClient from '@/components/job-board/JobBoardClient'
import { Project } from '@/types'

export default async function JobBoardPage() {
  const { supabase, user } = await requirePermission('job_board', 'view')

  const { data: projects, error: projectsErr } = await supabase
    .from('projects')
    .select('*, companies(id, name)')
    .order('created_at', { ascending: false })
  if (projectsErr) {
    console.error('[JOB BOARD PROJECTS FETCH ERROR]', {
      code: projectsErr.code,
      message: projectsErr.message,
      hint: projectsErr.hint,
      details: projectsErr.details,
    })
  }

  return (
    <Suspense>
      <JobBoardClient
        initialProjects={(projects as Project[]) ?? []}
        userId={user.id}
      />
    </Suspense>
  )
}
