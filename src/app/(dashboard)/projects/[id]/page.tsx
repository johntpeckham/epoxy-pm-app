export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import { notFound } from 'next/navigation'
import ProjectFeedClient from '@/components/feed/ProjectFeedClient'
import { FeedPost, Project } from '@/types'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params
  const { supabase, user } = await requirePermission('jobs', 'view')

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('*, companies(id, name)')
    .eq('id', id)
    .single()
  if (projectErr) {
    console.error('[PROJECT PAGE FETCH ERROR]', {
      code: projectErr.code,
      message: projectErr.message,
      hint: projectErr.hint,
      details: projectErr.details,
    })
  }

  if (!project) notFound()

  const { data: rawPosts } = await supabase
    .from('feed_posts')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  // Fetch profiles separately (no direct FK between feed_posts and profiles)
  const userIds = [...new Set((rawPosts ?? []).map((p) => p.user_id))]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
    : { data: [] }
  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
  )

  const posts = (rawPosts ?? []).map((post) => {
    const profile = profileMap.get(post.user_id)
    return {
      ...post,
      author_name: profile?.display_name ?? undefined,
      author_avatar_url: profile?.avatar_url ?? undefined,
    }
  })

  return (
    <ProjectFeedClient
      project={project as Project}
      initialPosts={posts as FeedPost[]}
      userId={user.id}
    />
  )
}
