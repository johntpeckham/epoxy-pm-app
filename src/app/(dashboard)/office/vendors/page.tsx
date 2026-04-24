export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import VendorsPageClient from '@/components/office-vendors/VendorsPageClient'

export default async function VendorsPage() {
  const { user } = await requirePermission('vendor_management', 'view')
  return <VendorsPageClient userId={user.id} />
}
