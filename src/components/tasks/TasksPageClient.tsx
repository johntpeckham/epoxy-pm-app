'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import {
  CheckSquareIcon,
  CalendarIcon,
  UserIcon,
  XIcon,
  PlusIcon,
  CameraIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderIcon,
} from 'lucide-react'
import { Task, TaskStatus, Profile, Project, FormField } from '@/types'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, buildDynamicFields } from '@/lib/formFieldMaps'
import DynamicFormField from '@/components/ui/DynamicFormField'
import Portal from '@/components/ui/Portal'

interface TaskWithProject extends Task {
  project_name: string
}

interface TasksPageClientProps {
  initialTasks: TaskWithProject[]
  profiles: Profile[]
  projects: Project[]
  userId: string
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500'
const textareaCls = inputCls + ' resize-none'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  new_task: { label: 'New Task', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
  in_progress: { label: 'In Progress', bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  completed: { label: 'Completed', bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  unable_to_complete: { label: 'Unable to Complete', bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
}

const STATUS_ORDER: TaskStatus[] = ['new_task', 'in_progress', 'completed', 'unable_to_complete']

const STATUS_BUTTONS: { value: TaskStatus; label: string; inactiveColor: string; activeColor: string }[] = [
  { value: 'new_task', label: 'New Task', inactiveColor: 'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100', activeColor: 'border-blue-500 bg-blue-500 text-white' },
  { value: 'in_progress', label: 'In Progress', inactiveColor: 'border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100', activeColor: 'border-yellow-500 bg-yellow-500 text-white' },
  { value: 'completed', label: 'Completed', inactiveColor: 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100', activeColor: 'border-green-500 bg-green-500 text-white' },
  { value: 'unable_to_complete', label: 'Unable to Complete', inactiveColor: 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100', activeColor: 'border-red-500 bg-red-500 text-white' },
]

type SortOption = 'newest' | 'oldest' | 'project_az' | 'status'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'project_az', label: 'Project Name (A-Z)' },
  { value: 'status', label: 'Status' },
]

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatGroupDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface GroupedByProject {
  kind: 'project'
  projectId: string
  projectName: string
  dates: { date: string; tasks: TaskWithProject[] }[]
}

interface GroupedByStatus {
  kind: 'status'
  status: TaskStatus
  statusLabel: string
  tasks: TaskWithProject[]
}

type GroupedResult = GroupedByProject[] | GroupedByStatus[]

/** Group tasks by project, then by date within each project. */
function groupByProjectAndDate(tasks: TaskWithProject[], sort: SortOption): GroupedByProject[] {
  const projectMap = new Map<
    string,
    { projectName: string; dates: Map<string, TaskWithProject[]>; latestDate: string; oldestDate: string }
  >()

  for (const task of tasks) {
    let project = projectMap.get(task.project_id)
    const dateKey = task.created_at.slice(0, 10)
    if (!project) {
      project = { projectName: task.project_name, dates: new Map(), latestDate: dateKey, oldestDate: dateKey }
      projectMap.set(task.project_id, project)
    }
    if (dateKey > project.latestDate) project.latestDate = dateKey
    if (dateKey < project.oldestDate) project.oldestDate = dateKey
    const existing = project.dates.get(dateKey) ?? []
    existing.push(task)
    project.dates.set(dateKey, existing)
  }

  const dateDir = sort === 'oldest' ? 1 : -1

  return Array.from(projectMap.entries())
    .sort(([, a], [, b]) => {
      if (sort === 'project_az') return a.projectName.localeCompare(b.projectName)
      if (sort === 'newest') return b.latestDate.localeCompare(a.latestDate)
      return a.oldestDate.localeCompare(b.oldestDate)
    })
    .map(([projectId, project]) => ({
      kind: 'project' as const,
      projectId,
      projectName: project.projectName,
      dates: Array.from(project.dates.entries())
        .sort(([a], [b]) => a.localeCompare(b) * dateDir)
        .map(([date, tasks]) => ({ date, tasks })),
    }))
}

/** Group tasks by status. */
function groupByStatus(tasks: TaskWithProject[]): GroupedByStatus[] {
  const statusMap = new Map<TaskStatus, TaskWithProject[]>()
  for (const task of tasks) {
    const existing = statusMap.get(task.status) ?? []
    existing.push(task)
    statusMap.set(task.status, existing)
  }

  return STATUS_ORDER
    .filter((s) => statusMap.has(s))
    .map((s) => ({
      kind: 'status' as const,
      status: s,
      statusLabel: STATUS_CONFIG[s].label,
      tasks: (statusMap.get(s) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }))
}

export default function TasksPageClient({
  initialTasks,
  profiles,
  projects,
  userId,
}: TasksPageClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)
  const { fields: taskTemplateFields, loading: taskTemplateLoading } = useFormTemplate('task')

  const TASK_FORM_KEY = 'task'
  const [selectedTask, setSelectedTask] = useState<TaskWithProject | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [showCompleted, setShowCompleted] = useState(false)

  // ── New Task modal state ─────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newProjectId, setNewProjectId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newAssignedTo, setNewAssignedTo] = useState('')
  const [newStatus, setNewStatus] = useState<TaskStatus>('new_task')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null)
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null)
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const newPhotoInputRef = useRef<HTMLInputElement>(null)

  const projectStatusMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) map.set(p.id, p.status)
    return map
  }, [projects])

  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  function getProfileName(uid: string | null) {
    if (!uid) return 'Unassigned'
    const profile = profileMap.get(uid)
    return profile?.display_name || 'Unknown User'
  }

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return initialTasks
    const q = searchQuery.toLowerCase()
    return initialTasks.filter((t) => {
      const projectMatch = t.project_name.toLowerCase().includes(q)
      const titleMatch = t.title.toLowerCase().includes(q)
      const assignedName = getProfileName(t.assigned_to).toLowerCase()
      const assignedMatch = assignedName.includes(q)
      return projectMatch || titleMatch || assignedMatch
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTasks, searchQuery, profiles])

  const grouped: GroupedResult = useMemo(() => {
    if (sortOption === 'status') return groupByStatus(filtered)
    return groupByProjectAndDate(filtered, sortOption)
  }, [filtered, sortOption])

  const inProgressProjectGroups = useMemo(
    () => (grouped as GroupedByProject[]).filter((g) => g.kind === 'project' && projectStatusMap.get(g.projectId) !== 'Completed'),
    [grouped, projectStatusMap]
  )
  const completedProjectGroups = useMemo(
    () => (grouped as GroupedByProject[]).filter((g) => g.kind === 'project' && projectStatusMap.get(g.projectId) === 'Completed'),
    [grouped, projectStatusMap]
  )

  function getPhotoUrl(path: string) {
    return supabase.storage.from('post-photos').getPublicUrl(path).data.publicUrl
  }

  async function handleStatusChange(task: TaskWithProject, newSt: TaskStatus) {
    setUpdatingStatus(true)
    const { error } = await supabase
      .from('tasks')
      .update({ status: newSt })
      .eq('id', task.id)

    if (!error) {
      setSelectedTask({ ...task, status: newSt })
      router.refresh()
    }
    setUpdatingStatus(false)
  }

  // ── New Task handlers ────────────────────────────────────────────────────
  function resetCreateForm() {
    setNewProjectId('')
    setNewTitle('')
    setNewDescription('')
    setNewAssignedTo('')
    setNewStatus('new_task')
    setNewDueDate('')
    setNewPhotoFile(null)
    setNewPhotoPreview(null)
    setCustomValues({})
    setCreateError(null)
  }

  function openCreateModal() {
    resetCreateForm()
    setShowCreateModal(true)
  }

  function handleNewPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNewPhotoFile(file)
    setNewPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function isAssignToField(field: FormField): boolean {
    return field.id === 'tsk-03' || field.label === 'Assign To'
  }

  function isStatusField(field: FormField): boolean {
    return field.id === 'tsk-05' || field.label === 'Status'
  }

  function renderCreateField(field: FormField) {
    if (field.type === 'section_header') {
      return (
        <div key={field.id}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{field.label}</p>
        </div>
      )
    }

    const contentKey = getContentKey(TASK_FORM_KEY, field)

    // Title
    if (contentKey === 'title') {
      return (
        <div key={field.id}>
          <label className={labelCls}>{field.label}{field.required && ' *'}</label>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={field.placeholder || 'Task title...'}
            className={inputCls}
          />
        </div>
      )
    }

    // Description
    if (contentKey === 'description') {
      return (
        <div key={field.id}>
          <label className={labelCls}>{field.label}</label>
          <textarea
            rows={3}
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder={field.placeholder || 'Task details...'}
            className={textareaCls}
          />
        </div>
      )
    }

    // Assign To - special profile dropdown
    if (isAssignToField(field)) {
      return (
        <div key={field.id}>
          <label className={labelCls}>{field.label}</label>
          <select
            value={newAssignedTo}
            onChange={(e) => setNewAssignedTo(e.target.value)}
            className={inputCls}
          >
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || 'Unknown User'}
              </option>
            ))}
          </select>
        </div>
      )
    }

    // Due Date
    if (contentKey === 'due_date') {
      return (
        <div key={field.id} className="w-1/2 sm:w-full">
          <label className={labelCls}>{field.label}</label>
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className={inputCls}
          />
        </div>
      )
    }

    // Status - special button-style selector
    if (isStatusField(field)) {
      return (
        <div key={field.id}>
          <label className={labelCls}>{field.label}</label>
          <div className="flex gap-2">
            {STATUS_BUTTONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setNewStatus(opt.value)}
                className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition ${
                  newStatus === opt.value ? opt.activeColor : opt.inactiveColor
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )
    }

    // Any custom fields added via template manager - use DynamicFormField
    return (
      <DynamicFormField
        key={field.id}
        field={field}
        value={customValues[field.id] ?? ''}
        onChange={(val) => setCustomValues((prev) => ({ ...prev, [field.id]: String(val) }))}
      />
    )
  }

  async function handleCreateTask() {
    setCreating(true)
    setCreateError(null)

    try {
      if (!newProjectId) throw new Error('Please select a project')
      if (!newTitle.trim()) throw new Error('Please enter a task title')

      let photoUrl: string | null = null
      if (newPhotoFile) {
        const ext = newPhotoFile.name.split('.').pop()
        const path = `${newProjectId}/tasks/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, newPhotoFile)
        if (uploadErr) throw uploadErr
        photoUrl = path
      }

      // Build dynamic fields from custom values
      const allValues: Record<string, string> = {
        title: newTitle, description: newDescription,
        assigned_to: newAssignedTo, due_date: newDueDate, status: newStatus,
        ...customValues,
      }
      const dynamicFields = buildDynamicFields(TASK_FORM_KEY, allValues, taskTemplateFields)

      const { error: insertErr } = await supabase.from('tasks').insert({
        project_id: newProjectId,
        created_by: userId,
        assigned_to: newAssignedTo || null,
        title: newTitle.trim(),
        description: newDescription.trim(),
        status: newStatus,
        photo_url: photoUrl,
        due_date: newDueDate || null,
        dynamic_fields: dynamicFields,
      }).select().single()
      if (insertErr) throw insertErr

      // Send notification to assigned user
      if (newAssignedTo) {
        const creatorName = getProfileName(userId)
        const { error: notifErr } = await supabase.from('notifications').insert({
          user_id: newAssignedTo,
          type: 'task_assigned',
          title: 'New task assigned',
          message: `${creatorName} assigned you: ${newTitle.trim()}`,
          link: '/tasks',
        })
        if (notifErr) console.error('[TasksPageClient] Notification insert failed:', notifErr)
      }

      setShowCreateModal(false)
      resetCreateForm()
      router.refresh()
    } catch (err: unknown) {
      console.error('[TasksPageClient] Create failed:', err)
      let msg = 'Failed to create task'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setCreateError(msg)
    } finally {
      setCreating(false)
    }
  }

  function renderTaskCard(task: TaskWithProject) {
    const statusCfg = STATUS_CONFIG[task.status]
    const assignedName = getProfileName(task.assigned_to)

    return (
      <button
        key={task.id}
        onClick={() => setSelectedTask(task)}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors"
      >
        {/* Photo thumbnail */}
        {task.photo_url && (
          <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-gray-100">
            <Image
              src={getPhotoUrl(task.photo_url)}
              alt=""
              width={56}
              height={56}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-gray-900">{task.title}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <UserIcon className="w-3 h-3" />
              {assignedName}
            </span>
            {task.due_date && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <CalendarIcon className="w-3 h-3" />
                {formatDate(task.due_date)}
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-1">{task.description}</p>
          )}
        </div>
      </button>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2">
          <CheckSquareIcon className="w-5 h-5 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        </div>
        {canCreate('tasks') && (
          <button
            onClick={openCreateModal}
            disabled={projects.length === 0}
            title={projects.length === 0 ? 'Create a project first' : undefined}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {/* Search & Sort Controls */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by project, task title, or assignee..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
        <div className="relative">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckSquareIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">
            {searchQuery.trim() ? 'No tasks match your search' : 'No tasks yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {searchQuery.trim()
              ? 'Try a different search term.'
              : projects.length > 0
                ? 'Click "New Task" to create the first one.'
                : 'Create a project first, then add tasks.'}
          </p>
        </div>
      ) : sortOption === 'status' ? (
        /* ── Status-grouped view ────────────────────────────────────────── */
        <div className="space-y-8">
          {(grouped as GroupedByStatus[]).map((group) => {
            const cfg = STATUS_CONFIG[group.status]
            return (
              <div key={group.status}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                  <h2 className="text-lg font-bold text-gray-900">{group.statusLabel}</h2>
                  <span className="text-sm text-gray-400">({group.tasks.length})</span>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {group.tasks.map((task) => renderTaskCard(task))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* ── Project-grouped view (default) ─────────────────────────────── */
        <div>
          {/* In Progress section */}
          {inProgressProjectGroups.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">In Progress</p>
              <div className="space-y-8">
                {inProgressProjectGroups.map((project) => (
                  <div key={project.projectId}>
                    <h2 className="text-lg font-bold text-gray-900 mb-3">{project.projectName}</h2>
                    <div className="space-y-4">
                      {project.dates.map(({ date, tasks }) => (
                        <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                            <span className="text-sm font-semibold text-gray-800">{project.projectName}</span>
                            <span className="text-sm text-gray-400">&middot;</span>
                            <span className="text-sm text-gray-600">{formatGroupDate(date)}</span>
                            <span className="text-xs text-gray-400">
                              ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {tasks.map((task) => renderTaskCard(task))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Completed section — collapsible */}
          {completedProjectGroups.length > 0 && (
            <div className={inProgressProjectGroups.length > 0 ? 'border-t border-gray-200 mt-8 pt-4' : ''}>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 w-full text-left mb-4"
              >
                <ChevronRightIcon
                  className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${showCompleted ? 'rotate-90' : ''}`}
                />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Completed</span>
                <span className="text-xs text-gray-400">({completedProjectGroups.length})</span>
              </button>
              {showCompleted && (
                <div className="space-y-8">
                  {completedProjectGroups.map((project) => (
                    <div key={project.projectId}>
                      <h2 className="text-lg font-bold text-gray-900 mb-3">{project.projectName}</h2>
                      <div className="space-y-4">
                        {project.dates.map(({ date, tasks }) => (
                          <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                              <span className="text-sm font-semibold text-gray-800">{project.projectName}</span>
                              <span className="text-sm text-gray-400">&middot;</span>
                              <span className="text-sm text-gray-600">{formatGroupDate(date)}</span>
                              <span className="text-xs text-gray-400">
                                ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
                              </span>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {tasks.map((task) => renderTaskCard(task))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>

      {/* ── New Task modal ───────────────────────────────────────────────────── */}
      {showCreateModal && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => setShowCreateModal(false)}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                  <span>{createError}</span>
                  <button onClick={() => setCreateError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              )}

              {taskTemplateLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <LoaderIcon className="w-3 h-3 animate-spin" />
                  Loading form template...
                </div>
              )}

              {/* Project */}
              <div>
                <label className={labelCls}>Project *</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select a project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Dynamic template fields */}
              {taskTemplateFields.map((field) => renderCreateField(field))}

              {/* Photo */}
              <div>
                <label className={labelCls}>Photo</label>
                <input
                  ref={newPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleNewPhotoChange}
                />
                {newPhotoPreview ? (
                  <div className="relative inline-block">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={newPhotoPreview} alt="" className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => { setNewPhotoFile(null); setNewPhotoPreview(null) }}
                      className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => newPhotoInputRef.current?.click()}
                    className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium py-1 transition"
                  >
                    <CameraIcon className="w-4 h-4" />
                    Add photo
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={creating}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {creating ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Task detail modal ─────────────────────────────────────────────────── */}
      {selectedTask && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => setSelectedTask(null)}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 truncate">{selectedTask.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selectedTask.project_name}</p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition flex-shrink-0"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 min-h-0">
              {/* Status buttons */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</p>
                <div className="flex gap-2">
                  {STATUS_BUTTONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(selectedTask, opt.value)}
                      disabled={updatingStatus}
                      className={`flex-1 px-2 py-2 rounded-lg border text-xs font-medium transition disabled:opacity-60 ${
                        selectedTask.status === opt.value ? opt.activeColor : opt.inactiveColor
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTask.description}</p>
                </div>
              )}

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assigned To</p>
                  <p className="text-sm text-gray-700">{getProfileName(selectedTask.assigned_to)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Created By</p>
                  <p className="text-sm text-gray-700">{getProfileName(selectedTask.created_by)}</p>
                </div>
                {selectedTask.due_date && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</p>
                    <p className="text-sm text-gray-700">{formatDate(selectedTask.due_date)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Created</p>
                  <p className="text-sm text-gray-700">{formatTimestamp(selectedTask.created_at)}</p>
                </div>
              </div>

              {/* Photo */}
              {selectedTask.photo_url && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photo</p>
                  <button
                    onClick={() => setPreviewImage(getPhotoUrl(selectedTask.photo_url!))}
                    className="block"
                  >
                    <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-gray-100">
                      <Image
                        src={getPhotoUrl(selectedTask.photo_url)}
                        alt="Task photo"
                        fill
                        className="object-cover hover:opacity-90 transition"
                        sizes="128px"
                      />
                    </div>
                  </button>
                </div>
              )}

              {/* Dynamic fields */}
              {selectedTask.dynamic_fields && selectedTask.dynamic_fields.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  {selectedTask.dynamic_fields.filter((f) => f.value).map((f) => (
                    <div key={f.id}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{f.label}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
              <button
                onClick={() => setSelectedTask(null)}
                className="w-full border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Image preview overlay ─────────────────────────────────────────────── */}
      {previewImage && (
        <Portal>
        <div className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => setPreviewImage(null)}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Title bar */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <h2 className="text-lg font-semibold text-gray-900">Image Preview</h2>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage}
                alt="Task photo preview"
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  )
}
