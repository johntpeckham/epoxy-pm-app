export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requirePermission } from '@/lib/requirePermission'
import JobBoardClient from '@/components/job-board/JobBoardClient'
import { Project } from '@/types'

export default async function JobBoardPage() {
  const { supabase, user } = await requirePermission('job_board', 'view')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <Suspense>
      <JobBoardClient
        initialProjects={(projects as Project[]) ?? []}
        userId={user.id}
      />
    </Suspense>
  )
}
