export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import JobWalkClient, { JobWalk } from '@/components/job-walk/JobWalkClient'

export default async function JobWalkPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role ?? 'crew') as UserRole

  if (
    userRole !== 'admin' &&
    userRole !== 'office_manager' &&
    userRole !== 'salesman'
  ) {
    return redirect('/my-work')
  }

  const jwQuery = supabase.from('job_walks').select('*').order('created_at', { ascending: false })
  if (userRole !== 'admin') jwQuery.eq('assigned_to', user.id)
  const { data: jobWalks } = await jwQuery

  return (
    <Suspense>
      <JobWalkClient
        initialJobWalks={(jobWalks as JobWalk[]) ?? []}
        userId={user.id}
        userRole={userRole}
      />
    </Suspense>
  )
}
