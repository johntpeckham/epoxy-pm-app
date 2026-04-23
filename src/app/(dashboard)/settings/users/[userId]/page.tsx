export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import UserDetailPageClient from '@/components/settings/UserDetailPageClient'

interface PageProps {
  params: Promise<{ userId: string }>
}

export default async function UserDetailPage({ params }: PageProps) {
  await requirePermission('user_management', 'view')
  const { userId } = await params
  return <UserDetailPageClient userId={userId} />
}
