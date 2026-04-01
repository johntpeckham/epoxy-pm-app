'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  LayoutDashboardIcon,
  ChevronRightIcon,
  SettingsIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  CheckSquareIcon,
  ClipboardListIcon,
  ClockIcon,
  ReceiptIcon,
  CameraIcon,
  ShieldIcon,
  RulerIcon,
  PackageIcon,
  CalendarIcon,
  DollarSignIcon,
} from 'lucide-react'
import { Project } from '@/types'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import { useProjectPins } from '@/lib/useProjectPins'
import ProjectCard from '@/components/jobs/ProjectCard'
import NewProjectModal from '@/components/jobs/NewProjectModal'
import EditProjectModal from '@/components/jobs/EditProjectModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface JobBoardClientProps {
  initialProjects: Project[]
  userId: string
}

interface DashboardCounts {
  tasks: number
  dailyReports: number
  timecards: number
  expenses: number
  photos: number
  jsaReports: number
  plans: number
}

export default function JobBoardClient({ initialProjects, userId }: JobBoardClientProps) {
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)
  const { pinnedProjectIds, isPinned, togglePin } = useProjectPins(userId)
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'dashboard'>('list')

  // List controls
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)

  // Modals
  const [showNewProject, setShowNewProject] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Dashboard data
  const [counts, setCounts] = useState<DashboardCounts | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)

  const fetchProjects = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('[JobBoard] Fetch projects failed:', error)
    if (data) {
      setProjects(data)
      setSelectedProject((prev) => {
        if (!prev) return null
        return (data as Project[]).find((p) => p.id === prev.id) ?? prev
      })
    }
  }, [])

  const fetchDashboardCounts = useCallback(async (projectId: string) => {
    setCountsLoading(true)
    const supabase = createClient()

    const [tasks, dailyReports, timecards, expenses, photos, jsaReports, plans] = await Promise.all([
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('post_type', 'daily_report'),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('post_type', 'timecard'),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('post_type', ['receipt', 'expense']),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('post_type', 'photo'),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('post_type', 'jsa_report'),
      supabase.from('project_documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('category', 'plan'),
    ])

    setCounts({
      tasks: tasks.count ?? 0,
      dailyReports: dailyReports.count ?? 0,
      timecards: timecards.count ?? 0,
      expenses: expenses.count ?? 0,
      photos: photos.count ?? 0,
      jsaReports: jsaReports.count ?? 0,
      plans: plans.count ?? 0,
    })
    setCountsLoading(false)
  }, [])

  const selectProject = useCallback((project: Project) => {
    setSelectedProject(project)
    setMobileView('dashboard')
    fetchDashboardCounts(project.id)
  }, [fetchDashboardCounts])

  async function handleDeleteProject() {
    if (!projectToDelete) return
    setIsDeleting(true)
    const supabase = createClient()

    const { data: photoPosts, error: photoFetchError } = await supabase
      .from('feed_posts')
      .select('content')
      .eq('project_id', projectToDelete.id)
      .eq('post_type', 'photo')
    if (photoFetchError) console.error('[JobBoard] Fetch photo posts failed:', photoFetchError)
    if (photoPosts?.length) {
      const paths = photoPosts.flatMap(
        (p) => (p.content as { photos?: string[] }).photos ?? []
      )
      if (paths.length) await supabase.storage.from('post-photos').remove(paths)
    }

    const { error: deleteError } = await supabase.from('projects').delete().eq('id', projectToDelete.id)
    if (deleteError) console.error('[JobBoard] Delete project failed:', deleteError)

    if (selectedProject?.id === projectToDelete.id) {
      setSelectedProject(null)
      setCounts(null)
      setMobileView('list')
    }
    setIsDeleting(false)
    setProjectToDelete(null)
    fetchProjects()
  }

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

      {/* ── Left Panel: Project List ───────────────────────────────────── */}
      <div
        className={`flex-shrink-0 w-screen max-w-full lg:w-80 xl:w-96 min-w-0 bg-white border-r border-gray-200 flex-col overflow-hidden ${
          mobileView === 'dashboard' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {/* List header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Job Board</h1>
            </div>
            {canCreate('job_board') && (
              <button
                onClick={() => setShowNewProject(true)}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
              >
                <PlusIcon className="w-4 h-4" />
                New
              </button>
            )}
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
              <LayoutDashboardIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
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
                      onEdit={setEditingProject}
                      onDelete={setProjectToDelete}
                      showEditDelete={true}
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
                    onEdit={setEditingProject}
                    onDelete={setProjectToDelete}
                    showEditDelete={true}
                    isPinned={false}
                    onTogglePin={handleTogglePin}
                  />
                ))
              )}

              {/* Completed section */}
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
                          onEdit={setEditingProject}
                          onDelete={setProjectToDelete}
                          showEditDelete={true}
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

      {/* ── Right Panel: Dashboard Cards ──────────────────────────────── */}
      <div
        className={`flex-1 min-h-0 w-screen max-w-full min-w-0 overflow-hidden bg-gray-50 ${
          mobileView === 'list' ? 'hidden lg:flex' : 'flex'
        } flex-col`}
      >
        {selectedProject ? (
          <>
            {/* Project header with back button on mobile */}
            <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileView('list')}
                  className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <ChevronRightIcon className="w-5 h-5 rotate-180" />
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">
                    {selectedProject.estimate_number
                      ? `Est. #${selectedProject.estimate_number} - ${selectedProject.name}`
                      : selectedProject.name}
                  </h2>
                  <p className="text-xs text-gray-500 truncate">
                    {selectedProject.client_name} &middot; {selectedProject.address}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    selectedProject.status === 'Active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {selectedProject.status}
                </span>
              </div>
            </div>

            {/* Dashboard cards */}
            <div className="flex-1 overflow-y-auto p-4">
              {countsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  <DashboardCard
                    icon={<SettingsIcon className="w-5 h-5" />}
                    title="Job Info / Settings"
                    content={
                      <div className="space-y-1">
                        <p className="text-xs text-gray-600 truncate">{selectedProject.name}</p>
                        <p className="text-xs text-gray-500 truncate">{selectedProject.address}</p>
                        <p className="text-xs text-gray-500 truncate">{selectedProject.client_name}</p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          selectedProject.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {selectedProject.status}
                        </span>
                      </div>
                    }
                  />
                  <DashboardCard
                    icon={<ClipboardCheckIcon className="w-5 h-5" />}
                    title="Checklist"
                    content={<p className="text-xs text-gray-400">No checklist items yet</p>}
                  />
                  <DashboardCard
                    icon={<FileTextIcon className="w-5 h-5" />}
                    title="Plans"
                    content={
                      <p className="text-xs text-gray-500">
                        {counts && counts.plans > 0 ? `${counts.plans} plan${counts.plans === 1 ? '' : 's'} uploaded` : 'No plans uploaded'}
                      </p>
                    }
                  />
                  <DashboardCard
                    icon={<CheckSquareIcon className="w-5 h-5" />}
                    title="Tasks"
                    content={
                      <p className="text-xs text-gray-500">
                        {counts && counts.tasks > 0 ? `${counts.tasks} task${counts.tasks === 1 ? '' : 's'}` : 'No tasks yet'}
                      </p>
                    }
                  />
                  <DashboardCard
                    icon={<ClipboardListIcon className="w-5 h-5" />}
                    title="Daily Reports"
                    content={
                      <p className="text-xs text-gray-500">
                        {counts && counts.dailyReports > 0 ? `${counts.dailyReports} report${counts.dailyReports === 1 ? '' : 's'}` : 'No reports yet'}
                      </p>
                    }
                  />
                  <DashboardCard
                    icon={<ClockIcon className="w-5 h-5" />}
                    title="Timecards"
                    content={
                      <p className="text-xs text-gray-500">
                        {counts && counts.timecards > 0 ? `${counts.timecards} timecard${counts.timecards === 1 ? '' : 's'}` : 'No timecards yet'}
                      </p>
                    }
                  />
                  <DashboardCard
                    icon={<ReceiptIcon className="w-5 h-5" />}
                    title="Expenses / Receipts"
                    content={
                      <p className="text-xs text-gray-500">
                        {counts && counts.expenses > 0 ? `${counts.expenses} expense${counts.expenses === 1 ? '' : 's'}` : 'No expenses yet'}
                      </p>
                    }
                  />
                  <DashboardCard
                    icon={<CameraIcon className="w-5 h-5" />}
                    title="Photos"
                    content={
                      <p className="text-xs text-gray-500">
                        {counts && counts.photos > 0 ? `${counts.photos} photo${counts.photos === 1 ? '' : 's'}` : 'No photos yet'}
                      </p>
                    }
                  />
                  <DashboardCard
                    icon={<ShieldIcon className="w-5 h-5" />}
                    title="JSA Reports"
                    content={
                      <p className="text-xs text-gray-500">
                        {counts && counts.jsaReports > 0 ? `${counts.jsaReports} report${counts.jsaReports === 1 ? '' : 's'}` : 'No JSA reports yet'}
                      </p>
                    }
                  />
                  <DashboardCard
                    icon={<RulerIcon className="w-5 h-5" />}
                    title="Estimating"
                    content={<p className="text-xs text-gray-400">Project Takeoff</p>}
                  />
                  <DashboardCard
                    icon={<PackageIcon className="w-5 h-5" />}
                    title="Material Orders"
                    content={<p className="text-xs text-gray-400">No orders yet</p>}
                  />
                  <DashboardCard
                    icon={<CalendarIcon className="w-5 h-5" />}
                    title="Scheduling"
                    content={<p className="text-xs text-gray-400">Coming soon</p>}
                  />
                  <DashboardCard
                    icon={<DollarSignIcon className="w-5 h-5" />}
                    title="Billing"
                    content={<p className="text-xs text-gray-400">Estimates, Invoices, Change Orders</p>}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <LayoutDashboardIcon className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium">Select a project to view the Job Board</p>
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

function DashboardCard({ icon, title, content }: { icon: React.ReactNode; title: string; content: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm hover:border-gray-300 transition-all">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-500">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div>{content}</div>
    </div>
  )
}
