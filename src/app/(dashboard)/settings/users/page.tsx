export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import UserManagementPageClient from '@/components/settings/UserManagementPageClient'

export default async function UsersSettingsPage() {
  const { user } = await requirePermission('user_management', 'view')
  return <UserManagementPageClient currentUserId={user.id} />
}
