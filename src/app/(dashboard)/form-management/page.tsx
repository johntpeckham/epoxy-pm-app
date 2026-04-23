export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import FormManagementClient from '@/components/form-management/FormManagementClient'

export default async function FormManagementPage() {
  await requirePermission('job_feed_forms', 'view')
  return <FormManagementClient excludeFormKey="project_report" />
}
