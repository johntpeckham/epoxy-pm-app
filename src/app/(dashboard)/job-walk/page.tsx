export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { requirePermission } from '@/lib/requirePermission'
import JobWalkClient, { JobWalk } from '@/components/job-walk/JobWalkClient'

export default async function JobWalkPage() {
  const { supabase, user, permissions } = await requirePermission('job_walk', 'view')

  // Join the converted-to project so the Completed-tab badge can show
  // "→ Project #XXXX" without a second roundtrip. See the leads route
  // for the same pattern + reasoning.
  const projectJoin =
    '*, converted_to_project:estimating_projects!converted_to_project_id(project_number)'

  // Main list: always scoped to the current user's own walks
  const { data: jobWalks } = await supabase
    .from('job_walks')
    .select(projectJoin)
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false })

  // Employee walks: admin only — all walks assigned to other users
  let employeeWalks: JobWalk[] = []
  if (permissions.isAdmin) {
    const { data: empData } = await supabase
      .from('job_walks')
      .select(projectJoin)
      .neq('assigned_to', user.id)
      .order('created_at', { ascending: false })
    employeeWalks = (empData as JobWalk[]) ?? []
  }

  return (
    <Suspense>
      <JobWalkClient
        initialJobWalks={(jobWalks as JobWalk[]) ?? []}
        initialEmployeeWalks={employeeWalks}
        userId={user.id}
      />
    </Suspense>
  )
}
