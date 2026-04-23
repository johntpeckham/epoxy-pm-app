export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import CommandCenterClient from '@/components/admin/CommandCenterClient'

export default async function CommandCenterPage() {
  await requirePermission('command_center', 'view')
  return <CommandCenterClient />
}
