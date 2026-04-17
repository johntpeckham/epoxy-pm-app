export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import TakeoffDetailClient from '@/components/sales/estimating/takeoff/TakeoffDetailClient'

export default async function TakeoffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data: takeoff } = await supabase
    .from('takeoffs')
    .select('*')
    .eq('id', id)
    .single()

  if (!takeoff) return redirect('/sales/estimating')

  const { data: project } = await supabase
    .from('estimating_projects')
    .select('*')
    .eq('id', takeoff.project_id)
    .single()

  const { data: customer } = project?.company_id
    ? await supabase
        .from('companies')
        .select('*')
        .eq('id', project.company_id)
        .single()
    : { data: null }

  return (
    <TakeoffDetailClient
      takeoff={takeoff}
      projectName={project?.name ?? 'Unknown project'}
      projectId={project?.id ?? ''}
      customerId={project?.company_id ?? ''}
      customerName={customer?.name ?? 'Unknown customer'}
    />
  )
}
