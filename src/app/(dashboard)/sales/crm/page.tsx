export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import CrmTableClient from '@/components/sales/CrmTableClient'

export default async function SalesCrmPage() {
  const { user } = await requirePermission('crm', 'view')
  return <CrmTableClient userId={user.id} />
}
