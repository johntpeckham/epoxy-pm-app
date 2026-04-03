'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  ChevronRightIcon,
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
  ArrowLeftIcon,
  FileSignatureIcon,
  ChevronDownIcon,
  CheckIcon,
} from 'lucide-react'
import { Project, Task, FeedPost, TaskStatus } from '@/types'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import { useProjectPins } from '@/lib/useProjectPins'
import ProjectCard from '@/components/jobs/ProjectCard'
import NewProjectModal from '@/components/jobs/NewProjectModal'
import EditProjectModal from '@/components/jobs/EditProjectModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

// Workspace components
import JobInfoWorkspace from './workspaces/JobInfoWorkspace'
import TasksWorkspace from './workspaces/TasksWorkspace'
import PhotosWorkspace from './workspaces/PhotosWorkspace'
import PlansWorkspace from './workspaces/PlansWorkspace'
import FeedPostListWorkspace from './workspaces/FeedPostListWorkspace'
import EstimatingWorkspace from './workspaces/EstimatingWorkspace'
import PlaceholderWorkspace from './workspaces/PlaceholderWorkspace'
import ChecklistWorkspace from './workspaces/ChecklistWorkspace'
import MaterialOrdersWorkspace from './workspaces/MaterialOrdersWorkspace'
import SchedulingWorkspace from './workspaces/SchedulingWorkspace'
import ReportWorkspace from './workspaces/ReportWorkspace'
import ContractsWorkspace from './workspaces/ContractsWorkspace'
import ChecklistDashboardCard from './ChecklistDashboardCard'
import JobInfoDashboardCard from './JobInfoDashboardCard'
import JobsOverview from './JobsOverview'

type WorkspaceType =
  | 'job_info' | 'checklist' | 'plans' | 'tasks'
  | 'daily_reports' | 'timecards' | 'expenses' | 'photos'
  | 'jsa_reports' | 'estimating' | 'material_orders'
  | 'scheduling' | 'billing' | 'report' | 'contracts'
  | null

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
  checklistTotal: number
  checklistCompleted: number
  materialOrdersPending: number
  materialOrdersOrdered: number
  materialOrdersDelivered: number
  materialOrdersBackordered: number
  schedulingEvents: number
  contracts: number
  hasReport: boolean
}

interface DashboardPreviews {
  recentTasks: { id: string; title: string; status: TaskStatus }[]
  recentPhotoUrls: string[]
  recentDailyReportDates: string[]
  recentTimecardDates: string[]
  recentJsaDates: string[]
  totalExpenseAmount: number
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string }> = {
  new_task: { label: 'New', bg: 'bg-blue-100', text: 'text-blue-800' },
  in_progress: { label: 'In Progress', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  completed: { label: 'Done', bg: 'bg-green-100', text: 'text-green-800' },
  unable_to_complete: { label: 'Unable', bg: 'bg-red-100', text: 'text-red-800' },
}

export default function JobBoardClient({ initialProjects, userId }: JobBoardClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)
  const { pinnedProjectIds, isPinned, togglePin } = useProjectPins(userId)
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'dashboard'>('list')

  // List controls
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  // Modals
  const [showNewProject, setShowNewProject] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Status dropdown
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<'Active' | 'Completed' | 'Closed' | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)

  // Dashboard data
  const [counts, setCounts] = useState<DashboardCounts | null>(null)
  const [previews, setPreviews] = useState<DashboardPreviews | null>(null)
  const [countsLoading, setCountsLoading] = useState(false)

  // Workspace state
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType>(null)

  // Track whether we've done the initial URL restore
  const initializedFromUrl = useRef(false)

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

  const fetchDashboardData = useCallback(async (projectId: string) => {
    setCountsLoading(true)
    const supabase = createClient()

    // Counts (parallel)
    const [tasksCount, dailyReportsCount, timecardsCount, expensesCount, photosCount, jsaReportsCount, plansCount, checklistTotalCount, checklistCompletedCount, moPending, moOrdered, moDelivered, moBackordered, schedulingEventsCount, reportCheck, contractsCount] = await Promise.all([
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('post_type', 'daily_report'),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('post_type', 'timecard'),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('post_type', ['receipt', 'expense']),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('post_type', 'photo'),
      supabase.from('feed_posts').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('post_type', 'jsa_report'),
      supabase.from('project_documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('category', 'plan'),
      supabase.from('project_checklist_items').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('project_checklist_items').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('is_complete', true),
      supabase.from('material_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'Pending'),
      supabase.from('material_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'Ordered'),
      supabase.from('material_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'Delivered'),
      supabase.from('material_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('status', 'Backordered'),
      supabase.from('calendar_events').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('project_reports').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('project_contracts').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    ])

    setCounts({
      tasks: tasksCount.count ?? 0,
      dailyReports: dailyReportsCount.count ?? 0,
      timecards: timecardsCount.count ?? 0,
      expenses: expensesCount.count ?? 0,
      photos: photosCount.count ?? 0,
      jsaReports: jsaReportsCount.count ?? 0,
      plans: plansCount.count ?? 0,
      checklistTotal: checklistTotalCount.count ?? 0,
      checklistCompleted: checklistCompletedCount.count ?? 0,
      materialOrdersPending: moPending.count ?? 0,
      materialOrdersOrdered: moOrdered.count ?? 0,
      materialOrdersDelivered: moDelivered.count ?? 0,
      materialOrdersBackordered: moBackordered.count ?? 0,
      schedulingEvents: schedulingEventsCount.count ?? 0,
      contracts: contractsCount.count ?? 0,
      hasReport: (reportCheck.count ?? 0) > 0,
    })

    // Preview data (parallel)
    const [recentTasksRes, recentPhotosRes, recentDailyRes, recentTimecardRes, recentJsaRes, expensesRes] = await Promise.all([
      supabase.from('tasks').select('id, title, status').eq('project_id', projectId).order('created_at', { ascending: false }).limit(5),
      supabase.from('feed_posts').select('content').eq('project_id', projectId).eq('post_type', 'photo').order('created_at', { ascending: false }).limit(2),
      supabase.from('feed_posts').select('content').eq('project_id', projectId).eq('post_type', 'daily_report').order('created_at', { ascending: false }).limit(3),
      supabase.from('feed_posts').select('content').eq('project_id', projectId).eq('post_type', 'timecard').order('created_at', { ascending: false }).limit(3),
      supabase.from('feed_posts').select('content').eq('project_id', projectId).eq('post_type', 'jsa_report').order('created_at', { ascending: false }).limit(3),
      supabase.from('feed_posts').select('content').eq('project_id', projectId).in('post_type', ['receipt', 'expense']),
    ])

    // Extract photo URLs from recent photo posts
    const photoUrls: string[] = []
    for (const post of recentPhotosRes.data ?? []) {
      const content = post.content as { photos?: string[] }
      if (content.photos?.length) {
        photoUrls.push(...content.photos.slice(0, 4 - photoUrls.length))
        if (photoUrls.length >= 4) break
      }
    }

    // Sum up expenses
    let totalExpenseAmount = 0
    for (const post of expensesRes.data ?? []) {
      const content = post.content as { total_amount?: number; amount?: number }
      totalExpenseAmount += content.total_amount ?? content.amount ?? 0
    }

    setPreviews({
      recentTasks: (recentTasksRes.data ?? []).map((t) => ({ id: t.id, title: t.title, status: t.status as TaskStatus })),
      recentPhotoUrls: photoUrls,
      recentDailyReportDates: (recentDailyRes.data ?? []).map((p) => (p.content as { date?: string }).date ?? ''),
      recentTimecardDates: (recentTimecardRes.data ?? []).map((p) => (p.content as { date?: string }).date ?? ''),
      recentJsaDates: (recentJsaRes.data ?? []).map((p) => (p.content as { date?: string }).date ?? ''),
      totalExpenseAmount,
    })

    setCountsLoading(false)
  }, [])

  // ── URL ↔ State sync ────────────────────────────────────────────────
  // Helper to build URL with params
  const buildUrl = useCallback((projectId: string | null, workspace: WorkspaceType) => {
    const params = new URLSearchParams()
    if (projectId) params.set('project', projectId)
    if (workspace) params.set('workspace', workspace)
    const qs = params.toString()
    return qs ? `/job-board?${qs}` : '/job-board'
  }, [])

  // Restore state from URL on initial mount
  useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true

    const projectId = searchParams.get('project')
    const workspace = searchParams.get('workspace') as WorkspaceType

    if (projectId) {
      const project = initialProjects.find((p) => p.id === projectId)
      if (project) {
        setSelectedProject(project)
        setMobileView('dashboard')
        if (workspace) setActiveWorkspace(workspace)
        fetchDashboardData(project.id)
      }
    }
  }, [searchParams, initialProjects, fetchDashboardData])

  // Update URL when selection changes (skip the initial restore)
  const prevUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initializedFromUrl.current) return
    const newUrl = buildUrl(selectedProject?.id ?? null, activeWorkspace)
    if (prevUrlRef.current !== null && prevUrlRef.current !== newUrl) {
      router.push(newUrl)
    }
    prevUrlRef.current = newUrl
  }, [selectedProject?.id, activeWorkspace, buildUrl, router])

  const selectProject = useCallback((project: Project) => {
    setSelectedProject(project)
    setMobileView('dashboard')
    setActiveWorkspace(null)
    fetchDashboardData(project.id)
  }, [fetchDashboardData])

  const deselectProject = useCallback(() => {
    setSelectedProject(null)
    setCounts(null)
    setPreviews(null)
    setActiveWorkspace(null)
    setMobileView('dashboard')
  }, [])

  // When project changes while in a workspace, reload workspace data
  useEffect(() => {
    if (selectedProject && activeWorkspace) {
      // workspace components fetch their own data based on project.id,
      // but we need to trigger a re-render by changing the key
    }
  }, [selectedProject, activeWorkspace])

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
      setPreviews(null)
      setActiveWorkspace(null)
      setMobileView('list')
    }
    setIsDeleting(false)
    setProjectToDelete(null)
    fetchProjects()
  }

  // ── Status dropdown handlers ─────────────────────────────────────────
  useEffect(() => {
    if (!showStatusDropdown) return
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showStatusDropdown])

  async function handleStatusChange() {
    if (!selectedProject || !pendingStatus) return
    setIsUpdatingStatus(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('projects')
      .update({ status: pendingStatus })
      .eq('id', selectedProject.id)
    if (error) {
      console.error('[JobBoard] Update status failed:', error)
    } else {
      setSelectedProject({ ...selectedProject, status: pendingStatus })
      fetchProjects()
    }
    setIsUpdatingStatus(false)
    setPendingStatus(null)
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
  const completedProjects = useMemo(() => [...filtered.filter((p) => p.status === 'Completed' && !pinnedProjectIds.has(p.id))]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [filtered, pinnedProjectIds])
  const closedProjects = useMemo(() => [...filtered.filter((p) => p.status === 'Closed' && !pinnedProjectIds.has(p.id))]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [filtered, pinnedProjectIds])

  const handleTogglePin = useCallback((project: Project) => {
    togglePin(project.id)
  }, [togglePin])

  const openWorkspace = (ws: WorkspaceType) => {
    setActiveWorkspace(ws)
  }

  const backToDashboard = () => {
    setActiveWorkspace(null)
    // Refresh counts when returning from a workspace (data may have changed)
    if (selectedProject) fetchDashboardData(selectedProject.id)
  }

  // Supabase client for photo URLs on summary cards
  const supabase = createClient()
  const getPhotoUrl = (path: string) => supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl

  // ── Render workspace content ────────────────────────────────────────
  function renderWorkspace() {
    if (!selectedProject) return null

    switch (activeWorkspace) {
      case 'job_info':
        return (
          <JobInfoWorkspace
            project={selectedProject}
            onBack={backToDashboard}
            onEdit={() => setEditingProject(selectedProject)}
          />
        )
      case 'tasks':
        return (
          <TasksWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
          />
        )
      case 'photos':
        return (
          <PhotosWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
          />
        )
      case 'plans':
        return (
          <PlansWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
          />
        )
      case 'daily_reports':
        return (
          <FeedPostListWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
            title="Daily Reports"
            icon={<ClipboardListIcon className="w-5 h-5" />}
            postTypes={['daily_report']}
            emptyMessage="No daily reports for this project yet"
          />
        )
      case 'timecards':
        return (
          <FeedPostListWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
            title="Timecards"
            icon={<ClockIcon className="w-5 h-5" />}
            postTypes={['timecard']}
            emptyMessage="No timecards for this project yet"
          />
        )
      case 'expenses':
        return (
          <FeedPostListWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
            title="Expenses"
            icon={<ReceiptIcon className="w-5 h-5" />}
            postTypes={['receipt', 'expense']}
            emptyMessage="No expenses for this project yet"
          />
        )
      case 'jsa_reports':
        return (
          <FeedPostListWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
            title="JSA Reports"
            icon={<ShieldIcon className="w-5 h-5" />}
            postTypes={['jsa_report']}
            emptyMessage="No JSA reports for this project yet"
          />
        )
      case 'report':
        return (
          <ReportWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            userRole={role ?? undefined}
            onBack={backToDashboard}
          />
        )
      case 'estimating':
        return (
          <EstimatingWorkspace
            project={selectedProject}
            onBack={backToDashboard}
          />
        )
      case 'checklist':
        return (
          <ChecklistWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
            isAdmin={role === 'admin'}
          />
        )
      case 'material_orders':
        return (
          <MaterialOrdersWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
          />
        )
      case 'scheduling':
        return (
          <SchedulingWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
          />
        )
      case 'billing':
        return (
          <PlaceholderWorkspace
            title="Billing"
            icon={<DollarSignIcon className="w-5 h-5" />}
            message="Billing coming soon — Estimates, Invoices, Change Orders"
            onBack={backToDashboard}
          />
        )
      case 'contracts':
        return (
          <ContractsWorkspace
            key={selectedProject.id}
            project={selectedProject}
            userId={userId}
            onBack={backToDashboard}
          />
        )
      default:
        return null
    }
  }

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
              {/* Jobs Overview link */}
              <button
                onClick={deselectProject}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition mb-2 ${
                  !selectedProject
                    ? 'bg-amber-50 border border-amber-200 text-amber-700'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <LayoutGridIcon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-semibold">Jobs Overview</span>
              </button>

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

              {/* Completed section — always expanded */}
              {completedProjects.length > 0 && (
                <div className="border-t border-gray-200 mt-4 pt-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Completed</p>
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
                </div>
              )}

              {/* Closed section */}
              {closedProjects.length > 0 && (
                <div className="border-t border-gray-200 mt-4 pt-4">
                  <button
                    onClick={() => setShowClosed(!showClosed)}
                    className="flex items-center gap-2 w-full text-left mb-2"
                  >
                    <ChevronRightIcon
                      className={`w-3.5 h-3.5 text-amber-500 transition-transform duration-200 ${showClosed ? 'rotate-90' : ''}`}
                    />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Closed</span>
                    <span className="text-xs text-gray-400">({closedProjects.length})</span>
                  </button>
                  {showClosed && (
                    <div className="space-y-2">
                      {closedProjects.map((project) => (
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

      {/* ── Right Panel: Dashboard or Workspace ──────────────────────── */}
      <div
        className={`flex-1 min-h-0 w-screen max-w-full min-w-0 overflow-hidden bg-gray-50 ${
          mobileView === 'list' ? 'hidden lg:flex' : 'flex'
        } flex-col`}
      >
        {selectedProject ? (
          activeWorkspace ? (
            // ── Workspace view ──
            renderWorkspace()
          ) : (
            // ── Dashboard view ──
            <>
              {/* Project header */}
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
                  {/* Status dropdown button */}
                  <div className="relative flex-shrink-0" ref={statusDropdownRef}>
                    <button
                      onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition border ${
                        selectedProject.status === 'Active'
                          ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                          : selectedProject.status === 'Completed'
                          ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {selectedProject.status}
                      <ChevronDownIcon className={`w-4 h-4 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showStatusDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1">
                        {(['Active', 'Completed', 'Closed'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => {
                              if (s !== selectedProject.status) {
                                setPendingStatus(s)
                              }
                              setShowStatusDropdown(false)
                            }}
                            className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition ${
                              s === selectedProject.status
                                ? 'bg-gray-50 font-semibold'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              s === 'Active' ? 'bg-green-500' : s === 'Completed' ? 'bg-blue-500' : 'bg-gray-400'
                            }`} />
                            <span className="text-sm text-gray-700 flex-1">{s}</span>
                            {s === selectedProject.status && (
                              <CheckIcon className="w-4 h-4 text-amber-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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

                    {/* 1. Job Info — spans 2 columns, read-only with gear icon to edit */}
                    <JobInfoDashboardCard
                      project={selectedProject}
                      onEdit={() => setEditingProject(selectedProject)}
                    />

                    {/* 2. Checklist — spans 2 columns with full inline editing */}
                    <ChecklistDashboardCard
                      project={selectedProject}
                      userId={userId}
                      onExpand={() => openWorkspace('checklist')}
                      isAdmin={role === 'admin'}
                    />

                    {/* 3. Plans */}
                    <DashboardCard
                      icon={<FileTextIcon className="w-5 h-5" />}
                      title="Plans"
                      onClick={() => openWorkspace('plans')}
                      content={
                        <p className="text-xs text-gray-500">
                          {counts && counts.plans > 0 ? `${counts.plans} plan${counts.plans === 1 ? '' : 's'} uploaded` : 'No plans uploaded'}
                        </p>
                      }
                    />

                    {/* 3b. Contracts & POs */}
                    <DashboardCard
                      icon={<FileSignatureIcon className="w-5 h-5" />}
                      title="Contracts & POs"
                      onClick={() => openWorkspace('contracts')}
                      content={
                        <p className="text-xs text-gray-500">
                          {counts && counts.contracts > 0 ? `${counts.contracts} document${counts.contracts === 1 ? '' : 's'}` : 'No documents uploaded'}
                        </p>
                      }
                    />

                    {/* 4. Tasks — enhanced with preview */}
                    <DashboardCard
                      icon={<CheckSquareIcon className="w-5 h-5" />}
                      title="Field Tasks"
                      onClick={() => openWorkspace('tasks')}
                      content={
                        <div>
                          {previews && previews.recentTasks.length > 0 ? (
                            <div className="space-y-1.5">
                              {previews.recentTasks.slice(0, 3).map((t) => (
                                <div key={t.id} className="flex items-center gap-1.5">
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    t.status === 'completed' ? 'bg-green-500' :
                                    t.status === 'in_progress' ? 'bg-yellow-500' :
                                    t.status === 'unable_to_complete' ? 'bg-red-500' : 'bg-blue-500'
                                  }`} />
                                  <span className="text-xs text-gray-600 truncate">{t.title}</span>
                                </div>
                              ))}
                              {(counts?.tasks ?? 0) > 3 && (
                                <p className="text-xs text-gray-400">+{(counts?.tasks ?? 0) - 3} more</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No tasks yet</p>
                          )}
                        </div>
                      }
                    />

                    {/* 5. Daily Reports */}
                    <DashboardCard
                      icon={<ClipboardListIcon className="w-5 h-5" />}
                      title="Daily Reports"
                      onClick={() => openWorkspace('daily_reports')}
                      content={
                        <div>
                          {counts && counts.dailyReports > 0 ? (
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500">{counts.dailyReports} report{counts.dailyReports === 1 ? '' : 's'}</p>
                              {previews?.recentDailyReportDates.filter(Boolean).slice(0, 2).map((d, i) => (
                                <p key={i} className="text-xs text-gray-400">{d}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No reports yet</p>
                          )}
                        </div>
                      }
                    />

                    {/* 6. Job Report */}
                    <DashboardCard
                      icon={<ClipboardListIcon className="w-5 h-5" />}
                      title="Job Report"
                      onClick={() => openWorkspace('report')}
                      content={
                        counts?.hasReport ? (
                          <p className="text-xs text-green-600">Report created</p>
                        ) : (
                          <p className="text-xs text-gray-400">No report yet</p>
                        )
                      }
                    />

                    {/* 7. Timecards */}
                    <DashboardCard
                      icon={<ClockIcon className="w-5 h-5" />}
                      title="Timecards"
                      onClick={() => openWorkspace('timecards')}
                      content={
                        <div>
                          {counts && counts.timecards > 0 ? (
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500">{counts.timecards} timecard{counts.timecards === 1 ? '' : 's'}</p>
                              {previews?.recentTimecardDates.filter(Boolean).slice(0, 2).map((d, i) => (
                                <p key={i} className="text-xs text-gray-400">{d}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No timecards yet</p>
                          )}
                        </div>
                      }
                    />

                    {/* 7. Expenses */}
                    <DashboardCard
                      icon={<ReceiptIcon className="w-5 h-5" />}
                      title="Expenses"
                      onClick={() => openWorkspace('expenses')}
                      content={
                        <div>
                          {counts && counts.expenses > 0 ? (
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500">{counts.expenses} expense{counts.expenses === 1 ? '' : 's'}</p>
                              {previews && previews.totalExpenseAmount > 0 && (
                                <p className="text-xs text-gray-600 font-medium">${previews.totalExpenseAmount.toFixed(2)} total</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No expenses yet</p>
                          )}
                        </div>
                      }
                    />

                    {/* 8. Photos — enhanced with thumbnails */}
                    <DashboardCard
                      icon={<CameraIcon className="w-5 h-5" />}
                      title="Photos"
                      onClick={() => openWorkspace('photos')}
                      content={
                        <div>
                          {previews && previews.recentPhotoUrls.length > 0 ? (
                            <div className="space-y-1.5">
                              <div className="grid grid-cols-4 gap-1">
                                {previews.recentPhotoUrls.slice(0, 4).map((path, i) => (
                                  <div key={i} className="aspect-square rounded overflow-hidden bg-gray-100">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={getPhotoUrl(path)} alt="" className="w-full h-full object-cover" />
                                  </div>
                                ))}
                              </div>
                              <p className="text-xs text-gray-400">{counts?.photos ?? 0} photo{(counts?.photos ?? 0) === 1 ? '' : 's'}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No photos yet</p>
                          )}
                        </div>
                      }
                    />

                    {/* 9. JSA Reports */}
                    <DashboardCard
                      icon={<ShieldIcon className="w-5 h-5" />}
                      title="JSA Reports"
                      onClick={() => openWorkspace('jsa_reports')}
                      content={
                        <div>
                          {counts && counts.jsaReports > 0 ? (
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500">{counts.jsaReports} report{counts.jsaReports === 1 ? '' : 's'}</p>
                              {previews?.recentJsaDates.filter(Boolean).slice(0, 1).map((d, i) => (
                                <p key={i} className="text-xs text-gray-400">Latest: {d}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No JSA reports yet</p>
                          )}
                        </div>
                      }
                    />

                    {/* 10. Estimating */}
                    <DashboardCard
                      icon={<RulerIcon className="w-5 h-5" />}
                      title="Estimating"
                      onClick={() => openWorkspace('estimating')}
                      content={<p className="text-xs text-gray-400">Project Takeoff</p>}
                    />

                    {/* 11. Material Orders */}
                    <DashboardCard
                      icon={<PackageIcon className="w-5 h-5" />}
                      title="Material Orders"
                      onClick={() => openWorkspace('material_orders')}
                      content={
                        counts && (counts.materialOrdersPending + counts.materialOrdersOrdered + counts.materialOrdersDelivered + counts.materialOrdersBackordered) > 0 ? (
                          <div className="space-y-0.5">
                            {counts.materialOrdersPending > 0 && <p className="text-xs text-yellow-600">{counts.materialOrdersPending} Pending</p>}
                            {counts.materialOrdersOrdered > 0 && <p className="text-xs text-blue-600">{counts.materialOrdersOrdered} Ordered</p>}
                            {counts.materialOrdersBackordered > 0 && <p className="text-xs text-red-600">{counts.materialOrdersBackordered} Backordered</p>}
                            {counts.materialOrdersDelivered > 0 && <p className="text-xs text-green-600">{counts.materialOrdersDelivered} Delivered</p>}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No orders yet</p>
                        )
                      }
                    />

                    {/* 12. Scheduling */}
                    <DashboardCard
                      icon={<CalendarIcon className="w-5 h-5" />}
                      title="Scheduling"
                      onClick={() => openWorkspace('scheduling')}
                      content={
                        counts && counts.schedulingEvents > 0 ? (
                          <p className="text-xs text-gray-600">{counts.schedulingEvents} event{counts.schedulingEvents !== 1 ? 's' : ''}</p>
                        ) : (
                          <p className="text-xs text-gray-400">No events scheduled</p>
                        )
                      }
                    />

                    {/* 13. Billing */}
                    <DashboardCard
                      icon={<DollarSignIcon className="w-5 h-5" />}
                      title="Billing"
                      onClick={() => openWorkspace('billing')}
                      content={<p className="text-xs text-gray-400">Estimates, Invoices, Change Orders</p>}
                    />
                  </div>
                )}
              </div>
            </>
          )
        ) : (
          <JobsOverview
            projects={projects}
            onSelectProject={selectProject}
            onBack={() => setMobileView('list')}
          />
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

      {pendingStatus && (
        <ConfirmDialog
          title="Change Project Status"
          message={`Are you sure you want to change the status to "${pendingStatus}"?`}
          onConfirm={handleStatusChange}
          onCancel={() => setPendingStatus(null)}
          loading={isUpdatingStatus}
        />
      )}
    </div>
  )
}

/* ── Dashboard Card ──────────────────────────────────────────────────── */

function DashboardCard({ icon, title, content, onClick, className }: {
  icon: React.ReactNode
  title: string
  content: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-4 transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5' : 'hover:shadow-sm hover:border-gray-300'
      } ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-500">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div>{content}</div>
    </div>
  )
}
