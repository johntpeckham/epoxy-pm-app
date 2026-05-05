export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import TakeoffListClient, { type TakeoffListRow } from './TakeoffListClient'

export default async function ToolsTakeoffPage() {
  const { supabase, user } = await requirePermission('estimating', 'view')

  const { data: rows } = await supabase
    .from('estimating_projects')
    .select('id, name, company_id, created_at, updated_at, companies(name)')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })

  const takeoffs: TakeoffListRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    company_id: r.company_id,
    // Supabase returns the joined row as an object or null
    company_name:
      r.companies && !Array.isArray(r.companies)
        ? (r.companies as { name: string }).name
        : Array.isArray(r.companies) && r.companies.length > 0
          ? (r.companies[0] as { name: string }).name
          : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))

  return <TakeoffListClient initialTakeoffs={takeoffs} userId={user.id} />
}
