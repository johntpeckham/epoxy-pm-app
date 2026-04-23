export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import EmployeeSummaryClient from '@/components/my-work/EmployeeSummaryClient'

export default async function EmployeeSummaryPage() {
  await requirePermission('employee_management', 'view')
  return <EmployeeSummaryClient />
}
