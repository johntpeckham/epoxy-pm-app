export const dynamic = 'force-dynamic'

import { FootprintsIcon } from 'lucide-react'
import Link from 'next/link'
import { requirePermission } from '@/lib/requirePermission'
import JobWalkDetailClient from '@/components/job-walk/JobWalkDetailClient'
import type { JobWalk } from '@/components/job-walk/JobWalkClient'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function JobWalkDetailPage({ params }: PageProps) {
  const { supabase, user } = await requirePermission('job_walk', 'view')
  const { id } = await params

  const { data: walk } = await supabase
    .from('job_walks')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!walk) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FootprintsIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Job walk not found</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            This job walk doesn&apos;t exist or has been deleted.
          </p>
          <Link
            href="/job-walk"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition"
          >
            Back to Job Walk
          </Link>
        </div>
      </div>
    )
  }

  const [{ data: custData }, { data: profData }, { data: permsData }] = await Promise.all([
    supabase
      .from('companies')
      .select('*')
      .eq('archived', false)
      .order('name', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .order('display_name', { ascending: true }),
    supabase
      .from('user_permissions')
      .select('user_id')
      .eq('feature', 'job_walk')
      .eq('access_level', 'full'),
  ])

  const customers = (custData ?? []) as Customer[]
  const jobWalkEditIds = new Set(
    ((permsData ?? []) as { user_id: string }[]).map((p) => p.user_id)
  )
  const assignees: AppointmentAssigneeOption[] = (
    (profData ?? []) as { id: string; display_name: string | null; role: string }[]
  )
    .filter((p) => p.role === 'admin' || jobWalkEditIds.has(p.id))
    .map((p) => ({ id: p.id, display_name: p.display_name }))

  return (
    <JobWalkDetailClient
      initialWalk={walk as JobWalk}
      customers={customers}
      assignees={assignees}
      userId={user.id}
    />
  )
}
