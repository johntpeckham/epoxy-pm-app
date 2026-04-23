export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import TrashBinClient from '@/components/trash-bin/TrashBinClient'

export default async function TrashBinPage() {
  const { user } = await requirePermission('trash_bin', 'view')
  return <TrashBinClient userId={user.id} />
}
