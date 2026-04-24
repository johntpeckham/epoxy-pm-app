export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import MeasurementToolClient from '@/components/sales/estimating/MeasurementToolClient'

export default async function MeasurementToolPage() {
  await requirePermission('estimating', 'view')
  return <MeasurementToolClient />
}
