export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'

export default async function CompanyDetailPage({
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

  const { data: company } = await supabase
    .from('crm_companies')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()

  return (
    <div className="flex-1 overflow-y-auto p-7 bg-white">
      <Link
        href="/sales/crm"
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        ← Back to CRM
      </Link>
      <h1 className="text-[22px] font-medium text-gray-900 mt-2">
        {company?.name ?? 'Company'}
      </h1>
      <p className="text-sm text-gray-400 mt-1">Company ID: {id}</p>
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-6">
        <p className="text-sm text-gray-500">
          Company detail view coming soon (Phase 1C).
        </p>
      </div>
    </div>
  )
}
