'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUserRole } from '@/lib/useUserRole'
import { Task, TaskStatus, PersonalTask, PersonalNote } from '@/types'
import { ProjectChecklistItem } from '@/components/job-board/workspaces/ChecklistShared'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
  CalendarIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  Loader2Icon,
  StickyNoteIcon,
  ListTodoIcon,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AssignedTask = Task & { project_name: string }
type AssignedChecklist = ProjectChecklistItem & { project_name: string }

interface Props {
  userId: string
  initialAssignedTasks: AssignedTask[]
  initialAssignedChecklist: AssignedChecklist[]
  initialPersonalTasks: PersonalTask[]
  initialPersonalNotes: PersonalNote[]
}

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
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
/*  COMPONENT                                                          */
/* ================================================================== */

export default function MyWorkClient({
  userId,
  initialAssignedTasks,
  initialAssignedChecklist,
  initialPersonalTasks,
  initialPersonalNotes,
}: Props) {
  const supabase = createClient()
  const { role } = useUserRole()
  const isAdmin = role === 'admin'

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

  /* ---- Loading states ---- */
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [loadingChecklist, setLoadingChecklist] = useState(false)
  const [loadingPersonalTasks, setLoadingPersonalTasks] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)

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
    // Debounced save
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
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">My Work</h1>

      {/* ============================================================ */}
      {/*  SECTION 1: ASSIGNED WORK                                     */}
      {/* ============================================================ */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-800">Assigned Work</h2>

        {/* --- Assigned Tasks --- */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100">
            <h3 className="font-medium text-gray-700 flex items-center gap-2">
              <ListTodoIcon className="w-4 h-4 text-gray-400" />
              Assigned Tasks
              {activeTasks.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {activeTasks.length}
                </span>
              )}
            </h3>
          </div>
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

        {/* --- Assigned Checklist Items --- */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100">
            <h3 className="font-medium text-gray-700 flex items-center gap-2">
              <CheckIcon className="w-4 h-4 text-gray-400" />
              Assigned Checklist Items
              {activeChecklist.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {activeChecklist.length}
                </span>
              )}
            </h3>
          </div>
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
      </section>

      {/* ============================================================ */}
      {/*  SECTION 2: PERSONAL TASKS                                    */}
      {/* ============================================================ */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Personal Tasks</h2>
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
      </section>

      {/* ============================================================ */}
      {/*  SECTION 3: PERSONAL NOTES                                    */}
      {/* ============================================================ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Personal Notes</h2>
          <button
            onClick={addNote}
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New Note
          </button>
        </div>

        {personalNotes.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-8 text-sm text-gray-400 text-center">
            No notes yet
          </div>
        )}

        <div className="space-y-3">
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
      </section>
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
