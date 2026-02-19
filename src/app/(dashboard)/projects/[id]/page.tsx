import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import ProjectFeedClient from '@/components/feed/ProjectFeedClient'
import { FeedPost, Project } from '@/types'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: posts } = await supabase
    .from('feed_posts')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  return (
    <ProjectFeedClient
      project={project as Project}
      initialPosts={(posts as FeedPost[]) ?? []}
      userId={user.id}
    />
  )
}
