'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import { PlusIcon, XIcon, Trash2Icon, PencilIcon, CalendarIcon, UsersIcon, FileTextIcon } from 'lucide-react'
import { CalendarEvent } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { value: '#f59e0b', label: 'Amber' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
]

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

// ── Helpers ──────────────────────────────────────────────────────────────────

function addBusinessDays(start: string, days: number, includeWeekends: boolean): string {
  const d = new Date(start + 'T12:00:00')
  let remaining = days - 1 // start date counts as day 1
  if (remaining <= 0) return start
  while (remaining > 0) {
    d.setDate(d.getDate() + 1)
    if (includeWeekends || (d.getDay() !== 0 && d.getDay() !== 6)) {
      remaining--
    }
  }
  return d.toISOString().slice(0, 10)
}

function countDuration(start: string, end: string, includeWeekends: boolean): number {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    if (includeWeekends || (cur.getDay() !== 0 && cur.getDay() !== 6)) {
      count++
    }
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(count, 1)
}

/** FullCalendar end dates are exclusive, so add 1 day for display. */
function fcEndDate(endDate: string): string {
  const d = new Date(endDate + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function formatDisplayDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── Component ────────────────────────────────────────────────────────────────

interface CalendarPageClientProps {
  initialEvents: CalendarEvent[]
  userId: string
}

export default function CalendarPageClient({ initialEvents, userId }: CalendarPageClientProps) {
  const router = useRouter()
  const supabase = createClient()

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [formProjectName, setFormProjectName] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formDuration, setFormDuration] = useState(1)
  const [formIncludeWeekends, setFormIncludeWeekends] = useState(false)
  const [formCrew, setFormCrew] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formColor, setFormColor] = useState(PRESET_COLORS[0].value)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Computed end date
  const computedEndDate = useMemo(
    () => (formStartDate ? addBusinessDays(formStartDate, formDuration, formIncludeWeekends) : ''),
    [formStartDate, formDuration, formIncludeWeekends],
  )

  // Map DB events to FullCalendar events
  const fcEvents = useMemo(
    () =>
      initialEvents.map((evt) => ({
        id: evt.id,
        title: evt.project_name,
        start: evt.start_date,
        end: fcEndDate(evt.end_date),
        backgroundColor: evt.color || PRESET_COLORS[0].value,
        borderColor: evt.color || PRESET_COLORS[0].value,
        extendedProps: evt,
      })),
    [initialEvents],
  )

  // ── Form helpers ─────────────────────────────────────────────────────────

  function resetForm() {
    setFormProjectName('')
    setFormStartDate('')
    setFormDuration(1)
    setFormIncludeWeekends(false)
    setFormCrew('')
    setFormNotes('')
    setFormColor(PRESET_COLORS[0].value)
    setFormError(null)
    setEditingEvent(null)
  }

  function openCreateForm(startDate?: string) {
    resetForm()
    if (startDate) setFormStartDate(startDate)
    setShowFormModal(true)
  }

  function openEditForm(evt: CalendarEvent) {
    setEditingEvent(evt)
    setFormProjectName(evt.project_name)
    setFormStartDate(evt.start_date)
    setFormDuration(countDuration(evt.start_date, evt.end_date, evt.include_weekends))
    setFormIncludeWeekends(evt.include_weekends)
    setFormCrew(evt.crew)
    setFormNotes(evt.notes || '')
    setFormColor(evt.color || PRESET_COLORS[0].value)
    setFormError(null)
    setDetailEvent(null)
    setShowFormModal(true)
  }

  // ── Calendar callbacks ───────────────────────────────────────────────────

  const handleDateClick = useCallback((arg: DateClickArg) => {
    openCreateForm(arg.dateStr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const evt = arg.event.extendedProps as CalendarEvent
      setDetailEvent(evt)
    },
    [],
  )

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    setFormError(null)

    try {
      if (!formProjectName.trim()) throw new Error('Please enter a project name')
      if (!formStartDate) throw new Error('Please select a start date')
      if (formDuration < 1) throw new Error('Duration must be at least 1 day')

      const endDate = addBusinessDays(formStartDate, formDuration, formIncludeWeekends)

      const payload = {
        project_name: formProjectName.trim(),
        start_date: formStartDate,
        end_date: endDate,
        include_weekends: formIncludeWeekends,
        crew: formCrew.trim(),
        notes: formNotes.trim() || null,
        color: formColor,
      }

      if (editingEvent) {
        const { error } = await supabase
          .from('calendar_events')
          .update(payload)
          .eq('id', editingEvent.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('calendar_events')
          .insert({ ...payload, created_by: userId })
        if (error) throw error
      }

      setShowFormModal(false)
      resetForm()
      router.refresh()
    } catch (err: unknown) {
      let msg = 'Failed to save event'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setFormError(msg)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!detailEvent) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('calendar_events').delete().eq('id', detailEvent.id)
      if (error) throw error
      setShowDeleteConfirm(false)
      setDetailEvent(null)
      router.refresh()
    } catch {
      // silently fail – user can retry
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Header */}
      <div className="px-4 py-5 sm:px-6 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {initialEvents.length} project{initialEvents.length !== 1 ? 's' : ''} scheduled
            </p>
          </div>
          <button
            onClick={() => openCreateForm()}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            Add Project
          </button>
        </div>
      </div>

      {/* FullCalendar */}
      <div className="flex-1 px-4 pb-4 sm:px-6 sm:pb-6 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto bg-white border border-gray-200 rounded-xl p-4 shadow-sm calendar-wrapper">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={fcEvents}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth',
            }}
            height="auto"
            eventDisplay="block"
            displayEventTime={false}
          />
        </div>
      </div>

      {/* ── Add/Edit Project Modal ──────────────────────────────────────────── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowFormModal(false); resetForm() }} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingEvent ? 'Edit Project' : 'Add Project'}
              </h2>
              <button
                onClick={() => { setShowFormModal(false); resetForm() }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                  <span>{formError}</span>
                  <button onClick={() => setFormError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Project Name */}
              <div>
                <label className={labelCls}>Project Name *</label>
                <input
                  type="text"
                  value={formProjectName}
                  onChange={(e) => setFormProjectName(e.target.value)}
                  placeholder="e.g. Warehouse Floor Coating"
                  className={inputCls}
                />
              </div>

              {/* Start Date & Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Start Date *</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Duration (days) *</label>
                  <input
                    type="number"
                    min={1}
                    value={formDuration}
                    onChange={(e) => setFormDuration(Math.max(1, parseInt(e.target.value) || 1))}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Include Weekends + computed end date */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Include Weekends?
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormIncludeWeekends(!formIncludeWeekends)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      formIncludeWeekends ? 'bg-amber-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        formIncludeWeekends ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                  <span className="text-xs text-gray-500">{formIncludeWeekends ? 'Yes' : 'No'}</span>
                </div>
                {computedEndDate && (
                  <p className="text-xs text-gray-500">
                    Ends <span className="font-medium text-gray-700">{formatDisplayDate(computedEndDate)}</span>
                  </p>
                )}
              </div>

              {/* Crew */}
              <div>
                <label className={labelCls}>Crew</label>
                <input
                  type="text"
                  value={formCrew}
                  onChange={(e) => setFormCrew(e.target.value)}
                  placeholder="e.g. John, Mike, Sarah"
                  className={inputCls}
                />
              </div>

              {/* Notes */}
              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className={inputCls + ' resize-none'}
                />
              </div>

              {/* Color Picker */}
              <div>
                <label className={labelCls}>Color</label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormColor(c.value)}
                      title={c.label}
                      className={`w-8 h-8 rounded-full border-2 transition ${
                        formColor === c.value
                          ? 'border-gray-800 scale-110'
                          : 'border-transparent hover:border-gray-300'
                      }`}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
              <button
                onClick={() => { setShowFormModal(false); resetForm() }}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {saving ? 'Saving...' : editingEvent ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Event Detail Modal ──────────────────────────────────────────────── */}
      {detailEvent && !showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetailEvent(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            {/* Header with color bar */}
            <div
              className="rounded-t-xl px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0"
              style={{ borderTop: `4px solid ${detailEvent.color || PRESET_COLORS[0].value}` }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{detailEvent.project_name}</h2>
                <button
                  onClick={() => setDetailEvent(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition flex-shrink-0"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Dates */}
              <div className="flex items-start gap-3">
                <CalendarIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-700">
                    {formatDisplayDate(detailEvent.start_date)} &mdash; {formatDisplayDate(detailEvent.end_date)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {countDuration(detailEvent.start_date, detailEvent.end_date, detailEvent.include_weekends)} day
                    {countDuration(detailEvent.start_date, detailEvent.end_date, detailEvent.include_weekends) !== 1 ? 's' : ''}
                    {detailEvent.include_weekends ? ' (weekends included)' : ' (weekdays only)'}
                  </p>
                </div>
              </div>

              {/* Crew */}
              {detailEvent.crew && (
                <div className="flex items-start gap-3">
                  <UsersIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-700">{detailEvent.crew}</p>
                </div>
              )}

              {/* Notes */}
              {detailEvent.notes && (
                <div className="flex items-start gap-3">
                  <FileTextIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailEvent.notes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
              {detailEvent.created_by === userId && (
                <>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition"
                  >
                    <Trash2Icon className="w-4 h-4" />
                    Delete
                  </button>
                  <button
                    onClick={() => openEditForm(detailEvent)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg py-2.5 text-sm font-semibold transition"
                  >
                    <PencilIcon className="w-4 h-4" />
                    Edit
                  </button>
                </>
              )}
              {detailEvent.created_by !== userId && (
                <button
                  onClick={() => setDetailEvent(null)}
                  className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ─────────────────────────────────────────────── */}
      {showDeleteConfirm && detailEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <Trash2Icon className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Delete Project</h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to delete &ldquo;{detailEvent.project_name}&rdquo; from the calendar? This cannot be undone.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
