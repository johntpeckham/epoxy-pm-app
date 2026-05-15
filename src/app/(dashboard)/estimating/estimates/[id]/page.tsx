export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import { redirect } from 'next/navigation'
import EstimateDetailClient from '@/components/sales/estimating/estimates/EstimateDetailClient'
import type { EstimateArea, EstimateAreaMeasurement } from '@/components/sales/estimating/types'

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

  // Fetch areas + section measurements for this estimate. Tables are new in
  // migration 20260552; their absence (pre-migration) returns an error we
  // surface as empty arrays so the page still renders cleanly.
  const [{ data: areasRaw, error: areasErr }, { data: sectionsRaw, error: sectionsErr }] = await Promise.all([
    supabase
      .from('estimate_areas')
      .select('*')
      .eq('estimate_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('estimate_area_measurements')
      .select('*, estimate_areas!inner(estimate_id)')
      .eq('estimate_areas.estimate_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])
  if (areasErr) console.error('Failed to fetch estimate_areas', { code: areasErr.code, message: areasErr.message, hint: areasErr.hint, details: areasErr.details })
  if (sectionsErr) console.error('Failed to fetch estimate_area_measurements', { code: sectionsErr.code, message: sectionsErr.message, hint: sectionsErr.hint, details: sectionsErr.details })

  const initialAreas = (areasRaw ?? []) as EstimateArea[]
  // Drop the join column so the section rows match the EstimateAreaMeasurement shape.
  const initialSections = ((sectionsRaw ?? []) as Array<EstimateAreaMeasurement & { estimate_areas?: unknown }>).map(
    ({ estimate_areas: _ignored, ...rest }) => rest as EstimateAreaMeasurement
  )

  return (
    <EstimateDetailClient
      estimate={estimate}
      projectName={project?.name ?? 'Unknown project'}
      projectId={project?.id ?? ''}
      customerId={project?.company_id ?? ''}
      customerName={customer?.name ?? 'Unknown customer'}
      initialAreas={initialAreas}
      initialSections={initialSections}
    />
  )
}
