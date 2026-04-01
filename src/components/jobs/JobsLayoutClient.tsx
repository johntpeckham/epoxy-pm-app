'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SearchIcon,
  BriefcaseIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { Project, FeedPost } from '@/types'
import { useProjectPins } from '@/lib/useProjectPins'
import ProjectCard from './ProjectCard'
import ProjectFeedClient from '@/components/feed/ProjectFeedClient'

interface JobsLayoutClientProps {
  initialProjects: Project[]
  userId: string
}

export default function JobsLayoutClient({ initialProjects, userId }: JobsLayoutClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pinnedProjectIds, isPinned, togglePin } = useProjectPins(userId)
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'feed'>('list')

  // List controls
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  // Feed
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [feedLoading, setFeedLoading] = useState(false)

  // URL sync
  const initializedFromUrl = useRef(false)

  const fetchProjects = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('[Jobs] Fetch projects failed:', error)
    if (data) {
      setProjects(data)
      setSelectedProject((prev) => {
        if (!prev) return null
        return (data as Project[]).find((p) => p.id === prev.id) ?? prev
      })
    }
  }, [])

  const selectProject = useCallback(async (project: Project) => {
    setSelectedProject(project)
    setMobileView('feed')
    setFeedLoading(true)
    const supabase = createClient()
    const { data, error: feedError } = await supabase
      .from('feed_posts')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })
    if (feedError) console.error('[Jobs] Fetch feed posts failed:', feedError)

    const userIds = [...new Set((data ?? []).map((p) => p.user_id))]
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds)
      : { data: [], error: null }
    if (profilesError) console.error('[Jobs] Fetch profiles failed:', profilesError)
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
  }, [])

  // ── URL ↔ State sync ────────────────────────────────────────────────
  // Restore state from URL on initial mount
  useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true

    const projectId = searchParams.get('project')
    if (projectId) {
      const project = initialProjects.find((p) => p.id === projectId)
      if (project) selectProject(project)
    }
  }, [searchParams, initialProjects, selectProject])

  // Update URL when selected project changes
  const prevUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initializedFromUrl.current) return
    const newUrl = selectedProject ? `/jobs?project=${selectedProject.id}` : '/jobs'
    if (prevUrlRef.current !== null && prevUrlRef.current !== newUrl) {
      router.replace(newUrl)
    }
    prevUrlRef.current = newUrl
  }, [selectedProject?.id, router])

  // Filter then split into pinned / active / completed sections
  const filtered = useMemo(() => projects.filter((p) => {
    const q = search.toLowerCase()
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.client_name.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q)
    )
  }), [projects, search])

  const pinnedProjects = useMemo(() => filtered.filter((p) => pinnedProjectIds.has(p.id)), [filtered, pinnedProjectIds])
  const activeProjects = useMemo(() => filtered.filter((p) => p.status === 'Active' && !pinnedProjectIds.has(p.id)), [filtered, pinnedProjectIds])
  const completedProjects = useMemo(() => [...filtered.filter((p) => p.status === 'Complete' && !pinnedProjectIds.has(p.id))]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [filtered, pinnedProjectIds])

  const handleTogglePin = useCallback((project: Project) => {
    togglePin(project.id)
  }, [togglePin])

  return (
    <div className="flex h-full overflow-hidden w-full max-w-full">

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
              <h1 className="text-lg font-bold text-gray-900">Job Feed</h1>
            </div>
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
              {/* Pinned section */}
              {pinnedProjects.length > 0 && (
                <>
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">Pinned</p>
                  {pinnedProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      isSelected={selectedProject?.id === project.id}
                      onSelect={selectProject}
                      showEditDelete={false}
                      isPinned={true}
                      onTogglePin={handleTogglePin}
                    />
                  ))}
                  <div className="border-t border-gray-200 mt-4 pt-4" />
                </>
              )}

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
                    showEditDelete={false}
                    isPinned={false}
                    onTogglePin={handleTogglePin}
                  />
                ))
              )}

              {/* Completed section — collapsible, hidden when empty */}
              {completedProjects.length > 0 && (
                <div className="border-t border-gray-200 mt-4 pt-4">
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="flex items-center gap-2 w-full text-left mb-2"
                  >
                    <ChevronRightIcon
                      className={`w-3.5 h-3.5 text-amber-500 transition-transform duration-200 ${showCompleted ? 'rotate-90' : ''}`}
                    />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Completed</span>
                    <span className="text-xs text-gray-400">({completedProjects.length})</span>
                  </button>
                  {showCompleted && (
                    <div className="space-y-2">
                      {completedProjects.map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          isSelected={selectedProject?.id === project.id}
                          onSelect={selectProject}
                          showEditDelete={false}
                          isPinned={false}
                          onTogglePin={handleTogglePin}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Panel 3: Project Feed ───────────────────────────────────────── */}
      <div
        className={`flex-1 min-h-0 w-screen max-w-full min-w-0 overflow-hidden bg-gray-50 ${
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
    </div>
  )
}
