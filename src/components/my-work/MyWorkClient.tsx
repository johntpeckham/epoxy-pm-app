'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserRole } from '@/lib/useUserRole'
import { Task, TaskStatus, PersonalTask, PersonalNote, OfficeTask } from '@/types'
import OfficeTasksWorkspace from '@/components/my-work/OfficeTasksWorkspace'
import ExpensesWorkspace from '@/components/my-work/ExpensesWorkspace'
import type { SalesmanExpenseRow } from '@/components/salesman-expenses/SalesmanExpenseCard'
import { ProjectChecklistItem } from '@/components/job-board/workspaces/ChecklistShared'
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
  CalendarIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  StickyNoteIcon,
  ListTodoIcon,
  ClipboardCheckIcon,
  CheckSquareIcon,
  Building2Icon,
  WalletIcon,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AssignedTask = Task & { project_name: string }
type AssignedChecklist = ProjectChecklistItem & { project_name: string }

type WorkspaceType = 'assigned_tasks' | 'assigned_checklist' | 'personal_tasks' | 'personal_notes' | 'office_tasks' | 'expenses' | null

interface Props {
  userId: string
  initialAssignedTasks: AssignedTask[]
  initialAssignedChecklist: AssignedChecklist[]
  initialPersonalTasks: PersonalTask[]
  initialPersonalNotes: PersonalNote[]
  initialOfficeTasks: OfficeTask[]
  initialExpenses: SalesmanExpenseRow[]
}

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

const statusColors: Record<TaskStatus, string> = {
  new_task: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  unable_to_complete: 'bg-red-100 text-red-700',
}

const statusLabels: Record<TaskStatus, string> = {
  new_task: 'New',
  in_progress: 'In Progress',
  completed: 'Completed',
  unable_to_complete: 'Unable',
}

/* ================================================================== */
/*  DASHBOARD CARD                                                     */
/* ================================================================== */

function DashboardCard({
  icon,
  title,
  onClick,
  content,
}: {
  icon: React.ReactNode
  title: string
  onClick?: () => void
  content: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-4 transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5' : 'hover:shadow-sm hover:border-gray-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-500">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div>{content}</div>
    </div>
  )
}

/* ================================================================== */
/*  WORKSPACE SHELL (local to My Work)                                 */
/* ================================================================== */

function MyWorkspaceShell({
  title,
  icon,
  onBack,
  actions,
  children,
}: {
  title: string
  icon: React.ReactNode
  onBack: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors text-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-amber-500">{icon}</span>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function MyWorkClient({
  userId,
  initialAssignedTasks,
  initialAssignedChecklist,
  initialPersonalTasks,
  initialPersonalNotes,
  initialOfficeTasks,
  initialExpenses,
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role } = useUserRole()
  const isAdmin = role === 'admin'

  /* ---- Workspace state ---- */
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceType>(null)
  const initializedFromUrl = useRef(false)
  const prevUrlRef = useRef<string | null>(null)

  /* ---- Assigned Work state ---- */
  const [assignedTasks, setAssignedTasks] = useState(initialAssignedTasks)
  const [assignedChecklist, setAssignedChecklist] = useState(initialAssignedChecklist)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [showCompletedChecklist, setShowCompletedChecklist] = useState(false)

  /* ---- Personal Tasks state ---- */
  const [personalTasks, setPersonalTasks] = useState(initialPersonalTasks)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [showCompletedPersonal, setShowCompletedPersonal] = useState(false)

  /* ---- Personal Notes state ---- */
  const [personalNotes, setPersonalNotes] = useState(initialPersonalNotes)

  /* ---- Office Tasks state ---- */
  const [officeTasks, setOfficeTasks] = useState(initialOfficeTasks)
  const [officeIncompleteCount, setOfficeIncompleteCount] = useState(
    initialOfficeTasks.filter((t) => !t.is_completed && (t.assigned_to === userId || t.created_by === userId)).length
  )
  const [showOfficeCreateModal, setShowOfficeCreateModal] = useState(false)

  /* ---- Expenses state ---- */
  const isAdminOrOM = role === 'admin' || role === 'office_manager'
  const [expenseUnpaidCount, setExpenseUnpaidCount] = useState(
    initialExpenses.filter((e) => e.status === 'Unpaid').length
  )
  const [expenseUnpaidTotal, setExpenseUnpaidTotal] = useState(
    initialExpenses.filter((e) => e.status === 'Unpaid').reduce((sum, e) => sum + e.amount, 0)
  )
  const [showExpenseCreateModal, setShowExpenseCreateModal] = useState(false)

  /* ================================================================ */
  /*  URL STATE MANAGEMENT                                             */
  /* ================================================================ */

  const buildUrl = useCallback((workspace: WorkspaceType) => {
    if (!workspace) return '/my-work'
    const params = new URLSearchParams()
    params.set('workspace', workspace)
    return `/my-work?${params.toString()}`
  }, [])

  // Restore workspace from URL on mount
  useEffect(() => {
    if (initializedFromUrl.current) return
    initializedFromUrl.current = true
    const workspace = searchParams.get('workspace') as WorkspaceType
    if (workspace && ['assigned_tasks', 'assigned_checklist', 'personal_tasks', 'personal_notes', 'office_tasks', 'expenses'].includes(workspace)) {
      setActiveWorkspace(workspace)
    }
  }, [searchParams])

  // Sync URL when workspace changes
  useEffect(() => {
    if (!initializedFromUrl.current) return
    const newUrl = buildUrl(activeWorkspace)
    if (prevUrlRef.current !== null && prevUrlRef.current !== newUrl) {
      router.push(newUrl)
    }
    prevUrlRef.current = newUrl
  }, [activeWorkspace, buildUrl, router])

  /* ================================================================ */
  /*  WORKSPACE NAVIGATION                                             */
  /* ================================================================ */

  function openWorkspace(ws: WorkspaceType) {
    setActiveWorkspace(ws)
  }

  function backToDashboard() {
    setActiveWorkspace(null)
  }

  /* ================================================================ */
  /*  ASSIGNED TASKS                                                   */
  /* ================================================================ */

  const activeTasks = assignedTasks.filter((t) => t.status !== 'completed')
  const completedTasks = assignedTasks.filter((t) => t.status === 'completed')

  async function toggleTaskStatus(task: AssignedTask) {
    const newStatus: TaskStatus = task.status === 'completed' ? 'new_task' : 'completed'
    setAssignedTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    )
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
  }

  /* ================================================================ */
  /*  ASSIGNED CHECKLIST                                               */
  /* ================================================================ */

  const activeChecklist = assignedChecklist.filter((c) => !c.is_complete)
  const completedChecklist = assignedChecklist.filter((c) => c.is_complete)

  async function toggleChecklistItem(item: AssignedChecklist) {
    if (!isAdmin) return
    const newVal = !item.is_complete
    setAssignedChecklist((prev) =>
      prev.map((c) =>
        c.id === item.id
          ? { ...c, is_complete: newVal, completed_at: newVal ? new Date().toISOString() : null }
          : c
      )
    )
    await supabase
      .from('project_checklist_items')
      .update({
        is_complete: newVal,
        completed_at: newVal ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
  }

  /* ================================================================ */
  /*  PERSONAL TASKS                                                   */
  /* ================================================================ */

  const activePersonal = personalTasks.filter((t) => !t.is_completed)
  const completedPersonal = personalTasks.filter((t) => t.is_completed)

  async function addPersonalTask() {
    const title = newTaskTitle.trim()
    if (!title) return
    setNewTaskTitle('')
    const maxSort = personalTasks.reduce((m, t) => Math.max(m, t.sort_order), 0) + 1
    const optimistic: PersonalTask = {
      id: crypto.randomUUID(),
      user_id: userId,
      title,
      is_completed: false,
      due_date: null,
      sort_order: maxSort,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setPersonalTasks((prev) => [...prev, optimistic])
    const { data } = await supabase
      .from('personal_tasks')
      .insert({ user_id: userId, title, sort_order: maxSort })
      .select()
      .single()
    if (data) {
      setPersonalTasks((prev) => prev.map((t) => (t.id === optimistic.id ? data : t)))
    }
  }

  async function togglePersonalTask(task: PersonalTask) {
    const newVal = !task.is_completed
    setPersonalTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_completed: newVal } : t))
    )
    await supabase
      .from('personal_tasks')
      .update({ is_completed: newVal, updated_at: new Date().toISOString() })
      .eq('id', task.id)
  }

  async function updatePersonalTaskTitle(id: string, title: string) {
    setPersonalTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
    await supabase
      .from('personal_tasks')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function updatePersonalTaskDueDate(id: string, due_date: string | null) {
    setPersonalTasks((prev) => prev.map((t) => (t.id === id ? { ...t, due_date } : t)))
    await supabase
      .from('personal_tasks')
      .update({ due_date, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function deletePersonalTask(id: string) {
    setPersonalTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('personal_tasks').delete().eq('id', id)
  }

  /* ================================================================ */
  /*  PERSONAL NOTES                                                   */
  /* ================================================================ */

  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({})

  async function addNote() {
    const optimistic: PersonalNote = {
      id: crypto.randomUUID(),
      user_id: userId,
      title: 'Untitled Note',
      content: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setPersonalNotes((prev) => [optimistic, ...prev])
    const { data } = await supabase
      .from('personal_notes')
      .insert({ user_id: userId })
      .select()
      .single()
    if (data) {
      setPersonalNotes((prev) => prev.map((n) => (n.id === optimistic.id ? data : n)))
    }
  }

  function updateNoteLocal(id: string, field: 'title' | 'content', value: string) {
    setPersonalNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, [field]: value } : n))
    )
    const key = `${id}-${field}`
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key])
    debounceTimers.current[key] = setTimeout(async () => {
      await supabase
        .from('personal_notes')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', id)
    }, 800)
  }

  function saveNoteNow(id: string, field: 'title' | 'content', value: string) {
    const key = `${id}-${field}`
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key])
    supabase
      .from('personal_notes')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  async function deleteNote(id: string) {
    setPersonalNotes((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('personal_notes').delete().eq('id', id)
  }

  /* ================================================================ */
  /*  RENDER — WORKSPACES                                              */
  /* ================================================================ */

  if (activeWorkspace === 'assigned_tasks') {
    return (
      <MyWorkspaceShell
        title="Assigned Field Tasks"
        icon={<ListTodoIcon className="w-5 h-5" />}
        onBack={backToDashboard}
      >
        <div className="p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="divide-y divide-gray-50">
              {activeTasks.length === 0 && (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">
                  No tasks assigned to you
                </p>
              )}
              {activeTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => toggleTaskStatus(task)}
                    className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 flex-shrink-0 flex items-center justify-center hover:border-amber-500 transition-colors"
                  >
                    {task.status === 'completed' && (
                      <CheckIcon className="w-3 h-3 text-amber-500" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Link
                        href={`/job-board?project=${task.project_id}`}
                        className="text-xs text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
                      >
                        {task.project_name}
                        <ExternalLinkIcon className="w-3 h-3" />
                      </Link>
                      {task.due_date && (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            isOverdue(task.due_date) ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}
                        >
                          <CalendarIcon className="w-3 h-3" />
                          {formatDate(task.due_date)}
                          {isOverdue(task.due_date) && (
                            <AlertCircleIcon className="w-3 h-3 text-red-500" />
                          )}
                        </span>
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${statusColors[task.status]}`}
                      >
                        {statusLabels[task.status]}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {completedTasks.length > 0 && (
              <div className="border-t border-gray-100">
                <button
                  onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                  className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showCompletedTasks ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  Completed ({completedTasks.length})
                </button>
                {showCompletedTasks && (
                  <div className="divide-y divide-gray-50">
                    {completedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 px-4 sm:px-5 py-3 opacity-60"
                      >
                        <button
                          onClick={() => toggleTaskStatus(task)}
                          className="mt-0.5 w-5 h-5 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center"
                        >
                          <CheckIcon className="w-3 h-3 text-amber-500" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-500 line-through truncate">
                            {task.title}
                          </p>
                          <Link
                            href={`/job-board?project=${task.project_id}`}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            {task.project_name}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'assigned_checklist') {
    return (
      <MyWorkspaceShell
        title="Assigned Checklist Items"
        icon={<ClipboardCheckIcon className="w-5 h-5" />}
        onBack={backToDashboard}
      >
        <div className="p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="divide-y divide-gray-50">
              {activeChecklist.length === 0 && (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">
                  No checklist items assigned to you
                </p>
              )}
              {activeChecklist.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => toggleChecklistItem(item)}
                    disabled={!isAdmin}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      isAdmin
                        ? 'border-gray-300 hover:border-amber-500 cursor-pointer'
                        : 'border-gray-200 cursor-default'
                    }`}
                  >
                    {item.is_complete && <CheckIcon className="w-3 h-3 text-amber-500" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Link
                        href={`/job-board?project=${item.project_id}`}
                        className="text-xs text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1"
                      >
                        {item.project_name}
                        <ExternalLinkIcon className="w-3 h-3" />
                      </Link>
                      {item.group_name && (
                        <span className="text-xs text-gray-400">{item.group_name}</span>
                      )}
                      {item.due_date && (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            isOverdue(item.due_date) ? 'text-red-600 font-medium' : 'text-gray-500'
                          }`}
                        >
                          <CalendarIcon className="w-3 h-3" />
                          {formatDate(item.due_date)}
                          {isOverdue(item.due_date) && (
                            <AlertCircleIcon className="w-3 h-3 text-red-500" />
                          )}
                        </span>
                      )}
                      {!isAdmin && (
                        <span className="text-xs text-gray-400 italic">Read-only</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {completedChecklist.length > 0 && (
              <div className="border-t border-gray-100">
                <button
                  onClick={() => setShowCompletedChecklist(!showCompletedChecklist)}
                  className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showCompletedChecklist ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  Completed ({completedChecklist.length})
                </button>
                {showCompletedChecklist && (
                  <div className="divide-y divide-gray-50">
                    {completedChecklist.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 px-4 sm:px-5 py-3 opacity-60"
                      >
                        <button
                          onClick={() => toggleChecklistItem(item)}
                          disabled={!isAdmin}
                          className="mt-0.5 w-5 h-5 rounded border-2 border-amber-400 bg-amber-50 flex-shrink-0 flex items-center justify-center"
                        >
                          <CheckIcon className="w-3 h-3 text-amber-500" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-500 line-through truncate">
                            {item.name}
                          </p>
                          <Link
                            href={`/job-board?project=${item.project_id}`}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            {item.project_name}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'personal_tasks') {
    return (
      <MyWorkspaceShell
        title="Personal Tasks"
        icon={<CheckSquareIcon className="w-5 h-5" />}
        onBack={backToDashboard}
      >
        <div className="p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            {/* Add task input */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                addPersonalTask()
              }}
              className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-gray-100"
            >
              <PlusIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add a task..."
                className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-900"
              />
              {newTaskTitle.trim() && (
                <button
                  type="submit"
                  className="text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 transition-colors"
                >
                  Add
                </button>
              )}
            </form>

            <div className="divide-y divide-gray-50">
              {activePersonal.length === 0 && !newTaskTitle && (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">
                  No personal tasks yet — add one above
                </p>
              )}
              {activePersonal.map((task) => (
                <PersonalTaskRow
                  key={task.id}
                  task={task}
                  onToggle={togglePersonalTask}
                  onUpdateTitle={updatePersonalTaskTitle}
                  onUpdateDueDate={updatePersonalTaskDueDate}
                  onDelete={deletePersonalTask}
                />
              ))}
            </div>

            {completedPersonal.length > 0 && (
              <div className="border-t border-gray-100">
                <button
                  onClick={() => setShowCompletedPersonal(!showCompletedPersonal)}
                  className="w-full flex items-center gap-2 px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showCompletedPersonal ? (
                    <ChevronDownIcon className="w-4 h-4" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4" />
                  )}
                  Completed ({completedPersonal.length})
                </button>
                {showCompletedPersonal && (
                  <div className="divide-y divide-gray-50">
                    {completedPersonal.map((task) => (
                      <PersonalTaskRow
                        key={task.id}
                        task={task}
                        onToggle={togglePersonalTask}
                        onUpdateTitle={updatePersonalTaskTitle}
                        onUpdateDueDate={updatePersonalTaskDueDate}
                        onDelete={deletePersonalTask}
                        completed
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'personal_notes') {
    return (
      <MyWorkspaceShell
        title="Personal Notes"
        icon={<StickyNoteIcon className="w-5 h-5" />}
        onBack={backToDashboard}
        actions={
          <button
            onClick={addNote}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New Note
          </button>
        }
      >
        <div className="p-4 space-y-3">
          {personalNotes.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-8 text-sm text-gray-400 text-center">
              No notes yet — click &quot;New Note&quot; to create one
            </div>
          )}
          {personalNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onUpdateField={updateNoteLocal}
              onSaveNow={saveNoteNow}
              onDelete={deleteNote}
            />
          ))}
        </div>
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'office_tasks') {
    return (
      <MyWorkspaceShell
        title="Office / Shop Tasks"
        icon={<Building2Icon className="w-5 h-5" />}
        onBack={backToDashboard}
        actions={
          <button
            onClick={() => setShowOfficeCreateModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        }
      >
        <OfficeTasksWorkspace
          userId={userId}
          role={role}
          initialOfficeTasks={officeTasks}
          onCountChange={setOfficeIncompleteCount}
          showCreateModal={showOfficeCreateModal}
          onCloseCreateModal={() => setShowOfficeCreateModal(false)}
        />
      </MyWorkspaceShell>
    )
  }

  if (activeWorkspace === 'expenses') {
    const expenseTitle = isAdminOrOM ? 'Employee Expenses' : 'Personal Expenses'
    return (
      <MyWorkspaceShell
        title={expenseTitle}
        icon={<WalletIcon className="w-5 h-5" />}
        onBack={backToDashboard}
        actions={
          <button
            onClick={() => setShowExpenseCreateModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        }
      >
        <ExpensesWorkspace
          userId={userId}
          userRole={role}
          initialExpenses={initialExpenses}
          showCreateModal={showExpenseCreateModal}
          onCloseCreateModal={() => setShowExpenseCreateModal(false)}
          onCountChange={(count, total) => {
            setExpenseUnpaidCount(count)
            setExpenseUnpaidTotal(total)
          }}
        />
      </MyWorkspaceShell>
    )
  }

  /* ================================================================ */
  /*  RENDER — DASHBOARD CARDS                                         */
  /* ================================================================ */

  function formatCurrency(val: number) {
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">My Work</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {/* Card 1: Assigned Field Tasks */}
        <DashboardCard
          icon={<ListTodoIcon className="w-5 h-5" />}
          title="Assigned Field Tasks"
          onClick={() => openWorkspace('assigned_tasks')}
          content={
            activeTasks.length > 0 ? (
              <div className="space-y-0.5">
                <p className="text-xs text-gray-500">{activeTasks.length} incomplete</p>
                {activeTasks.filter((t) => isOverdue(t.due_date)).length > 0 && (
                  <p className="text-xs text-red-600">
                    {activeTasks.filter((t) => isOverdue(t.due_date)).length} overdue
                  </p>
                )}
                {completedTasks.length > 0 && (
                  <p className="text-xs text-green-600">{completedTasks.length} completed</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No tasks assigned</p>
            )
          }
        />

        {/* Card 2: Assigned Checklist Items */}
        <DashboardCard
          icon={<ClipboardCheckIcon className="w-5 h-5" />}
          title="Assigned Checklist Items"
          onClick={() => openWorkspace('assigned_checklist')}
          content={
            activeChecklist.length > 0 ? (
              <div className="space-y-0.5">
                <p className="text-xs text-gray-500">{activeChecklist.length} incomplete</p>
                {activeChecklist.filter((c) => isOverdue(c.due_date)).length > 0 && (
                  <p className="text-xs text-red-600">
                    {activeChecklist.filter((c) => isOverdue(c.due_date)).length} overdue
                  </p>
                )}
                {completedChecklist.length > 0 && (
                  <p className="text-xs text-green-600">{completedChecklist.length} completed</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No checklist items assigned</p>
            )
          }
        />

        {/* Card 3: Personal Tasks */}
        <DashboardCard
          icon={<CheckSquareIcon className="w-5 h-5" />}
          title="Personal Tasks"
          onClick={() => openWorkspace('personal_tasks')}
          content={
            activePersonal.length > 0 ? (
              <div className="space-y-0.5">
                <p className="text-xs text-gray-500">{activePersonal.length} incomplete</p>
                {activePersonal.filter((t) => isOverdue(t.due_date) && !t.is_completed).length > 0 && (
                  <p className="text-xs text-red-600">
                    {activePersonal.filter((t) => isOverdue(t.due_date) && !t.is_completed).length} overdue
                  </p>
                )}
                {completedPersonal.length > 0 && (
                  <p className="text-xs text-green-600">{completedPersonal.length} completed</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No personal tasks</p>
            )
          }
        />

        {/* Card 4: Office / Shop Tasks */}
        <DashboardCard
          icon={<Building2Icon className="w-5 h-5" />}
          title="Office / Shop Tasks"
          onClick={() => openWorkspace('office_tasks')}
          content={
            officeIncompleteCount > 0 ? (
              <div className="space-y-0.5">
                <p className="text-xs text-gray-500">{officeIncompleteCount} incomplete</p>
                {officeTasks.filter((t) => !t.is_completed && isOverdue(t.due_date) && (t.assigned_to === userId || t.created_by === userId)).length > 0 && (
                  <p className="text-xs text-red-600">
                    {officeTasks.filter((t) => !t.is_completed && isOverdue(t.due_date) && (t.assigned_to === userId || t.created_by === userId)).length} overdue
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No office tasks</p>
            )
          }
        />

        {/* Card 5: Expenses */}
        <DashboardCard
          icon={<WalletIcon className="w-5 h-5" />}
          title={isAdminOrOM ? 'Employee Expenses' : 'Personal Expenses'}
          onClick={() => openWorkspace('expenses')}
          content={
            expenseUnpaidCount > 0 ? (
              <div className="space-y-0.5">
                <p className="text-xs text-gray-500">{expenseUnpaidCount} unpaid</p>
                <p className="text-xs text-amber-600 font-medium tabular-nums">{formatCurrency(expenseUnpaidTotal)}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No unpaid expenses</p>
            )
          }
        />

        {/* Card 6: Personal Notes */}
        <DashboardCard
          icon={<StickyNoteIcon className="w-5 h-5" />}
          title="Personal Notes"
          onClick={() => openWorkspace('personal_notes')}
          content={
            personalNotes.length > 0 ? (
              <div className="space-y-0.5">
                <p className="text-xs text-gray-500">{personalNotes.length} note{personalNotes.length !== 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-400 truncate">{personalNotes[0].title}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No notes yet</p>
            )
          }
        />
      </div>
    </div>
  )
}

/* ================================================================== */
/*  PERSONAL TASK ROW                                                  */
/* ================================================================== */

function PersonalTaskRow({
  task,
  onToggle,
  onUpdateTitle,
  onUpdateDueDate,
  onDelete,
  completed,
}: {
  task: PersonalTask
  onToggle: (t: PersonalTask) => void
  onUpdateTitle: (id: string, title: string) => void
  onUpdateDueDate: (id: string, d: string | null) => void
  onDelete: (id: string) => void
  completed?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(task.title)
  }, [task.title])

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  function commitTitle() {
    setEditing(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdateTitle(task.id, trimmed)
    } else {
      setTitle(task.title)
    }
  }

  return (
    <div
      className={`flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors group ${
        completed ? 'opacity-60' : ''
      }`}
    >
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
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle()
              if (e.key === 'Escape') {
                setTitle(task.title)
                setEditing(false)
              }
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
        {task.due_date && (
          <span
            className={`text-xs flex items-center gap-1 mt-1 ${
              isOverdue(task.due_date) && !task.is_completed
                ? 'text-red-600 font-medium'
                : 'text-gray-500'
            }`}
          >
            <CalendarIcon className="w-3 h-3" />
            {formatDate(task.due_date)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <input
          type="date"
          value={task.due_date || ''}
          onChange={(e) => onUpdateDueDate(task.id, e.target.value || null)}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white w-[110px]"
        />
        <button
          onClick={() => onDelete(task.id)}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2Icon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  NOTE CARD                                                          */
/* ================================================================== */

function NoteCard({
  note,
  onUpdateField,
  onSaveNow,
  onDelete,
}: {
  note: PersonalNote
  onUpdateField: (id: string, field: 'title' | 'content', value: string) => void
  onSaveNow: (id: string, field: 'title' | 'content', value: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [localTitle, setLocalTitle] = useState(note.title)
  const [localContent, setLocalContent] = useState(note.content ?? '')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalTitle(note.title)
    setLocalContent(note.content ?? '')
  }, [note.title, note.content])

  useEffect(() => {
    if (editingTitle && titleRef.current) titleRef.current.focus()
  }, [editingTitle])

  const timeAgo = (() => {
    const diff = Date.now() - new Date(note.updated_at).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  })()

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3">
        <StickyNoteIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleRef}
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => {
                setEditingTitle(false)
                const trimmed = localTitle.trim() || 'Untitled Note'
                onSaveNow(note.id, 'title', trimmed)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEditingTitle(false)
                  const trimmed = localTitle.trim() || 'Untitled Note'
                  onSaveNow(note.id, 'title', trimmed)
                }
              }}
              className="text-sm font-medium w-full bg-transparent outline-none border-b border-amber-400 text-gray-900 pb-0.5"
            />
          ) : (
            <p
              onClick={() => setEditingTitle(true)}
              className="text-sm font-medium text-gray-900 truncate cursor-text"
            >
              {note.title}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">{timeAgo}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {expanded ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={() => onDelete(note.id)}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2Icon className="w-4 h-4" />
        </button>
      </div>
      {expanded && (
        <div className="px-4 sm:px-5 pb-4">
          <textarea
            value={localContent}
            onChange={(e) => {
              setLocalContent(e.target.value)
              onUpdateField(note.id, 'content', e.target.value)
            }}
            onBlur={() => onSaveNow(note.id, 'content', localContent)}
            placeholder="Write your note here..."
            rows={4}
            className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 resize-y placeholder-gray-400"
          />
        </div>
      )}
    </div>
  )
}
