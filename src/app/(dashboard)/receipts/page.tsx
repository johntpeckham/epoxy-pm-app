export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReceiptContent, Project } from '@/types'
import ReceiptsPageClient from '@/components/receipts/ReceiptsPageClient'

export default async function ReceiptsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch active projects for the "New Receipt" dropdown
  const { data: projectRows } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'Active')
    .order('name', { ascending: true })

  // Fetch all receipt posts with joined project name
  const { data: posts } = await supabase
    .from('feed_posts')
    .select('id, project_id, created_at, content, projects(name)')
    .eq('post_type', 'receipt')
    .order('created_at', { ascending: false })

  const receipts = (posts ?? [])
    .map((row) => ({
      id: row.id,
      project_id: row.project_id,
      created_at: row.created_at,
      content: row.content as ReceiptContent,
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
      userId={user.id}
    />
  )
}
