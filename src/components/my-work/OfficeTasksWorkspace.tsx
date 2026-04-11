'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { OfficeTask, OfficePriority, Profile, UserRole } from '@/types'
import { toggleOfficeTaskCompletion } from '@/lib/officeTaskCompletion'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
  CalendarIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  XIcon,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(d: string | null) {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(d: string | null) {
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(d + 'T00:00:00') < today
}

const priorityOrder: Record<OfficePriority, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
}

const priorityColors: Record<OfficePriority, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Normal: 'bg-blue-100 text-blue-700',
  High: 'bg-orange-100 text-orange-700',
  Urgent: 'bg-red-100 text-red-700',
}

function sortTasks(tasks: OfficeTask[]): OfficeTask[] {
  return [...tasks].sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 2
    const pb = priorityOrder[b.priority] ?? 2
    if (pa !== pb) return pa - pb
    // Then by due date (nulls last)
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ProjectOption = { id: string; name: string }

interface Props {
  userId: string
  role: UserRole
  initialOfficeTasks: OfficeTask[]
  onCountChange?: (incomplete: number) => void
  showCreateModal?: boolean
  onCloseCreateModal?: () => void
  hideAllToggle?: boolean
}

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function OfficeTasksWorkspace({
  userId,
  role,
  initialOfficeTasks,
  onCountChange,
  showCreateModal = false,
  onCloseCreateModal,
  hideAllToggle = false,
}: Props) {
  const supabase = createClient()
  const isAdminOrOM = role === 'admin' || role === 'office_manager'

  /* ---- State ---- */
  const [tasks, setTasks] = useState<OfficeTask[]>(initialOfficeTasks)
  const [showCompleted, setShowCompleted] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loadingRefData, setLoadingRefData] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  /* ---- Fetch reference data for selectors ---- */
  const fetchRefData = useCallback(async () => {
    setLoadingRefData(true)
    const [profilesRes, projectsRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name, avatar_url, role, updated_at'),
      supabase.from('projects').select('id, name').eq('status', 'Active').order('name', { ascending: true }),
    ])
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])
    if (projectsRes.data) setProjects(projectsRes.data as ProjectOption[])
    setLoadingRefData(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchRefData()
  }, [fetchRefData])

  /* ---- Profile map for display ---- */
  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  const getDisplayName = (id: string | null) => {
    if (!id) return 'Unassigned'
    return profileMap.get(id)?.display_name ?? 'Unknown'
  }

  /* ---- Filtered tasks ---- */
  const visibleTasks = showAll && isAdminOrOM
    ? tasks
    : tasks.filter((t) => t.assigned_to === userId || t.created_by === userId)

  const incomplete = visibleTasks.filter((t) => !t.is_completed)
  const completed = visibleTasks.filter((t) => t.is_completed)
  const sortedIncomplete = sortTasks(incomplete)

  /* ---- Notify parent of count changes ---- */
  useEffect(() => {
    const myIncomplete = tasks.filter((t) => !t.is_completed && (t.assigned_to === userId || t.created_by === userId))
    onCountChange?.(myIncomplete.length)
  }, [tasks, userId, onCountChange])

  /* ---- Refetch all tasks (for after toggle change) ---- */
  const refetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('office_tasks')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setTasks(data as OfficeTask[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- Toggle "All Tasks" refetches so we have everyone's data ---- */
  useEffect(() => {
    if (showAll && isAdminOrOM) {
      refetchTasks()
    }
  }, [showAll, isAdminOrOM, refetchTasks])

  /* ================================================================ */
  /*  CRUD                                                             */
  /* ================================================================ */

  async function toggleComplete(task: OfficeTask) {
    const newVal = !task.is_completed
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_completed: newVal, updated_at: new Date().toISOString() } : t))
    )
    // Routes through the shared utility so any linked equipment scheduled
    // service is kept in sync with the task.
    await toggleOfficeTaskCompletion(supabase, task.id, newVal, userId)
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setDeleteConfirmId(null)
    await supabase.from('office_tasks').delete().eq('id', id)
  }

  async function updateField(id: string, field: string, value: string | null) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value, updated_at: new Date().toISOString() } : t))
    )
    await supabase
      .from('office_tasks')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function createTask(data: {
    title: string
    description: string
    assigned_to: string
    project_id: string
    due_date: string
    priority: OfficePriority
  }) {
    const newTask: OfficeTask = {
      id: crypto.randomUUID(),
      title: data.title,
      description: data.description || null,
      assigned_to: data.assigned_to || null,
      project_id: data.project_id || null,
      is_completed: false,
      due_date: data.due_date || null,
      priority: data.priority,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setTasks((prev) => [newTask, ...prev])
    const { data: inserted } = await supabase
      .from('office_tasks')
      .insert({
        title: data.title,
        description: data.description || null,
        assigned_to: data.assigned_to || null,
        project_id: data.project_id || null,
        due_date: data.due_date || null,
        priority: data.priority,
        created_by: userId,
      })
      .select()
      .single()
    if (inserted) {
      setTasks((prev) => prev.map((t) => (t.id === newTask.id ? (inserted as OfficeTask) : t)))
    }
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="p-4 space-y-3">
      {/* Toggle + Create controls */}
      {isAdminOrOM && !hideAllToggle && (
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => setShowAll(false)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              !showAll ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            My Tasks
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              showAll ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            All Tasks
          </button>
        </div>
      )}

      {/* Task list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="divide-y divide-gray-50">
          {sortedIncomplete.length === 0 && (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">
              No office tasks yet
            </p>
          )}
          {sortedIncomplete.map((task) => (
            <OfficeTaskRow
              key={task.id}
              task={task}
              getDisplayName={getDisplayName}
              profiles={profiles}
              projects={projects}
              onToggle={toggleComplete}
              onUpdateField={updateField}
              onDelete={(id) => setDeleteConfirmId(id)}
            />
          ))}
        </div>

        {completed.length > 0 && (
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showCompleted ? (
                <ChevronDownIcon className="w-4 h-4" />
              ) : (
                <ChevronRightIcon className="w-4 h-4" />
              )}
              Completed ({completed.length})
            </button>
            {showCompleted && (
              <div className="divide-y divide-gray-50">
                {completed.map((task) => (
                  <OfficeTaskRow
                    key={task.id}
                    task={task}
                    getDisplayName={getDisplayName}
                    profiles={profiles}
                    projects={projects}
                    onToggle={toggleComplete}
                    onUpdateField={updateField}
                    onDelete={(id) => setDeleteConfirmId(id)}
                    completed
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreateOfficeTaskModal
          userId={userId}
          profiles={profiles}
          projects={projects}
          onClose={() => onCloseCreateModal?.()}
          onCreate={(data) => {
            createTask(data)
            onCloseCreateModal?.()
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Task</h3>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this task? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTask(deleteConfirmId)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  OFFICE TASK ROW                                                    */
/* ================================================================== */

function OfficeTaskRow({
  task,
  getDisplayName,
  profiles,
  projects,
  onToggle,
  onUpdateField,
  onDelete,
  completed,
}: {
  task: OfficeTask
  getDisplayName: (id: string | null) => string
  profiles: Profile[]
  projects: ProjectOption[]
  onToggle: (t: OfficeTask) => void
  onUpdateField: (id: string, field: string, value: string | null) => void
  onDelete: (id: string) => void
  completed?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTitle(task.title) }, [task.title])
  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  function commitTitle() {
    setEditing(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdateField(task.id, 'title', trimmed)
    } else {
      setTitle(task.title)
    }
  }

  const projectName = task.project_id
    ? projects.find((p) => p.id === task.project_id)?.name
    : null

  return (
    <div className={`px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors group ${completed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(task)}
          className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
            task.is_completed
              ? 'border-amber-400 bg-amber-50'
              : 'border-gray-300 hover:border-amber-500'
          }`}
        >
          {task.is_completed && <CheckIcon className="w-3 h-3 text-amber-500" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          {editing ? (
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') { setTitle(task.title); setEditing(false) }
              }}
              className="text-sm w-full bg-transparent outline-none border-b border-amber-400 text-gray-900 pb-0.5"
            />
          ) : (
            <p
              onClick={() => !completed && setEditing(true)}
              className={`text-sm cursor-text truncate ${
                completed ? 'text-gray-500 line-through' : 'text-gray-900 font-medium'
              }`}
            >
              {task.title}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {/* Priority badge */}
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColors[task.priority]}`}>
              {task.priority}
            </span>

            {/* Assignee */}
            <span className="text-xs text-gray-500">{getDisplayName(task.assigned_to)}</span>

            {/* Project link */}
            {projectName && task.project_id && (
              <Link
                href={`/job-board?project=${task.project_id}`}
                className="text-xs text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
              >
                {projectName}
                <ExternalLinkIcon className="w-3 h-3" />
              </Link>
            )}

            {/* Due date */}
            {task.due_date && (
              <span
                className={`text-xs flex items-center gap-1 ${
                  isOverdue(task.due_date) && !task.is_completed ? 'text-red-600 font-medium' : 'text-gray-500'
                }`}
              >
                <CalendarIcon className="w-3 h-3" />
                {formatDate(task.due_date)}
                {isOverdue(task.due_date) && !task.is_completed && (
                  <AlertCircleIcon className="w-3 h-3 text-red-500" />
                )}
              </span>
            )}

            {/* Expand/collapse description */}
            {task.description && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {expanded ? 'Hide details' : 'Show details'}
              </button>
            )}
          </div>

          {/* Description */}
          {expanded && task.description && (
            <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap bg-gray-50 rounded-lg px-3 py-2">
              {task.description}
            </p>
          )}
        </div>

        {/* Actions (visible on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {/* Assign selector */}
          <select
            value={task.assigned_to ?? ''}
            onChange={(e) => onUpdateField(task.id, 'assigned_to', e.target.value || null)}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white max-w-[100px]"
          >
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || 'Unknown'}
              </option>
            ))}
          </select>

          {/* Priority selector */}
          <select
            value={task.priority}
            onChange={(e) => onUpdateField(task.id, 'priority', e.target.value)}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white w-[75px]"
          >
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </select>

          {/* Due date */}
          <input
            type="date"
            value={task.due_date || ''}
            onChange={(e) => onUpdateField(task.id, 'due_date', e.target.value || null)}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white w-[110px]"
          />

          {/* Delete */}
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2Icon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  CREATE MODAL                                                       */
/* ================================================================== */

function CreateOfficeTaskModal({
  userId,
  profiles,
  projects,
  onClose,
  onCreate,
}: {
  userId: string
  profiles: Profile[]
  projects: { id: string; name: string }[]
  onClose: () => void
  onCreate: (data: {
    title: string
    description: string
    assigned_to: string
    project_id: string
    due_date: string
    priority: OfficePriority
  }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState(userId)
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<OfficePriority>('Normal')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onCreate({
      title: title.trim(),
      description,
      assigned_to: assignedTo,
      project_id: projectId,
      due_date: dueDate,
      priority,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">New Office Task</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              autoFocus
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400 resize-y"
            />
          </div>

          {/* Assign to + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as OfficePriority)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Project + Due date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-lg transition-colors"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
