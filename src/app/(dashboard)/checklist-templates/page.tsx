export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import ChecklistTemplatesClient from '@/components/checklist-templates/ChecklistTemplatesClient'

export default async function ChecklistTemplatesPage() {
  const { user } = await requirePermission('checklist_templates', 'view')
  return <ChecklistTemplatesClient userId={user.id} />
}
