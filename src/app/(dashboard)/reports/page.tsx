export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import ReportsClient from '@/components/reports/ReportsClient'

export default async function ReportsPage() {
  await requirePermission('reports', 'view')
  return <ReportsClient />
}
