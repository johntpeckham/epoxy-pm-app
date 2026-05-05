export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requirePermission } from '@/lib/requirePermission'
import JobWalkClient, { JobWalk } from '@/components/job-walk/JobWalkClient'

export default async function JobWalkPage() {
  const { supabase, user, permissions } = await requirePermission('job_walk', 'view')

  const jwQuery = supabase.from('job_walks').select('*').order('created_at', { ascending: false })
  // Non-admins only see job walks assigned to them.
  if (!permissions.isAdmin) jwQuery.eq('assigned_to', user.id)
  const { data: jobWalks } = await jwQuery

  return (
    <Suspense>
      <JobWalkClient
        initialJobWalks={(jobWalks as JobWalk[]) ?? []}
        userId={user.id}
      />
    </Suspense>
  )
}
