'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  BriefcaseIcon,
} from 'lucide-react'
import { Project, FeedPost } from '@/types'
import ProjectCard from './ProjectCard'
import NewProjectModal from './NewProjectModal'
import EditProjectModal from './EditProjectModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ProjectFeedClient from '@/components/feed/ProjectFeedClient'

interface JobsLayoutClientProps {
  initialProjects: Project[]
  userId: string
}

export default function JobsLayoutClient({ initialProjects, userId }: JobsLayoutClientProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'feed'>('list')

  // List controls
  const [search, setSearch] = useState('')

  // Modals
  const [showNewProject, setShowNewProject] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Feed
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [feedLoading, setFeedLoading] = useState(false)

  const fetchProjects = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) {
      setProjects(data)
      // Keep selectedProject in sync with any edits
      setSelectedProject((prev) => {
        if (!prev) return null
        return (data as Project[]).find((p) => p.id === prev.id) ?? prev
      })
    }
  }, [])

  async function selectProject(project: Project) {
    setSelectedProject(project)
    setMobileView('feed')
    setFeedLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('feed_posts')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })

    // Fetch profiles separately (no FK join available)
    const userIds = [...new Set((data ?? []).map((p) => p.user_id))]
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
      : { data: [] }
    const profileMap = new Map(
      (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
    )

    const enriched = (data ?? []).map((post) => {
      const profile = profileMap.get(post.user_id)
      return {
        ...post,
        author_name: profile?.display_name ?? post.author_name,
        author_avatar_url: profile?.avatar_url ?? undefined,
      } as FeedPost
    })
    setFeedPosts(enriched)
    setFeedLoading(false)
  }

  async function handleDeleteProject() {
    if (!projectToDelete) return
    setIsDeleting(true)
    const supabase = createClient()

    // Clean up storage photos before deleting project
    const { data: photoPosts } = await supabase
      .from('feed_posts')
      .select('content')
      .eq('project_id', projectToDelete.id)
      .eq('post_type', 'photo')
    if (photoPosts?.length) {
      const paths = photoPosts.flatMap(
        (p) => (p.content as { photos?: string[] }).photos ?? []
      )
      if (paths.length) await supabase.storage.from('post-photos').remove(paths)
    }

    await supabase.from('projects').delete().eq('id', projectToDelete.id)

    if (selectedProject?.id === projectToDelete.id) {
      setSelectedProject(null)
      setFeedPosts([])
      setMobileView('list')
    }
    setIsDeleting(false)
    setProjectToDelete(null)
    fetchProjects()
  }

  // Filter then split into active / completed sections
  const filtered = projects.filter((p) => {
    const q = search.toLowerCase()
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.client_name.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q)
    )
  })

  const activeProjects = filtered.filter((p) => p.status === 'Active')
  const completedProjects = [...filtered.filter((p) => p.status === 'Complete')]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const activeCount = projects.filter((p) => p.status === 'Active').length

  return (
    // Full viewport height; panels scroll independently
    <div className="flex h-full overflow-hidden w-full max-w-full border-4 border-red-500">

      {/* ── Panel 2: Project List ───────────────────────────────────────── */}
      <div
        className={`flex-shrink-0 w-screen max-w-full lg:w-80 xl:w-96 min-w-0 bg-white border-r border-gray-200 flex-col overflow-hidden ${
          mobileView === 'feed' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {/* List header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-900">Jobs</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeCount} active · {projects.length} total
              </p>
            </div>
            <button
              onClick={() => setShowNewProject(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
            />
          </div>

        </div>

        {/* Scrollable project list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <BriefcaseIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {search ? 'No matching projects' : 'No projects yet'}
              </p>
            </div>
          ) : (
            <>
              {/* Active section */}
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Active</p>
              {activeProjects.length === 0 ? (
                <p className="text-xs text-gray-400 pb-2">No active projects</p>
              ) : (
                activeProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isSelected={selectedProject?.id === project.id}
                    onSelect={selectProject}
                    onEdit={setEditingProject}
                    onDelete={setProjectToDelete}
                  />
                ))
              )}

              {/* Completed section — hidden when empty */}
              {completedProjects.length > 0 && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-2">Completed</p>
                  {completedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      isSelected={selectedProject?.id === project.id}
                      onSelect={selectProject}
                      onEdit={setEditingProject}
                      onDelete={setProjectToDelete}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Panel 3: Project Feed ───────────────────────────────────────── */}
      <div
        className={`flex-1 min-h-0 w-screen max-w-full min-w-0 overflow-hidden bg-gray-50 border-4 border-red-500 ${
          mobileView === 'list' ? 'hidden lg:flex' : 'flex'
        } flex-col`}
      >
        {selectedProject ? (
          feedLoading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <ProjectFeedClient
              key={selectedProject.id}
              project={selectedProject}
              initialPosts={feedPosts}
              userId={userId}
              onBack={() => setMobileView('list')}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <BriefcaseIcon className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">Select a project to view its feed</p>
            <p className="text-gray-400 text-sm mt-1">
              Choose a project from the list on the left.
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={() => {
            setShowNewProject(false)
            fetchProjects()
          }}
        />
      )}

      {editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={() => setEditingProject(null)}
          onUpdated={() => {
            setEditingProject(null)
            fetchProjects()
          }}
        />
      )}

      {projectToDelete && (
        <ConfirmDialog
          title="Delete Project"
          message={`Are you sure you want to delete "${projectToDelete.name}"? All posts and photos will be permanently deleted.`}
          onConfirm={handleDeleteProject}
          onCancel={() => setProjectToDelete(null)}
          loading={isDeleting}
        />
      )}
    </div>
  )
}
