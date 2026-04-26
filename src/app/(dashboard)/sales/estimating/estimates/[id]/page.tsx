export const dynamic = 'force-dynamic'

import { CalculatorIcon } from 'lucide-react'
import Link from 'next/link'
import { requirePermission } from '@/lib/requirePermission'
import EstimateEditorClient from '@/components/sales/estimating/EstimateEditorClient'
import {
  DEFAULT_TERMS,
  type Customer,
  type Estimate,
  type EstimateSettings,
} from '@/components/estimates/types'
import type { EstimatingProject } from '@/components/sales/estimating/types'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ project?: string; customer?: string }>
}

interface FormSettings {
  default_terms: string | null
  default_notes: string | null
  default_tax_rate: number | null
  default_salesperson_id: string | null
}

function NotFoundState({
  backHref,
}: {
  backHref: string
}) {
  return (
    <div className="flex items-center justify-center h-full bg-gray-50 p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CalculatorIcon className="w-7 h-7 text-gray-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Proposal not found</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">
          This proposal doesn&apos;t exist or has been deleted.
        </p>
        <Link
          href={backHref}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition"
        >
          Back to Estimating
        </Link>
      </div>
    </div>
  )
}

export default async function EstimateEditorPage({
  params,
  searchParams,
}: PageProps) {
  const { supabase, user, permissions } = await requirePermission(
    'estimating',
    'view'
  )
  const { id } = await params
  const sp = await searchParams
  const projectIdParam = sp.project ?? null

  const canEdit =
    permissions.canEdit('estimating') || permissions.canCreate('estimating')

  // Common settings fetches
  const [{ data: settingsData }, { data: formSettingsData }] = await Promise.all([
    supabase
      .from('estimate_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('estimate_form_settings')
      .select(
        'default_terms, default_notes, default_tax_rate, default_salesperson_id'
      )
      .limit(1)
      .maybeSingle(),
  ])

  const settings = (settingsData ?? null) as EstimateSettings | null
  const formSettings = (formSettingsData ?? null) as FormSettings | null

  let defaultSalespersonName = ''
  if (formSettings?.default_salesperson_id) {
    const { data: spProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', formSettings.default_salesperson_id)
      .maybeSingle()
    defaultSalespersonName =
      (spProfile as { display_name?: string | null } | null)?.display_name ?? ''
  }

  let project: EstimatingProject | null = null
  if (projectIdParam) {
    const { data } = await supabase
      .from('estimating_projects')
      .select('*')
      .eq('id', projectIdParam)
      .maybeSingle()
    project = (data ?? null) as EstimatingProject | null
  }

  const backHref = project
    ? `/sales/estimating?project=${project.id}`
    : '/sales/estimating'

  if (id === 'new') {
    const customerId = sp.customer ?? project?.company_id ?? null
    if (!customerId) {
      return <NotFoundState backHref={backHref} />
    }

    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .eq('id', customerId)
      .maybeSingle()

    if (!companyData) {
      return <NotFoundState backHref={backHref} />
    }

    let estimateNumber = settings?.next_estimate_number ?? 1000
    if (project?.project_number) {
      const m = project.project_number.match(/(\d+)/)
      if (m) estimateNumber = parseInt(m[1], 10)
    }

    const blank: Estimate = {
      id: '',
      estimate_number: estimateNumber,
      company_id: customerId,
      date: new Date().toISOString().split('T')[0],
      project_name: project?.name ?? '',
      description: '',
      salesperson: defaultSalespersonName,
      line_items: [],
      material_systems: [],
      subtotal: 0,
      tax: formSettings?.default_tax_rate ?? 0,
      total: 0,
      terms: formSettings?.default_terms ?? DEFAULT_TERMS,
      notes: formSettings?.default_notes ?? '',
      status: 'Draft',
      sent_at: null,
      sent_to_email: null,
      sent_to_name: null,
      sent_message: null,
      accepted_at: null,
      declined_at: null,
      created_at: new Date().toISOString(),
      user_id: user.id,
    }

    return (
      <EstimateEditorClient
        mode="new"
        estimate={blank}
        customer={companyData as Customer}
        project={project}
        settings={settings}
        userId={user.id}
        canEdit={canEdit}
      />
    )
  }

  const { data: estimateData } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!estimateData) {
    return <NotFoundState backHref={backHref} />
  }

  const estimate = estimateData as Estimate

  const { data: companyData } = await supabase
    .from('companies')
    .select('*')
    .eq('id', estimate.company_id)
    .maybeSingle()

  if (!companyData) {
    return <NotFoundState backHref={backHref} />
  }

  return (
    <EstimateEditorClient
      mode="edit"
      estimate={estimate}
      customer={companyData as Customer}
      project={project}
      settings={settings}
      userId={user.id}
      canEdit={canEdit}
    />
  )
}
