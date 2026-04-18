'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  BarChart3Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListChecksIcon,
  PlusIcon,
  Settings2Icon,
} from 'lucide-react'
import type { AssignedTask, AssignedTaskCompletion, UserRole } from '@/types'
import TeamTasksSection from './TeamTasksSection'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function tasksForDate(tasks: AssignedTask[], date: Date): AssignedTask[] {
  const dayOfWeek = date.getDay()
  const dateKey = toDateKey(date)
  return tasks
    .filter((t) => t.is_active)
    .filter((t) => {
      if (t.task_type === 'daily') return true
      if (t.task_type === 'weekly') return t.day_of_week === dayOfWeek
      if (t.task_type === 'one_time') return t.specific_date === dateKey
      return false
    })
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  userId: string
  userRole: UserRole
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MyTasksCard({ userId, userRole }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const isAdmin = userRole === 'admin'

  const [viewDate, setViewDate] = useState<Date>(() => startOfToday())
  const [tasks, setTasks] = useState<AssignedTask[]>([])
  const [completions, setCompletions] = useState<AssignedTaskCompletion[]>([])
  const [loading, setLoading] = useState(true)
  const [noteTaskId, setNoteTaskId] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [savingNewTask, setSavingNewTask] = useState(false)
  const [teamExpanded, setTeamExpanded] = useState(false)

  const today = startOfToday()
  const isToday = isSameDay(viewDate, today)
  const dateKey = toDateKey(viewDate)

  /* ---- Load my tasks + completions for viewDate ---- */
  const loadData = useCallback(async () => {
    setLoading(true)
    const [tasksRes, completionsRes] = await Promise.all([
      supabase
        .from('assigned_tasks')
        .select('*')
        .eq('assigned_to', userId)
        .eq('is_active', true),
      supabase
        .from('assigned_task_completions')
        .select('*')
        .eq('user_id', userId)
        .eq('completion_date', dateKey),
    ])
    if (tasksRes.data) setTasks(tasksRes.data as AssignedTask[])
    if (completionsRes.data)
      setCompletions(completionsRes.data as AssignedTaskCompletion[])
    setLoading(false)
  }, [supabase, userId, dateKey])

  useEffect(() => {
    loadData()
  }, [loadData])

  /* ---- Check yesterday's uncompleted tasks on mount (once per day) ---- */
  useEffect(() => {
    const todayKey = toDateKey(today)
    const storageKey = `assigned_tasks_notified_${userId}`
    if (typeof window === 'undefined') return
    const lastNotified = window.localStorage.getItem(storageKey)
    if (lastNotified === todayKey) return

    let cancelled = false
    const checkYesterday = async () => {
      const yesterday = addDays(today, -1)
      const yesterdayKey = toDateKey(yesterday)
      const { data: myTasks } = await supabase
        .from('assigned_tasks')
        .select('*')
        .eq('assigned_to', userId)
        .eq('is_active', true)
      if (cancelled) return
      const applicableYesterday = tasksForDate(
        (myTasks ?? []) as AssignedTask[],
        yesterday
      )
      if (applicableYesterday.length === 0) {
        window.localStorage.setItem(storageKey, todayKey)
        return
      }
      const taskIds = applicableYesterday.map((t) => t.id)
      const { data: yComps } = await supabase
        .from('assigned_task_completions')
        .select('*')
        .eq('user_id', userId)
        .eq('completion_date', yesterdayKey)
        .in('task_id', taskIds)
      if (cancelled) return
      const completedIds = new Set(
        (yComps ?? [])
          .filter((c) => (c as AssignedTaskCompletion).is_completed)
          .map((c) => (c as AssignedTaskCompletion).task_id)
      )
      const uncompleted = applicableYesterday.filter((t) => !completedIds.has(t.id))
      if (uncompleted.length > 0) {
        // Check if we already created one for this user for this notification day
        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'assigned_tasks_uncompleted')
          .gte('created_at', `${todayKey}T00:00:00.000Z`)
          .limit(1)
        if (!cancelled && (!existingNotif || existingNotif.length === 0)) {
          await supabase.from('notifications').insert({
            user_id: userId,
            type: 'assigned_tasks_uncompleted',
            title: 'Uncompleted tasks',
            message: `You have ${uncompleted.length} uncompleted task${
              uncompleted.length === 1 ? '' : 's'
            } from ${formatLongDate(yesterday)}`,
            link: `/my-work?tasks_date=${yesterdayKey}`,
            read: false,
          })
        }
      }
      window.localStorage.setItem(storageKey, todayKey)
    }
    checkYesterday()
    return () => {
      cancelled = true
    }
    // Only run once per mount (today is computed at render; userId is stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  /* ---- Read tasks_date query param to jump to a past date ---- */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const target = params.get('tasks_date')
    if (target) {
      const parsed = new Date(target + 'T00:00:00')
      if (!Number.isNaN(parsed.getTime())) {
        setViewDate(parsed)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- Derived: tasks applicable on viewDate, split by type ---- */
  const applicable = useMemo(() => tasksForDate(tasks, viewDate), [tasks, viewDate])
  const dailyTasks = applicable.filter((t) => t.task_type === 'daily')
  const weeklyTasks = applicable.filter((t) => t.task_type === 'weekly')
  const oneTimeTasks = applicable.filter((t) => t.task_type === 'one_time')

  const completionByTaskId = useMemo(() => {
    const m = new Map<string, AssignedTaskCompletion>()
    completions.forEach((c) => m.set(c.task_id, c))
    return m
  }, [completions])

  const totalCount = applicable.length
  const completedCount = applicable.filter(
    (t) => completionByTaskId.get(t.id)?.is_completed
  ).length

  /* ---- Navigation ---- */
  const goPrev = () => setViewDate((d) => addDays(d, -1))
  const goNext = () => {
    setViewDate((d) => {
      const next = addDays(d, 1)
      return next.getTime() > today.getTime() ? d : next
    })
  }
  const canGoNext = viewDate.getTime() < today.getTime()

  /* ---- Toggle completion ---- */
  async function markCompleted(task: AssignedTask) {
    const existing = completionByTaskId.get(task.id)
    const now = new Date().toISOString()
    if (existing) {
      // Optimistic update
      setCompletions((prev) =>
        prev.map((c) =>
          c.id === existing.id
            ? { ...c, is_completed: true, note: null, completed_at: now }
            : c
        )
      )
      await supabase
        .from('assigned_task_completions')
        .update({ is_completed: true, note: null, completed_at: now })
        .eq('id', existing.id)
    } else {
      const tempId = `temp-${task.id}`
      const optimistic: AssignedTaskCompletion = {
        id: tempId,
        task_id: task.id,
        user_id: userId,
        completion_date: dateKey,
        is_completed: true,
        note: null,
        completed_at: now,
        created_at: now,
        updated_at: now,
      }
      setCompletions((prev) => [...prev, optimistic])
      const { data } = await supabase
        .from('assigned_task_completions')
        .insert({
          task_id: task.id,
          user_id: userId,
          completion_date: dateKey,
          is_completed: true,
          completed_at: now,
        })
        .select()
        .single()
      if (data) {
        setCompletions((prev) =>
          prev.map((c) => (c.id === tempId ? (data as AssignedTaskCompletion) : c))
        )
      }
    }
  }

  async function markIncomplete(task: AssignedTask) {
    const existing = completionByTaskId.get(task.id)
    if (!existing) return
    // Optimistic: clear completion flag + note, fully reset
    setCompletions((prev) =>
      prev.map((c) =>
        c.id === existing.id
          ? { ...c, is_completed: false, note: null, completed_at: null }
          : c
      )
    )
    await supabase
      .from('assigned_task_completions')
      .update({ is_completed: false, note: null, completed_at: null })
      .eq('id', existing.id)
  }

  function openUncheck(task: AssignedTask) {
    setNoteTaskId(task.id)
    const existing = completionByTaskId.get(task.id)
    setNoteValue(existing?.note ?? '')
  }

  async function saveUncheck() {
    if (!noteTaskId) return
    const existing = completionByTaskId.get(noteTaskId)
    const now = new Date().toISOString()
    if (existing) {
      setCompletions((prev) =>
        prev.map((c) =>
          c.id === existing.id
            ? { ...c, is_completed: false, note: noteValue || null, completed_at: null }
            : c
        )
      )
      await supabase
        .from('assigned_task_completions')
        .update({
          is_completed: false,
          note: noteValue || null,
          completed_at: null,
        })
        .eq('id', existing.id)
    } else {
      const tempId = `temp-${noteTaskId}`
      const optimistic: AssignedTaskCompletion = {
        id: tempId,
        task_id: noteTaskId,
        user_id: userId,
        completion_date: dateKey,
        is_completed: false,
        note: noteValue || null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      }
      setCompletions((prev) => [...prev, optimistic])
      const { data } = await supabase
        .from('assigned_task_completions')
        .insert({
          task_id: noteTaskId,
          user_id: userId,
          completion_date: dateKey,
          is_completed: false,
          note: noteValue || null,
        })
        .select()
        .single()
      if (data) {
        setCompletions((prev) =>
          prev.map((c) => (c.id === tempId ? (data as AssignedTaskCompletion) : c))
        )
      }
    }
    setNoteTaskId(null)
    setNoteValue('')
  }

  /* ---- Create new task ---- */
  async function createNewTask() {
    if (!newTaskTitle.trim()) return
    setSavingNewTask(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('assigned_tasks')
      .insert({
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || null,
        task_type: 'one_time' as const,
        day_of_week: null,
        specific_date: dateKey,
        assigned_to: userId,
        created_by: user?.id ?? null,
        is_active: true,
      })
      .select()
      .single()
    if (data) {
      setTasks((prev) => [...prev, data as AssignedTask])
    }
    setNewTaskTitle('')
    setNewTaskDesc('')
    setShowNewTask(false)
    setSavingNewTask(false)
  }

  /* ---- Render ---- */
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] transition-all" style={{ borderLeft: '4px solid rgba(239, 159, 39, 0.55)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <ListChecksIcon className="w-5 h-5 flex-shrink-0 text-amber-500" />
        <h3 className="text-sm font-medium text-gray-900 dark:text-white flex-1">Daily Playbook</h3>
        <button
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-white px-2 py-1 rounded-lg text-xs font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-3 h-3" />
          New
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="p-1 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition"
            title="Previous day"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-600 dark:text-gray-300 font-medium min-w-[90px] text-center">
            {isToday ? 'Today' : formatLongDate(viewDate)}
          </span>
          <button
            onClick={goNext}
            disabled={!canGoNext}
            className="p-1 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 disabled:cursor-not-allowed"
            title="Next day"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, background: '#EF9F27' }}
          />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums">
          {completedCount} / {totalCount}
        </span>
      </div>

      {/* Inline new task form */}
      {showNewTask && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252525]">
          <input
            autoFocus
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Task name"
            className="w-full text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-gray-100 focus:outline-none focus:border-amber-500 mb-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) createNewTask()
              if (e.key === 'Escape') { setShowNewTask(false); setNewTaskTitle(''); setNewTaskDesc('') }
            }}
          />
          <input
            value={newTaskDesc}
            onChange={(e) => setNewTaskDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-gray-100 focus:outline-none focus:border-amber-500 mb-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter') createNewTask()
              if (e.key === 'Escape') { setShowNewTask(false); setNewTaskTitle(''); setNewTaskDesc('') }
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setShowNewTask(false); setNewTaskTitle(''); setNewTaskDesc('') }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={createNewTask}
              disabled={!newTaskTitle.trim() || savingNewTask}
              className="text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded-lg transition"
            >
              {savingNewTask ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">Loading…</p>
      ) : totalCount === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">
          No tasks for this day
        </p>
      ) : (
        <div className="space-y-4 px-4 pb-4 pt-1">
          <TaskSection
            label="Daily tasks"
            tasks={dailyTasks}
            completionByTaskId={completionByTaskId}
            noteTaskId={noteTaskId}
            noteValue={noteValue}
            onCheckBox={markCompleted}
            onUncheckBox={markIncomplete}
            onOpenNote={openUncheck}
            onNoteChange={setNoteValue}
            onSaveNote={saveUncheck}
            onCancelNote={() => {
              setNoteTaskId(null)
              setNoteValue('')
            }}
          />
          <TaskSection
            label="Weekly tasks"
            tasks={weeklyTasks}
            completionByTaskId={completionByTaskId}
            noteTaskId={noteTaskId}
            noteValue={noteValue}
            onCheckBox={markCompleted}
            onUncheckBox={markIncomplete}
            onOpenNote={openUncheck}
            onNoteChange={setNoteValue}
            onSaveNote={saveUncheck}
            onCancelNote={() => {
              setNoteTaskId(null)
              setNoteValue('')
            }}
          />
          {oneTimeTasks.length > 0 && (
            <TaskSection
              label="One-time tasks"
              tasks={oneTimeTasks}
              completionByTaskId={completionByTaskId}
              noteTaskId={noteTaskId}
              noteValue={noteValue}
              onCheckBox={markCompleted}
              onUncheckBox={markIncomplete}
              onOpenNote={openUncheck}
              onNoteChange={setNoteValue}
              onSaveNote={saveUncheck}
              onCancelNote={() => {
                setNoteTaskId(null)
                setNoteValue('')
              }}
            />
          )}
        </div>
      )}

      {/* Admin: Team Playbook section + management links */}
      {isAdmin && (
        <div className="px-4 pb-3 mt-2">
          <button
            onClick={() => setTeamExpanded((v) => !v)}
            className="flex items-center gap-1.5 w-full text-left py-1.5"
          >
            {teamExpanded ? (
              <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400" />
            )}
            <span className="text-[12px] text-gray-400 dark:text-gray-500">Team Playbook</span>
          </button>
          {teamExpanded && (
            <>
              <div className="mt-1">
                <TeamTasksSection currentUserId={userId} />
              </div>
              <div className="mt-3 flex justify-end items-center gap-1">
                <Link
                  href="/my-work/employee-summary"
                  className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                >
                  <BarChart3Icon className="w-4 h-4" />
                  Employee summary
                </Link>
                <Link
                  href="/my-work/manage-playbook"
                  className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                >
                  <Settings2Icon className="w-4 h-4" />
                  Manage tasks
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Task section (list with divider)                                   */
/* ------------------------------------------------------------------ */

function TaskSection({
  label,
  tasks,
  completionByTaskId,
  noteTaskId,
  noteValue,
  onCheckBox,
  onUncheckBox,
  onOpenNote,
  onNoteChange,
  onSaveNote,
  onCancelNote,
}: {
  label: string
  tasks: AssignedTask[]
  completionByTaskId: Map<string, AssignedTaskCompletion>
  noteTaskId: string | null
  noteValue: string
  onCheckBox: (t: AssignedTask) => void
  onUncheckBox: (t: AssignedTask) => void
  onOpenNote: (t: AssignedTask) => void
  onNoteChange: (v: string) => void
  onSaveNote: () => void
  onCancelNote: () => void
}) {
  if (tasks.length === 0) return null
  return (
    <div>
      <p className="text-[12px] text-gray-400 dark:text-gray-500 mb-1.5">{label}</p>
      <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg overflow-hidden">
        {tasks.map((task) => {
          const c = completionByTaskId.get(task.id)
          const isDone = !!c?.is_completed
          const editingNote = noteTaskId === task.id
          return (
            <div key={task.id} className="py-2 px-5">
              <div className="flex items-start gap-2.5">
                <button
                  onClick={() => (isDone ? onUncheckBox(task) : onCheckBox(task))}
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isDone
                      ? 'border-amber-400 bg-amber-50 hover:border-amber-500'
                      : 'border-gray-300 dark:border-gray-500 hover:border-amber-500'
                  }`}
                >
                  {isDone && <CheckIcon className="w-2.5 h-2.5 text-amber-500" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs font-medium truncate ${
                      isDone ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {task.description}
                    </p>
                  )}
                </div>
                {isDone ? (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5">Complete</span>
                ) : !editingNote ? (
                  c?.note ? (
                    <button
                      onClick={() => onOpenNote(task)}
                      className="text-xs font-medium flex-shrink-0 mt-0.5 hover:opacity-80"
                      style={{ color: '#E24B4A' }}
                      title={`Not completed: ${c.note}`}
                    >
                      Incomplete
                    </button>
                  ) : (
                    <button
                      onClick={() => onOpenNote(task)}
                      className="text-xs font-medium flex-shrink-0 mt-0.5 hover:opacity-80"
                      style={{ color: '#E24B4A' }}
                    >
                      Incomplete
                    </button>
                  )
                ) : null}
              </div>
              {!isDone && c?.note && !editingNote && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 italic mt-1 ml-6">
                  {'"'}{c.note}{'"'}
                </p>
              )}
              {editingNote && (
                <div className="mt-2 pl-6.5 ml-6 flex items-center gap-2">
                  <input
                    autoFocus
                    value={noteValue}
                    onChange={(e) => onNoteChange(e.target.value)}
                    placeholder="Why wasn't this completed?"
                    className="flex-1 text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-gray-100 focus:outline-none focus:border-amber-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveNote()
                      if (e.key === 'Escape') onCancelNote()
                    }}
                  />
                  <button
                    onClick={onSaveNote}
                    className="text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30"
                  >
                    Save
                  </button>
                  <button
                    onClick={onCancelNote}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

