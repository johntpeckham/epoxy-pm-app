export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import JobBoardClient from '@/components/job-board/JobBoardClient'
import { Project } from '@/types'

export default async function JobBoardPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const user = session.user

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
