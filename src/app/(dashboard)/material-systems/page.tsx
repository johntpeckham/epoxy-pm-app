export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import MaterialSystemsClient from '@/components/material-systems/MaterialSystemsClient'

export default async function MaterialSystemsPage() {
  await requirePermission('material_management', 'view')
  return <MaterialSystemsClient />
}
