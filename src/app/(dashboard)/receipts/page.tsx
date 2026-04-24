export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import { ReceiptContent, DynamicFieldEntry, Project } from '@/types'
import ReceiptsPageClient from '@/components/receipts/ReceiptsPageClient'

export default async function ReceiptsPage() {
  const { supabase, user, permissions } = await requirePermission('receipts', 'view')

  // Role still drives restricted-expense visibility (resolved by requirePermission).
  const userRole = (permissions.role ?? 'crew') as string
  const canSeeRestricted = ['admin', 'office_manager', 'salesman'].includes(userRole)

  // Fetch active projects for the "New Receipt" dropdown
  const { data: projectRows } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'Active')
    .order('name', { ascending: true })

  // Fetch all projects (including completed) for status grouping
  const { data: allProjectRows } = await supabase
    .from('projects')
    .select('*')
    .order('name', { ascending: true })

  // Fetch all receipt posts with joined project name
  let postsQuery = supabase
    .from('feed_posts')
    .select('id, project_id, created_at, content, dynamic_fields, confirmed, restricted, projects(name)')
    .eq('post_type', 'receipt')
    .order('created_at', { ascending: false })

  // If user cannot see restricted expenses, filter them out at query level
  if (!canSeeRestricted) {
    postsQuery = postsQuery.or('restricted.is.null,restricted.eq.false')
  }

  const { data: posts } = await postsQuery

  const receipts = (posts ?? [])
    .map((row) => ({
      id: row.id,
      project_id: row.project_id,
      created_at: row.created_at,
      content: row.content as ReceiptContent,
      dynamic_fields: (row.dynamic_fields ?? []) as DynamicFieldEntry[],
      confirmed: (row.confirmed as boolean) ?? false,
      restricted: (row.restricted as boolean) ?? false,
      project_name:
        (row.projects as unknown as { name: string } | null)?.name ?? 'Unknown Project',
    }))
    .sort((a, b) => {
      const dateA = a.content.receipt_date || a.created_at.slice(0, 10)
      const dateB = b.content.receipt_date || b.created_at.slice(0, 10)
      return dateB.localeCompare(dateA)
    })

  return (
    <ReceiptsPageClient
      initialReceipts={receipts}
      projects={(projectRows as Project[]) ?? []}
      allProjects={(allProjectRows as Project[]) ?? []}
      userId={user.id}
    />
  )
}
