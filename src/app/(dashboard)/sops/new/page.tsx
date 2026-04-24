export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import SOPEditorClient from '@/components/sops/SOPEditorClient'

export default async function NewSOPPage() {
  const { user } = await requirePermission('sops', 'create')
  return <SOPEditorClient userId={user.id} />
}
