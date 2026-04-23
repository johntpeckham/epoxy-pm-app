export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import type { UserRole } from '@/types'
import AppointmentsClient from '@/components/sales/AppointmentsClient'

export default async function SalesAppointmentsPage() {
  const { user, permissions } = await requirePermission('appointments', 'view')
  const userRole = (permissions.role ?? 'crew') as UserRole
  return <AppointmentsClient userId={user.id} userRole={userRole} />
}
