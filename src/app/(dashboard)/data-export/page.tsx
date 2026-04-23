export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import DataExportClient from '@/components/data-export/DataExportClient'

export default async function DataExportPage() {
  await requirePermission('data_export', 'view')
  return <DataExportClient />
}
