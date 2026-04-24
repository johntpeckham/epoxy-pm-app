export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import ManagePlaybookClient from '@/components/my-work/ManagePlaybookClient'

export default async function ManagePlaybookPage() {
  await requirePermission('manage_playbook', 'view')
  return <ManagePlaybookClient />
}
