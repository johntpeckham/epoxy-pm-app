'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BellIcon,
  PlusIcon,
  XIcon,
  AlertTriangleIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import KebabMenu from '@/components/ui/KebabMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { EstimatingReminder } from './types'

interface ProjectRemindersCardProps {
  projectId: string
  projectName: string
  userId: string
  customerId: string
}

export default function ProjectRemindersCard({
  projectId,
  projectName,
  userId,
  customerId,
}: ProjectRemindersCardProps) {
  const [reminders, setReminders] = useState<EstimatingReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editReminder, setEditReminder] = useState<EstimatingReminder | null>(null)
  const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [tab, setTab] = useState<'active' | 'completed'>('active')

  // Shared 3-second resetting completion timer — mirrors the pattern used by
  // the Office Tasks / Assigned Work cards on My Work. Checking a row stages
  // it in pendingCompleteIds (visual line-through + checkmark) and stores
  // the commit thunk in pendingRunsRef. The shared timer fires once 3s after
  // the most recent check, then runs every staged thunk. Unchecking a staged
  // row before the timer fires cancels just that thunk; if the staged set
  // empties, the timer itself is cleared.
  const [pendingCompleteIds, setPendingCompleteIds] = useState<Set<string>>(
    new Set()
  )
  const pendingRunsRef = useRef<Map<string, () => void>>(new Map())
  const sharedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commitAllPending = useCallback(() => {
    const runs = Array.from(pendingRunsRef.current.values())
    pendingRunsRef.current.clear()
    setPendingCompleteIds(new Set())
    sharedTimerRef.current = null
    for (const run of runs) {
      try {
        run()
      } catch (err) {
        console.error('[ESTIMATING REMINDER commit run failed]', err)
      }
    }
  }, [])

  const schedulePendingComplete = useCallback(
    (key: string, runComplete: () => void) => {
      pendingRunsRef.current.set(key, runComplete)
      setPendingCompleteIds((prev) => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current)
      sharedTimerRef.current = setTimeout(() => commitAllPending(), 3000)
    },
    [commitAllPending]
  )

  const cancelPendingComplete = useCallback((key: string) => {
    pendingRunsRef.current.delete(key)
    setPendingCompleteIds((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    if (pendingRunsRef.current.size === 0 && sharedTimerRef.current) {
      clearTimeout(sharedTimerRef.current)
      sharedTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const timerRef = sharedTimerRef
    const pendingRuns = pendingRunsRef.current
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      pendingRuns.clear()
    }
  }, [])

  const fetchReminders = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('estimating_reminders')
      .select('*')
      .eq('project_id', projectId)
      .order('due_date', { ascending: true })
    if (error) {
      console.error('[ESTIMATING REMINDERS FETCH ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
    }
    setReminders((data as EstimatingReminder[]) ?? [])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchReminders()
  }, [fetchReminders])

  // Create notifications for overdue pending reminders (once per reminder).
  // Snoozed rows are intentionally ignored — snooze is no longer supported.
  useEffect(() => {
    async function syncNotifications() {
      const supabase = createClient()
      const now = new Date()
      const overdue = reminders.filter((r) => {
        if (r.status !== 'pending') return false
        return new Date(r.due_date) <= now
      })
      if (overdue.length === 0) return

      const link = `/estimating?customer=${customerId}&project=${projectId}`
      for (const r of overdue) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'estimating_reminder')
          .eq('link', link)
          .ilike('message', `%${r.id}%`)
          .limit(1)
        if (existing && existing.length > 0) continue
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'estimating_reminder',
          title: r.title,
          message: `${projectName} · reminder ${r.id}`,
          link,
          read: false,
        })
      }
    }
    if (!loading) syncNotifications()
  }, [reminders, loading, userId, projectId, projectName, customerId])

  // Snooze and dismiss are not surfaced in the UI — rows with those statuses
  // are filtered out of both tabs entirely.
  const pending = reminders
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const completed = reminders
    .filter((r) => r.status === 'completed')
    .sort((a, b) => {
      const at = a.completed_at ?? a.updated_at ?? ''
      const bt = b.completed_at ?? b.updated_at ?? ''
      return bt.localeCompare(at)
    })

  async function handleComplete(r: EstimatingReminder) {
    const supabase = createClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('estimating_reminders')
      .update({ status: 'completed', completed_at: now })
      .eq('id', r.id)
    if (error) {
      console.error('[ESTIMATING REMINDER COMPLETE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      return
    }
    setReminders((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, status: 'completed', completed_at: now } : x
      )
    )
  }

  async function handleUncomplete(r: EstimatingReminder) {
    const supabase = createClient()
    const { error } = await supabase
      .from('estimating_reminders')
      .update({ status: 'pending', completed_at: null })
      .eq('id', r.id)
    if (error) {
      console.error('[ESTIMATING REMINDER UNCOMPLETE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      return
    }
    setReminders((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, status: 'pending', completed_at: null } : x
      )
    )
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('estimating_reminders')
      .delete()
      .eq('id', id)
    setDeleting(false)
    if (error) {
      console.error('[ESTIMATING REMINDER DELETE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      return
    }
    setDeleteReminderId(null)
    fetchReminders()
  }

  function handleCreated(r: EstimatingReminder) {
    setReminders((prev) => [...prev, r])
    setShowAdd(false)
  }

  function handleUpdated(r: EstimatingReminder) {
    setReminders((prev) => prev.map((x) => (x.id === r.id ? r : x)))
    setEditReminder(null)
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <BellIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">Reminders</h3>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition"
          >
            <PlusIcon className="w-4 h-4" />
            Add reminder
          </button>
        </div>

        <div className="-mx-4 px-4 mb-3 border-b border-gray-200 flex items-center gap-4">
          {(['active', 'completed'] as const).map((key) => {
            const isActive = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`-mb-px py-2 text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-amber-500 border-b-[1.5px] border-amber-500 font-medium'
                    : 'text-gray-400 hover:text-gray-600 border-b-[1.5px] border-transparent'
                }`}
              >
                {key === 'active' ? 'Active' : 'Completed'}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="py-6 flex items-center justify-center text-gray-400">
            <Loader2Icon className="w-4 h-4 animate-spin" />
          </div>
        ) : tab === 'active' ? (
          pending.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              No upcoming reminders.
            </p>
          ) : (
            <div className="space-y-2">
              {pending.map((r) => {
                const isPending = pendingCompleteIds.has(r.id)
                return (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    isCompleted={false}
                    isPending={isPending}
                    onToggle={() => {
                      if (isPending) {
                        cancelPendingComplete(r.id)
                      } else {
                        schedulePendingComplete(r.id, () => handleComplete(r))
                      }
                    }}
                    onEdit={() => setEditReminder(r)}
                    onDelete={() => setDeleteReminderId(r.id)}
                  />
                )
              })}
            </div>
          )
        ) : completed.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No completed reminders.
          </p>
        ) : (
          <div className="space-y-2">
            {completed.map((r) => (
              <ReminderRow
                key={r.id}
                reminder={r}
                isCompleted
                onToggle={() => handleUncomplete(r)}
                onEdit={() => setEditReminder(r)}
                onDelete={() => setDeleteReminderId(r.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddReminderModal
          projectId={projectId}
          userId={userId}
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}

      {editReminder && (
        <AddReminderModal
          projectId={projectId}
          userId={userId}
          reminder={editReminder}
          onClose={() => setEditReminder(null)}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
        />
      )}

      {deleteReminderId && (
        <ConfirmDialog
          title="Delete this reminder?"
          message="This will permanently delete this reminder."
          onConfirm={() => handleDelete(deleteReminderId)}
          onCancel={() => setDeleteReminderId(null)}
          loading={deleting}
          variant="destructive"
        />
      )}
    </>
  )
}

function ReminderRow({
  reminder,
  isCompleted,
  isPending = false,
  onToggle,
  onEdit,
  onDelete,
}: {
  reminder: EstimatingReminder
  isCompleted: boolean
  isPending?: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const dueDate = new Date(reminder.due_date)
  const now = new Date()
  const isOverdue = !isCompleted && !isPending && dueDate <= now && reminder.status === 'pending'
  // Visual checked/strikethrough state is the union of "already completed in
  // the DB" and "staged for completion by the 3-second timer". The
  // distinction only matters for the onToggle behavior, which the parent
  // routes through cancelPendingComplete vs handleUncomplete.
  const isChecked = isCompleted || isPending

  return (
    <div
      className={`group flex items-start gap-3 p-2.5 rounded-lg border ${
        isOverdue
          ? 'border-amber-200 bg-amber-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          isChecked
            ? 'border-amber-400 bg-amber-50'
            : 'border-gray-300 hover:border-amber-400'
        }`}
        aria-label={isChecked ? 'Mark incomplete' : 'Mark complete'}
      >
        {isChecked && (
          <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 text-amber-500" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isOverdue && (
            <AlertTriangleIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
          )}
          <p
            className={`text-sm font-medium truncate ${
              isChecked
                ? 'text-gray-400 line-through'
                : isOverdue
                ? 'text-amber-900'
                : 'text-gray-900'
            }`}
          >
            {reminder.title}
          </p>
        </div>
        {reminder.description && (
          <p
            className={`text-xs truncate mt-0.5 ${
              isChecked ? 'text-gray-400 line-through' : 'text-gray-500'
            }`}
          >
            {reminder.description}
          </p>
        )}
        <p
          className={`text-[11px] mt-0.5 ${
            isChecked
              ? 'text-gray-400'
              : isOverdue
              ? 'text-amber-700 font-medium'
              : 'text-gray-400'
          }`}
        >
          Due {dueDate.toLocaleDateString()}
        </p>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <KebabMenu
          variant="light"
          title="Reminder actions"
          items={[
            {
              label: 'Edit',
              icon: <PencilIcon className="w-4 h-4" />,
              onSelect: onEdit,
            },
            {
              label: 'Delete',
              icon: <Trash2Icon className="w-4 h-4" />,
              destructive: true,
              onSelect: onDelete,
            },
          ]}
        />
      </div>
    </div>
  )
}

function AddReminderModal({
  projectId,
  userId,
  reminder,
  onClose,
  onCreated,
  onUpdated,
}: {
  projectId: string
  userId: string
  reminder?: EstimatingReminder
  onClose: () => void
  onCreated: (r: EstimatingReminder) => void
  onUpdated?: (r: EstimatingReminder) => void
}) {
  const isEdit = !!reminder
  const [title, setTitle] = useState(reminder?.title ?? '')
  const [description, setDescription] = useState(reminder?.description ?? '')
  const defaultDue = useRef(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [dueDate, setDueDate] = useState(
    reminder?.due_date
      ? new Date(reminder.due_date).toISOString().slice(0, 10)
      : defaultDue.current()
  )
  const [assignedTo, setAssignedTo] = useState<string>(
    reminder?.assigned_to ?? userId
  )
  const [assignees, setAssignees] = useState<{ id: string; display_name: string | null }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .in('role', ['admin', 'office_manager', 'salesman'])
      .order('display_name', { ascending: true })
      .then(({ data }) => {
        setAssignees(
          ((data ?? []) as { id: string; display_name: string | null }[]).map(
            (p) => ({ id: p.id, display_name: p.display_name })
          )
        )
      })
  }, [])

  async function handleSave() {
    if (!title.trim()) {
      setError('Please enter a title.')
      return
    }
    if (!dueDate) {
      setError('Please pick a due date.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const dueIso = new Date(`${dueDate}T09:00:00`).toISOString()

    if (isEdit && reminder) {
      const { data, error: updErr } = await supabase
        .from('estimating_reminders')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueIso,
          assigned_to: assignedTo || userId,
        })
        .eq('id', reminder.id)
        .select('*')
        .single()
      setSaving(false)
      if (updErr || !data) {
        console.error('[ESTIMATING REMINDER UPDATE ERROR]', {
          code: updErr?.code,
          message: updErr?.message,
          hint: updErr?.hint,
          details: updErr?.details,
        })
        setError(`Failed to update reminder: ${updErr?.message ?? 'unknown error'}`)
        return
      }
      onUpdated?.(data as EstimatingReminder)
      return
    }

    const { data, error: insErr } = await supabase
      .from('estimating_reminders')
      .insert({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueIso,
        reminder_type: 'manual',
        status: 'pending',
        created_by: userId,
        assigned_to: assignedTo || userId,
      })
      .select('*')
      .single()
    setSaving(false)
    if (insErr || !data) {
      console.error('[ESTIMATING REMINDER INSERT ERROR]', {
        code: insErr?.code,
        message: insErr?.message,
        hint: insErr?.hint,
        details: insErr?.details,
      })
      setError(`Failed to create reminder: ${insErr?.message ?? 'unknown error'}`)
      return
    }
    onCreated(data as EstimatingReminder)
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">
              {isEdit ? 'Edit Reminder' : 'Add reminder'}
            </h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Follow up with customer"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Description
              </label>
              <textarea
                value={description ?? ''}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional notes…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-y"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Due date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Assigned to
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              >
                {assignees.length === 0 && (
                  <option value={userId}>You</option>
                )}
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add reminder'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
