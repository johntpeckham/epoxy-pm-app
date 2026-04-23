export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import DialerClient from '@/components/sales/dialer/DialerClient'

export default async function SalesDialerPage() {
  const { user } = await requirePermission('dialer', 'view')
  return <DialerClient userId={user.id} />
}
