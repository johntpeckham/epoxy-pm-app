export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import CompanyDetailClient from '@/components/sales/CompanyDetailClient'

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { user } = await requirePermission('crm', 'view')
  return <CompanyDetailClient companyId={id} userId={user.id} />
}
