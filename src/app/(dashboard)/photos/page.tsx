export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { PhotoContent, DailyReportContent, Project } from '@/types'
import PhotosPageClient from '@/components/photos/PhotosPageClient'

export interface PhotoItem {
  path: string       // storage path
  postId: string     // feed_posts.id this photo belongs to
  postType: string   // 'photo' | 'daily_report'
}

export interface PhotoEntry {
  postId: string
  projectId: string
  projectName: string
  date: string // YYYY-MM-DD
  photos: PhotoItem[] // storage paths with metadata
}

export default async function PhotosPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const user = session.user

  // Fetch active projects for the "New Photo" dropdown
  const { data: activeProjectRows } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'Active')
    .order('name', { ascending: true })

  // Fetch all projects (including completed) for status grouping
  const { data: projectRows } = await supabase
    .from('projects')
    .select('*')
    .order('name', { ascending: true })

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

      const rawPhotos =
        row.post_type === 'photo'
          ? (row.content as PhotoContent).photos
          : (row.content as DailyReportContent).photos ?? []

      const photos: PhotoItem[] = rawPhotos.map((p) => ({
        path: p,
        postId: row.id,
        postType: row.post_type,
      }))

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

  return (
    <PhotosPageClient
      entries={entries}
      projects={(activeProjectRows as Project[]) ?? []}
      allProjects={(projectRows as Project[]) ?? []}
      userId={user.id}
    />
  )
}
