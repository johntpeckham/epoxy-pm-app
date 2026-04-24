export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import TrainingCertificationsPageClient from '@/components/training-certifications/TrainingCertificationsPageClient'

export default async function TrainingCertificationsPage() {
  await requirePermission('training_certifications', 'view')
  return <TrainingCertificationsPageClient />
}
