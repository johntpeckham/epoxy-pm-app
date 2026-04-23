export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import BugReportsClient from '@/components/bug-reports/BugReportsClient'

export default async function BugReportsPage() {
  await requirePermission('bug_reports', 'view')
  return <BugReportsClient />
}
