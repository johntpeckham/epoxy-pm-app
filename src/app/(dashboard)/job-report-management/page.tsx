export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import JobReportManagementClient from '@/components/job-report-management/JobReportManagementClient'

export default async function JobReportManagementPage() {
  const { user } = await requirePermission('job_reports', 'view')
  return <JobReportManagementClient userId={user.id} />
}
