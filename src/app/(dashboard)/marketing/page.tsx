export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import MarketingPageClient from '@/components/marketing/MarketingPageClient'

export default async function MarketingPage() {
  await requirePermission('marketing', 'view')
  return <MarketingPageClient />
}
