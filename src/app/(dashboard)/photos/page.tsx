export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PhotoContent, DailyReportContent } from '@/types'
import PhotosPageClient from '@/components/photos/PhotosPageClient'

export interface PhotoEntry {
  postId: string
  projectId: string
  projectName: string
  date: string // YYYY-MM-DD
  photos: string[] // storage paths
}

export default async function PhotosPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all photo and daily_report posts with project names
  const { data: posts } = await supabase
    .from('feed_posts')
    .select('id, project_id, post_type, created_at, content, projects(name)')
    .in('post_type', ['photo', 'daily_report'])
    .order('created_at', { ascending: false })

  const entries: PhotoEntry[] = (posts ?? [])
    .filter((row) => {
      if (row.post_type === 'photo') {
        return ((row.content as PhotoContent).photos ?? []).length > 0
      }
      if (row.post_type === 'daily_report') {
        return ((row.content as DailyReportContent).photos ?? []).length > 0
      }
      return false
    })
    .map((row) => {
      const projectName =
        (row.projects as unknown as { name: string } | null)?.name ?? 'Unknown Project'

      const photos =
        row.post_type === 'photo'
          ? (row.content as PhotoContent).photos
          : (row.content as DailyReportContent).photos ?? []

      // Use the report date for daily reports, otherwise the post creation date
      const date =
        row.post_type === 'daily_report' && (row.content as DailyReportContent).date
          ? (row.content as DailyReportContent).date
          : row.created_at.slice(0, 10)

      return {
        postId: row.id,
        projectId: row.project_id,
        projectName,
        date,
        photos,
      }
    })

  return <PhotosPageClient entries={entries} />
}
