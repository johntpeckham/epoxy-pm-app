export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import PermissionsClient from '@/components/permissions/PermissionsClient'

export default async function UsersPermissionsPage() {
  // The old /permissions route gated on role === 'admin'. Under default
  // templates, requirePermission('user_management', 'view') is equivalent
  // (user_management is 'off' for every non-admin; admins pass via the
  // hook shortcut). Matches the gate used by the rest of /settings/users.
  await requirePermission('user_management', 'view')
  return <PermissionsClient />
}
