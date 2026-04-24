export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import ImportCenterClient from '@/components/sales/ImportCenterClient'

export default async function ImportCenterPage() {
  const { user } = await requirePermission('crm', 'edit')
  return <ImportCenterClient userId={user.id} />
}
