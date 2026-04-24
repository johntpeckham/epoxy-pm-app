export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import SOPsClient from '@/components/sops/SOPsClient'

export default async function SOPsPage() {
  const { user } = await requirePermission('sops', 'view')
  return <SOPsClient userId={user.id} />
}
