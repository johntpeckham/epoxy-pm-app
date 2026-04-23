export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import EmailerClient from '@/components/sales/emailer/EmailerClient'

export default async function SalesEmailerPage() {
  const { user } = await requirePermission('emailer', 'view')
  return <EmailerClient userId={user.id} />
}
