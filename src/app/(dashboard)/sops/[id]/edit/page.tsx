export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import SOPEditorClient from '@/components/sops/SOPEditorClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditSOPPage({ params }: PageProps) {
  const { id } = await params
  const { user } = await requirePermission('sops', 'edit')
  return <SOPEditorClient userId={user.id} sopId={id} />
}
