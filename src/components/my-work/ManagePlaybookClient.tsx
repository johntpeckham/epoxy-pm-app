'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeftIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  PowerIcon,
  XIcon,
  BarChart3Icon,
  BookOpenIcon,
} from 'lucide-react'
import type { AssignedTask, AssignedTaskType, Profile } from '@/types'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ManagePlaybookClient() {
  const supabase = useMemo(() => createClient(), [])
  const [tasks, setTasks] = useState<AssignedTask[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AssignedTask | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filterUser, setFilterUser] = useState<string>('all')
  const [filterType, setFilterType] = useState<'all' | AssignedTaskType>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const [tasksRes, profilesRes] = await Promise.all([
      supabase
        .from('assigned_tasks')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role, updated_at'),
    ])
    if (tasksRes.data) setTasks(tasksRes.data as AssignedTask[])
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    load()
  }, [load])

  const profileName = useCallback(
    (id: string) => profiles.find((p) => p.id === id)?.display_name ?? 'Unknown',
    [profiles]
  )

  async function toggleActive(task: AssignedTask) {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, is_active: !t.is_active } : t))
    )
    await supabase
      .from('assigned_tasks')
      .update({ is_active: !task.is_active })
      .eq('id', task.id)
  }

  async function deleteTask(task: AssignedTask) {
    if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return
    setTasks((prev) => prev.filter((t) => t.id !== task.id))
    await supabase.from('assigned_tasks').delete().eq('id', task.id)
  }

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterUser !== 'all' && t.assigned_to !== filterUser) return false
      if (filterType !== 'all' && t.task_type !== filterType) return false
      return true
    })
  }, [tasks, filterUser, filterType])

  const byType = {
    daily: filtered.filter((t) => t.task_type === 'daily'),
    weekly: filtered.filter((t) => t.task_type === 'weekly'),
    one_time: filtered.filter((t) => t.task_type === 'one_time'),
  }

  const sortedProfiles = [...profiles].sort((a, b) =>
    (a.display_name ?? '').localeCompare(b.display_name ?? '')
  )

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/my-work" className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
          <BookOpenIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            Manage Daily Playbook
          </h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <Link
            href="/my-work/employee-summary"
            className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition"
          >
            <BarChart3Icon className="w-4 h-4" />
            Employee summary
          </Link>
          <button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            Add task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Employee</label>
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded bg-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">All</option>
            {sortedProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name ?? 'Unknown'}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Type</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="text-sm px-3 py-1.5 border border-gray-200 rounded bg-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">All</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="one_time">One-time</option>
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 pb-8 space-y-6">
        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
        ) : (
          <>
            <TaskGroup
              label="Daily"
              tasks={byType.daily}
              profileName={profileName}
              onEdit={(t) => {
                setEditing(t)
                setShowForm(true)
              }}
              onDelete={deleteTask}
              onToggleActive={toggleActive}
            />
            <TaskGroup
              label="Weekly"
              tasks={byType.weekly}
              profileName={profileName}
              onEdit={(t) => {
                setEditing(t)
                setShowForm(true)
              }}
              onDelete={deleteTask}
              onToggleActive={toggleActive}
            />
            <TaskGroup
              label="One-time"
              tasks={byType.one_time}
              profileName={profileName}
              onEdit={(t) => {
                setEditing(t)
                setShowForm(true)
              }}
              onDelete={deleteTask}
              onToggleActive={toggleActive}
            />
          </>
        )}
      </div>

      {showForm && (
        <TaskFormModal
          task={editing}
          profiles={sortedProfiles}
          onCancel={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onSaved={async () => {
            setShowForm(false)
            setEditing(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Group                                                              */
/* ------------------------------------------------------------------ */

function TaskGroup({
  label,
  tasks,
  profileName,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  label: string
  tasks: AssignedTask[]
  profileName: (id: string) => string
  onEdit: (t: AssignedTask) => void
  onDelete: (t: AssignedTask) => void
  onToggleActive: (t: AssignedTask) => void
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {label}{' '}
        <span className="text-gray-400 font-normal normal-case tracking-normal">
          ({tasks.length})
        </span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400 px-4 py-6 bg-white rounded-xl border border-gray-100 text-center">
          No {label.toLowerCase()} tasks
        </p>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
          {tasks.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-4 px-4 py-3 ${
                !t.is_active ? 'opacity-50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {t.title}
                  {!t.is_active && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      inactive
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{profileName(t.assigned_to)}</span>
                  <span className="text-gray-300">·</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      t.task_type === 'daily'
                        ? 'bg-amber-100 text-amber-700'
                        : t.task_type === 'weekly'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {t.task_type === 'one_time'
                      ? 'One-time'
                      : t.task_type === 'weekly'
                        ? 'Weekly'
                        : 'Daily'}
                  </span>
                  {t.task_type === 'weekly' && t.day_of_week !== null && (
                    <span>{DAY_LABELS[t.day_of_week]}</span>
                  )}
                  {t.task_type === 'one_time' && t.specific_date && (
                    <span>{t.specific_date}</span>
                  )}
                </p>
                {t.description && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => onToggleActive(t)}
                className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded transition"
                title={t.is_active ? 'Deactivate' : 'Activate'}
              >
                <PowerIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEdit(t)}
                className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded transition"
                title="Edit"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(t)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                title="Delete"
              >
                <Trash2Icon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Task form modal                                                    */
/* ------------------------------------------------------------------ */

function TaskFormModal({
  task,
  profiles,
  onCancel,
  onSaved,
}: {
  task: AssignedTask | null
  profiles: Profile[]
  onCancel: () => void
  onSaved: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [taskType, setTaskType] = useState<AssignedTaskType>(
    task?.task_type ?? 'daily'
  )
  const [dayOfWeek, setDayOfWeek] = useState<number>(
    task?.day_of_week ?? new Date().getDay()
  )
  const [specificDate, setSpecificDate] = useState<string>(
    task?.specific_date ?? new Date().toISOString().slice(0, 10)
  )
  const [assignedTo, setAssignedTo] = useState<string>(
    task?.assigned_to ?? profiles[0]?.id ?? ''
  )
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !assignedTo) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      task_type: taskType,
      day_of_week: taskType === 'weekly' ? dayOfWeek : null,
      specific_date: taskType === 'one_time' ? specificDate : null,
      assigned_to: assignedTo,
    }
    if (task) {
      await supabase.from('assigned_tasks').update(payload).eq('id', task.id)
    } else {
      await supabase
        .from('assigned_tasks')
        .insert({ ...payload, created_by: user?.id ?? null, is_active: true })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900 flex-1">
            {task ? 'Edit task' : 'New task'}
          </h2>
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={save} className="flex-1 overflow-y-auto p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Type
            </label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as AssignedTaskType)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-amber-500 bg-white"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="one_time">One-time</option>
            </select>
          </div>

          {taskType === 'weekly' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Day of week
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => setDayOfWeek(idx)}
                    className={`px-3 py-1.5 text-xs rounded border transition ${
                      dayOfWeek === idx
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {taskType === 'one_time' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Date
              </label>
              <input
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                required
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Assigned to
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              required
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-amber-500 bg-white"
            >
              <option value="">Select user…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name ?? 'Unknown'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || !assignedTo}
              className="text-sm font-medium bg-amber-500 hover:bg-amber-400 text-white px-4 py-1.5 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : task ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
