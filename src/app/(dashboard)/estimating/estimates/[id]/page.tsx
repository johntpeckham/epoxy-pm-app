export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import { redirect } from 'next/navigation'
import EstimateDetailClient from '@/components/sales/estimating/estimates/EstimateDetailClient'

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase } = await requirePermission('estimating', 'view')

  const { data: estimate } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', id)
    .single()

  if (!estimate) return redirect('/estimating')

  const { data: project } = await supabase
    .from('estimating_projects')
    .select('*')
    .eq('id', estimate.project_id)
    .single()

  const { data: customer } = project?.company_id
    ? await supabase
        .from('companies')
        .select('*')
        .eq('id', project.company_id)
        .single()
    : { data: null }

  return (
    <EstimateDetailClient
      estimate={estimate}
      projectName={project?.name ?? 'Unknown project'}
      projectId={project?.id ?? ''}
      customerId={project?.company_id ?? ''}
      customerName={customer?.name ?? 'Unknown customer'}
    />
  )
}
