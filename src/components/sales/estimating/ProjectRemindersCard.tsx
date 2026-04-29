'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BellIcon,
  PlusIcon,
  CheckIcon,
  Clock3Icon,
  XIcon,
  ChevronDownIcon,
  AlertTriangleIcon,
  Loader2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import type { EstimatingReminder } from './types'

interface ProjectRemindersCardProps {
  projectId: string
  projectName: string
  userId: string
  customerId: string
}

type SnoozeOption = '1d' | '3d' | '1w' | 'custom'

export default function ProjectRemindersCard({
  projectId,
  projectName,
  userId,
  customerId,
}: ProjectRemindersCardProps) {
  const [reminders, setReminders] = useState<EstimatingReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [snoozingFor, setSnoozingFor] = useState<EstimatingReminder | null>(null)

  const fetchReminders = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('estimating_reminders')
      .select('*')
      .eq('project_id', projectId)
      .order('due_date', { ascending: true })
    setReminders((data as EstimatingReminder[]) ?? [])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchReminders()
  }, [fetchReminders])

  // Create notifications for overdue pending reminders (once per reminder)
  useEffect(() => {
    async function syncNotifications() {
      const supabase = createClient()
      const now = new Date()
      const overdue = reminders.filter((r) => {
        if (r.status !== 'pending') return false
        const effectiveDue = r.snoozed_until ?? r.due_date
        return new Date(effectiveDue) <= now
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

  const pending = reminders.filter(
    (r) => r.status === 'pending' || r.status === 'snoozed'
  )
  const completed = reminders.filter(
    (r) => r.status === 'completed' || r.status === 'dismissed'
  )

  async function handleComplete(r: EstimatingReminder) {
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase
      .from('estimating_reminders')
      .update({ status: 'completed', completed_at: now })
      .eq('id', r.id)
    setReminders((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, status: 'completed', completed_at: now } : x
      )
    )
  }

  async function handleDismiss(r: EstimatingReminder) {
    const supabase = createClient()
    await supabase
      .from('estimating_reminders')
      .update({ status: 'dismissed' })
      .eq('id', r.id)
    setReminders((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, status: 'dismissed' } : x))
    )
  }

  async function handleSnooze(r: EstimatingReminder, option: SnoozeOption, customDate?: string) {
    const supabase = createClient()
    const base = new Date()
    let until: Date
    if (option === '1d') {
      until = new Date(base)
      until.setDate(until.getDate() + 1)
    } else if (option === '3d') {
      until = new Date(base)
      until.setDate(until.getDate() + 3)
    } else if (option === '1w') {
      until = new Date(base)
      until.setDate(until.getDate() + 7)
    } else {
      if (!customDate) return
      until = new Date(customDate)
    }
    const iso = until.toISOString()
    await supabase
      .from('estimating_reminders')
      .update({ status: 'snoozed', snoozed_until: iso })
      .eq('id', r.id)
    setReminders((prev) =>
      prev.map((x) =>
        x.id === r.id ? { ...x, status: 'snoozed', snoozed_until: iso } : x
      )
    )
    setSnoozingFor(null)
  }

  function handleCreated(r: EstimatingReminder) {
    setReminders((prev) => [...prev, r])
    setShowAdd(false)
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

        {loading ? (
          <div className="py-6 flex items-center justify-center text-gray-400">
            <Loader2Icon className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          <>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No upcoming reminders.
              </p>
            ) : (
              <div className="space-y-2">
                {pending.map((r) => (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    onComplete={() => handleComplete(r)}
                    onDismiss={() => handleDismiss(r)}
                    onSnooze={() => setSnoozingFor(r)}
                  />
                ))}
              </div>
            )}

            {completed.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setCompletedOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
                >
                  <ChevronDownIcon
                    className={`w-4 h-4 transition-transform ${
                      completedOpen ? 'rotate-180' : ''
                    }`}
                  />
                  Completed ({completed.length})
                </button>
                {completedOpen && (
                  <div className="mt-2 space-y-1">
                    {completed.map((r) => (
                      <div
                        key={r.id}
                        className="text-xs text-gray-500 py-1 px-2 bg-gray-50 rounded flex items-center justify-between gap-2"
                      >
                        <span className="line-through truncate">{r.title}</span>
                        <span className="text-gray-400 flex-shrink-0">
                          {r.status === 'dismissed' ? 'Dismissed' : 'Done'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
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

      {snoozingFor && (
        <SnoozePicker
          reminder={snoozingFor}
          onSnooze={handleSnooze}
          onClose={() => setSnoozingFor(null)}
        />
      )}
    </>
  )
}

function ReminderRow({
  reminder,
  onComplete,
  onDismiss,
  onSnooze,
}: {
  reminder: EstimatingReminder
  onComplete: () => void
  onDismiss: () => void
  onSnooze: () => void
}) {
  const effectiveDue = reminder.snoozed_until ?? reminder.due_date
  const dueDate = new Date(effectiveDue)
  const now = new Date()
  const isOverdue = dueDate <= now && reminder.status === 'pending'
  const isSnoozed = reminder.status === 'snoozed'

  return (
    <div
      className={`flex items-start gap-2 p-2.5 rounded-lg border ${
        isOverdue
          ? 'border-amber-200 bg-amber-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isOverdue && (
            <AlertTriangleIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />
          )}
          <p
            className={`text-sm font-medium truncate ${
              isOverdue ? 'text-amber-900' : 'text-gray-900'
            }`}
          >
            {reminder.title}
          </p>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
              reminder.reminder_type === 'auto'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {reminder.reminder_type === 'auto' ? 'Auto' : 'Manual'}
          </span>
        </div>
        {reminder.description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {reminder.description}
          </p>
        )}
        <p
          className={`text-[11px] mt-0.5 ${
            isOverdue ? 'text-amber-700 font-medium' : 'text-gray-400'
          }`}
        >
          {isSnoozed ? 'Snoozed until ' : 'Due '}
          {dueDate.toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <IconButton
          label="Complete"
          onClick={onComplete}
          className="text-green-600 hover:bg-green-50"
        >
          <CheckIcon className="w-4 h-4" />
        </IconButton>
        <IconButton
          label="Snooze"
          onClick={onSnooze}
          className="text-gray-600 hover:bg-gray-50"
        >
          <Clock3Icon className="w-4 h-4" />
        </IconButton>
        <IconButton
          label="Dismiss"
          onClick={onDismiss}
          className="text-red-500 hover:bg-red-50"
        >
          <XIcon className="w-4 h-4" />
        </IconButton>
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  className = '',
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 transition ${className}`}
    >
      {children}
    </button>
  )
}

function AddReminderModal({
  projectId,
  userId,
  onClose,
  onCreated,
}: {
  projectId: string
  userId: string
  onClose: () => void
  onCreated: (r: EstimatingReminder) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const defaultDue = useRef(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [dueDate, setDueDate] = useState(defaultDue.current())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      })
      .select('*')
      .single()
    setSaving(false)
    if (insErr || !data) {
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
            <h3 className="text-lg font-semibold text-gray-900">Add reminder</h3>
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
                value={description}
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
              {saving ? 'Saving…' : 'Add reminder'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function SnoozePicker({
  reminder,
  onSnooze,
  onClose,
}: {
  reminder: EstimatingReminder
  onSnooze: (r: EstimatingReminder, option: SnoozeOption, customDate?: string) => void
  onClose: () => void
}) {
  const [customDate, setCustomDate] = useState('')

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-sm h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">Snooze reminder</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
            <SnoozeOptionButton
              label="1 day"
              onClick={() => onSnooze(reminder, '1d')}
            />
            <SnoozeOptionButton
              label="3 days"
              onClick={() => onSnooze(reminder, '3d')}
            />
            <SnoozeOptionButton
              label="1 week"
              onClick={() => onSnooze(reminder, '1w')}
            />
            <div className="pt-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Custom date
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
                />
                <button
                  type="button"
                  disabled={!customDate}
                  onClick={() => onSnooze(reminder, 'custom', customDate)}
                  className="px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
                >
                  Snooze
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function SnoozeOptionButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg hover:border-amber-300 hover:bg-amber-50 transition"
    >
      {label}
    </button>
  )
}
