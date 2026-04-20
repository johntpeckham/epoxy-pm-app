'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CalendarDaysIcon,
  PlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'

interface ExecTask {
  id: string
  company_id: string | null
  title: string
  description: string | null
  category: string
  due_date: string
  recurrence: string | null
  status: string
  completed_at: string | null
  completed_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

const CATEGORIES = ['Filing', 'Tax', 'Insurance', 'License', 'Other'] as const
const RECURRENCE_OPTIONS = [
  { value: 'one_time', label: 'One-time' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'every_2_years', label: 'Every 2 years' },
  { value: 'every_4_years', label: 'Every 4 years' },
] as const

function daysDiff(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

function recurrenceLabel(r: string | null): string {
  if (!r) return ''
  return RECURRENCE_OPTIONS.find(x => x.value === r)?.label ?? r
}

function relativeTime(dateStr: string): { text: string; cls: string } {
  const d = daysDiff(dateStr)
  if (d < 0) return { text: `${-d}d overdue`, cls: 'text-red-600 font-medium' }
  if (d === 0) return { text: 'Due today', cls: 'text-amber-600 font-medium' }
  if (d <= 30) return { text: `${d}d left`, cls: 'text-amber-600 font-medium' }
  if (d <= 365) return { text: `${Math.round(d / 30)}mo`, cls: 'text-gray-500' }
  const yr = Math.floor(d / 365)
  const mo = Math.round((d % 365) / 30)
  return { text: mo > 0 ? `${yr}yr ${mo}mo` : `${yr}yr`, cls: 'text-gray-400' }
}

function calcNextDue(current: string, recurrence: string): string {
  const d = new Date(current + 'T00:00:00')
  switch (recurrence) {
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    case 'every_2_years': d.setFullYear(d.getFullYear() + 2); break
    case 'every_4_years': d.setFullYear(d.getFullYear() + 4); break
  }
  return d.toISOString().split('T')[0]
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

/* ================================================================== */

export default function ExecutiveTasksCard({ userId }: { userId: string }) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<ExecTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<ExecTask | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [longTermOpen, setLongTermOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('executive_tasks')
      .select('*')
      .order('due_date', { ascending: true })
      .then(({ data }) => {
        setTasks((data as ExecTask[]) ?? [])
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeTasks = useMemo(() => tasks.filter(t => t.status === 'active'), [tasks])

  const needsAttention = useMemo(
    () => activeTasks.filter(t => daysDiff(t.due_date) <= 30)
      .sort((a, b) => daysDiff(a.due_date) - daysDiff(b.due_date)),
    [activeTasks],
  )
  const upcoming = useMemo(
    () => activeTasks.filter(t => { const d = daysDiff(t.due_date); return d > 30 && d <= 365 })
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [activeTasks],
  )
  const longTerm = useMemo(
    () => activeTasks.filter(t => daysDiff(t.due_date) > 365)
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [activeTasks],
  )
  const completedTasks = useMemo(
    () => tasks.filter(t => t.status === 'completed')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
      .slice(0, 10),
    [tasks],
  )

  const overdueCount = needsAttention.filter(t => daysDiff(t.due_date) < 0).length
  const dueSoonCount = needsAttention.filter(t => daysDiff(t.due_date) >= 0).length

  /* ── CRUD ── */

  async function handleCreate(data: {
    title: string; description: string; category: string; due_date: string; recurrence: string
  }) {
    const optimistic: ExecTask = {
      id: crypto.randomUUID(),
      company_id: null,
      title: data.title,
      description: data.description || null,
      category: data.category,
      due_date: data.due_date,
      recurrence: data.recurrence,
      status: 'active',
      completed_at: null,
      completed_by: null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setTasks(prev => [...prev, optimistic])
    setShowModal(false)
    const { data: inserted } = await supabase
      .from('executive_tasks')
      .insert({
        title: data.title,
        description: data.description || null,
        category: data.category,
        due_date: data.due_date,
        recurrence: data.recurrence,
        created_by: userId,
      })
      .select()
      .single()
    if (inserted) setTasks(prev => prev.map(t => t.id === optimistic.id ? inserted as ExecTask : t))
  }

  async function handleUpdate(id: string, data: {
    title: string; description: string; category: string; due_date: string; recurrence: string
  }) {
    setTasks(prev => prev.map(t => t.id === id ? {
      ...t, title: data.title, description: data.description || null,
      category: data.category, due_date: data.due_date,
      recurrence: data.recurrence, updated_at: new Date().toISOString(),
    } : t))
    setEditingTask(null)
    setShowModal(false)
    await supabase
      .from('executive_tasks')
      .update({
        title: data.title, description: data.description || null,
        category: data.category, due_date: data.due_date,
        recurrence: data.recurrence, updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  }

  async function handleComplete(task: ExecTask) {
    const now = new Date().toISOString()
    setTasks(prev => prev.map(t => t.id === task.id ? {
      ...t, status: 'completed', completed_at: now, completed_by: userId, updated_at: now,
    } : t))
    setExpandedId(null)
    await supabase
      .from('executive_tasks')
      .update({ status: 'completed', completed_at: now, completed_by: userId, updated_at: now })
      .eq('id', task.id)

    if (task.recurrence && task.recurrence !== 'one_time') {
      const nextDue = calcNextDue(task.due_date, task.recurrence)
      const next: ExecTask = {
        id: crypto.randomUUID(), company_id: task.company_id,
        title: task.title, description: task.description,
        category: task.category, due_date: nextDue,
        recurrence: task.recurrence, status: 'active',
        completed_at: null, completed_by: null,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setTasks(prev => [...prev, next])
      const { data: inserted } = await supabase
        .from('executive_tasks')
        .insert({
          title: task.title, description: task.description,
          category: task.category, due_date: nextDue,
          recurrence: task.recurrence, company_id: task.company_id,
          created_by: userId,
        })
        .select()
        .single()
      if (inserted) setTasks(prev => prev.map(t => t.id === next.id ? inserted as ExecTask : t))
    }
  }

  async function handleDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    setDeleteConfirmId(null)
    setExpandedId(null)
    await supabase.from('executive_tasks').delete().eq('id', id)
  }

  /* ── Render helpers ── */

  function borderColor(task: ExecTask): string {
    if (task.status === 'completed') return 'border-l-green-500'
    const d = daysDiff(task.due_date)
    if (d < 0) return 'border-l-red-500'
    if (d <= 30) return 'border-l-amber-500'
    if (d <= 365) return 'border-l-gray-300'
    return 'border-l-gray-200'
  }

  function renderActiveRow(task: ExecTask) {
    const rel = relativeTime(task.due_date)
    const bc = borderColor(task)
    const isExp = expandedId === task.id
    return (
      <div key={task.id}>
        <button
          onClick={() => setExpandedId(isExp ? null : task.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-r-lg border-l-[3px] ${bc} text-left hover:bg-gray-100 transition-colors`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Due {fmtDate(task.due_date)}
              {task.recurrence ? ` · ${recurrenceLabel(task.recurrence)}` : ''}
              {' · '}{task.category}
            </p>
          </div>
          <span className={`text-xs flex-shrink-0 ${rel.cls}`}>{rel.text}</span>
        </button>
        {isExp && (
          <div className={`px-3 py-2 bg-gray-50 border-l-[3px] ${bc} rounded-br-lg -mt-0.5`}>
            {task.description && (
              <p className="text-xs text-gray-600 mb-2 whitespace-pre-wrap">{task.description}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleComplete(task)}
                className="flex items-center gap-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded transition-colors"
              >
                <CheckIcon className="w-3 h-3" /> Complete
              </button>
              <button
                onClick={() => { setEditingTask(task); setShowModal(true) }}
                className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors"
              >
                <PencilIcon className="w-3 h-3" /> Edit
              </button>
              <button
                onClick={() => setDeleteConfirmId(task.id)}
                className="flex items-center gap-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
              >
                <Trash2Icon className="w-3 h-3" /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Loading state ── */

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500"><CalendarDaysIcon className="w-5 h-5" /></span>
          <h3 className="text-sm font-semibold text-gray-900">Executive tasks</h3>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  /* ── Main render ── */

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-amber-500">
          <CalendarDaysIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Executive tasks</h3>
        {overdueCount > 0 && (
          <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-medium">
            {overdueCount} overdue
          </span>
        )}
        {dueSoonCount > 0 && (
          <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
            {dueSoonCount} due soon
          </span>
        )}
        <button
          onClick={() => { setEditingTask(null); setShowModal(true) }}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm flex-shrink-0"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New task
        </button>
      </div>

      {/* Scrollable content */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto -mx-4 px-4">
        {/* Needs Attention */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Needs attention
          </p>
          {needsAttention.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">All caught up — nothing due soon.</p>
          ) : (
            <div className="space-y-1.5">{needsAttention.map(renderActiveRow)}</div>
          )}
        </div>

        {/* Upcoming */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Upcoming (within 1 year)
          </p>
          {upcoming.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">No upcoming tasks.</p>
          ) : (
            <div className="space-y-1.5">{upcoming.map(renderActiveRow)}</div>
          )}
        </div>

        {/* Long-term (collapsed by default) */}
        <div>
          <button
            onClick={() => setLongTermOpen(!longTermOpen)}
            className="flex items-center gap-2 w-full text-left"
          >
            {longTermOpen
              ? <ChevronDownIcon className="w-4 h-4 text-gray-400" />
              : <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Long-term (1 year+)
            </span>
            {longTerm.length > 0 && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                {longTerm.length}
              </span>
            )}
          </button>
          {longTermOpen && (
            <div className="mt-2 space-y-1.5">
              {longTerm.length === 0
                ? <p className="text-xs text-gray-400 py-3 pl-6">No long-term tasks.</p>
                : longTerm.map(renderActiveRow)}
            </div>
          )}
        </div>

        {/* Recently Completed (collapsed by default) */}
        <div>
          <button
            onClick={() => setCompletedOpen(!completedOpen)}
            className="flex items-center gap-2 w-full text-left"
          >
            {completedOpen
              ? <ChevronDownIcon className="w-4 h-4 text-gray-400" />
              : <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Recently completed
            </span>
            {completedTasks.length > 0 && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                {completedTasks.length}
              </span>
            )}
          </button>
          {completedOpen && (
            <div className="mt-2 space-y-1.5">
              {completedTasks.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 pl-6">No completed tasks yet.</p>
              ) : (
                completedTasks.map(task => (
                  <div key={task.id} className="opacity-60">
                    <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-r-lg border-l-[3px] border-l-green-500">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Completed{' '}
                          {task.completed_at
                            ? new Date(task.completed_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })
                            : ''}
                          {task.recurrence ? ` · ${recurrenceLabel(task.recurrence)}` : ''}
                          {' · '}{task.category}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded flex-shrink-0">
                        Done
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <ExecTaskModal
          task={editingTask}
          onSave={data => editingTask ? handleUpdate(editingTask.id, data) : handleCreate(data)}
          onClose={() => { setShowModal(false); setEditingTask(null) }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Task</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
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
/*  Modal                                                              */
/* ================================================================== */

function ExecTaskModal({
  task,
  onSave,
  onClose,
}: {
  task: ExecTask | null
  onSave: (data: {
    title: string; description: string; category: string
    due_date: string; recurrence: string
  }) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [category, setCategory] = useState(task?.category ?? 'Filing')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [recurrence, setRecurrence] = useState(task?.recurrence ?? 'yearly')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !dueDate) return
    onSave({ title: title.trim(), description, category, due_date: dueDate, recurrence })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {task ? 'Edit Executive Task' : 'New Executive Task'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Annual report — Secretary of State"
              autoFocus
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
              <select
                value={recurrence}
                onChange={e => setRecurrence(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                {RECURRENCE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due date *</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
            />
          </div>

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
              disabled={!title.trim() || !dueDate}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-lg transition-colors"
            >
              {task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
