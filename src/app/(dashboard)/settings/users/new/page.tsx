export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import AddUserPageClient from '@/components/settings/AddUserPageClient'

export default async function AddUserPage() {
  await requirePermission('user_management', 'create')
  return <AddUserPageClient />
}
