'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, DatesSetArg } from '@fullcalendar/core'
import { CalendarIcon, PlusIcon, XIcon, Trash2Icon, PencilIcon, CheckIcon, UsersIcon } from 'lucide-react'
import { CalendarEvent, EmployeeProfile, Project } from '@/types'
import WorkspaceShell from '../WorkspaceShell'
import Portal from '@/components/ui/Portal'
import { moveToTrash } from '@/lib/trashBin'

const FullCalendar = dynamic(() => import('@fullcalendar/react'), { ssr: false })

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6
}

function skipToWeekday(d: Date): Date {
  const r = new Date(d)
  while (isWeekend(r)) r.setDate(r.getDate() + 1)
  return r
}

function fcEndDateExclusive(endDate: string): string {
  const d = new Date(endDate + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return toDateStr(d)
}

function formatDisplayDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface FCEvent {
  id: string
  title: string
  start: string
  end: string
  backgroundColor: string
  borderColor: string
  classNames?: string[]
  extendedProps: {
    _isJobBar?: boolean
    _isStandalone?: boolean
    _eventData?: CalendarEvent
  }
}

function eventToFCEvents(evt: CalendarEvent): FCEvent[] {
  const color = evt.color || PRESET_COLORS[0].value
  const base = {
    title: `📅 ${evt.project_name}`,
    backgroundColor: color,
    borderColor: color,
    classNames: ['standalone-event'],
    extendedProps: { _isStandalone: true, _eventData: evt },
  }

  if (evt.include_weekends) {
    return [{ id: evt.id, ...base, start: evt.start_date, end: fcEndDateExclusive(evt.end_date) }]
  }

  const segments: FCEvent[] = []
  const endDate = new Date(evt.end_date + 'T12:00:00')
  let segStart = skipToWeekday(new Date(evt.start_date + 'T12:00:00'))

  while (segStart <= endDate) {
    const dayOfWeek = segStart.getDay()
    const daysUntilFri = 5 - dayOfWeek
    const friday = new Date(segStart)
    if (daysUntilFri > 0) friday.setDate(friday.getDate() + daysUntilFri)
    const segEnd = friday <= endDate ? friday : endDate

    if (!isWeekend(segEnd)) {
      segments.push({
        id: evt.id + (segments.length > 0 ? `-${segments.length}` : ''),
        ...base,
        start: toDateStr(segStart),
        end: fcEndDateExclusive(toDateStr(segEnd)),
      })
    }

    const nextMon = new Date(segEnd)
    nextMon.setDate(nextMon.getDate() + 1)
    segStart = skipToWeekday(nextMon)
  }

  return segments
}

function projectToFCEvent(proj: Project): FCEvent | null {
  if (!proj.start_date || !proj.end_date) return null
  const color = proj.color || PRESET_COLORS[0].value
  return {
    id: `job-${proj.id}`,
    title: proj.name,
    start: proj.start_date,
    end: fcEndDateExclusive(proj.end_date),
    backgroundColor: color,
    borderColor: color,
    classNames: ['job-bar'],
    extendedProps: { _isJobBar: true },
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SchedulingWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
}

export default function SchedulingWorkspace({ project, userId, onBack }: SchedulingWorkspaceProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form modal
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [formName, setFormName] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formIncludeWeekends, setFormIncludeWeekends] = useState(false)
  const [formCrewNames, setFormCrewNames] = useState<string[]>([])
  const [formNotes, setFormNotes] = useState('')
  const [formColor, setFormColor] = useState(PRESET_COLORS[0].value)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Detail view
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Crew
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([])
  const [employeesLoaded, setEmployeesLoaded] = useState(false)
  const [showCustomCrewInput, setShowCustomCrewInput] = useState(false)
  const [customCrewName, setCustomCrewName] = useState('')

  // Day summary
  const [daySummaryDate, setDaySummaryDate] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    const sb = createClient()
    const { data, error: fetchErr } = await sb
      .from('calendar_events')
      .select('*')
      .eq('project_id', project.id)
      .order('start_date', { ascending: true })
    if (fetchErr) {
      console.error('[SchedulingWorkspace] Fetch failed:', fetchErr)
      setError('Failed to load events')
    }
    setEvents((data as CalendarEvent[]) ?? [])
    setLoading(false)
  }, [project.id])

  useEffect(() => {
    setLoading(true)
    fetchEvents()
  }, [fetchEvents])

  // Fetch employees on mount
  useEffect(() => {
    const sb = createClient()
    sb.from('employee_profiles')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setEmployeeProfiles(data as EmployeeProfile[])
        setEmployeesLoaded(true)
      })
  }, [])

  // ── FullCalendar events ──────────────────────────────────────────────────

  const fcEvents = useMemo(() => {
    const items: FCEvent[] = []
    // Job bar from project dates
    const jobBar = projectToFCEvent(project)
    if (jobBar) items.push(jobBar)
    // Standalone events linked to this project
    items.push(...events.flatMap(eventToFCEvents))
    return items
  }, [project, events])

  // ── Callbacks ────────────────────────────────────────────────────────────

  const handleDateClick = useCallback((arg: DateClickArg) => {
    setDaySummaryDate(arg.dateStr)
  }, [])

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const ext = arg.event.extendedProps
    if (ext._isJobBar) return // Job bar is display-only
    if (ext._isStandalone && ext._eventData) {
      setDetailEvent(ext._eventData as CalendarEvent)
    }
  }, [])

  // ── Form helpers ─────────────────────────────────────────────────────────

  function resetForm() {
    setFormName('')
    setFormStartDate('')
    setFormEndDate('')
    setFormIncludeWeekends(false)
    setFormCrewNames([])
    setFormNotes('')
    setFormColor(PRESET_COLORS[0].value)
    setFormError(null)
    setEditingEvent(null)
    setShowCustomCrewInput(false)
    setCustomCrewName('')
  }

  function openCreateForm(startDate?: string) {
    resetForm()
    if (startDate) {
      setFormStartDate(startDate)
      setFormEndDate(startDate)
    }
    setShowForm(true)
  }

  function openEditForm(evt: CalendarEvent) {
    setEditingEvent(evt)
    setFormName(evt.project_name)
    setFormStartDate(evt.start_date)
    setFormEndDate(evt.end_date)
    setFormIncludeWeekends(evt.include_weekends ?? false)
    setFormCrewNames(evt.crew ? evt.crew.split(',').map((s) => s.trim()).filter(Boolean) : [])
    setFormNotes(evt.notes || '')
    setFormColor(evt.color || PRESET_COLORS[0].value)
    setFormError(null)
    setDetailEvent(null)
    setShowForm(true)
  }

  function toggleCrewMember(name: string) {
    setFormCrewNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  async function addCustomCrewMember() {
    const name = customCrewName.trim()
    if (!name) return
    if (!formCrewNames.includes(name)) setFormCrewNames((prev) => [...prev, name])

    // Check if employee exists
    const exists = employeeProfiles.some((e) => e.name.toLowerCase() === name.toLowerCase())
    if (!exists) {
      const sb = createClient()
      const { data } = await sb.from('employee_profiles').insert({ name }).select().single()
      if (data) setEmployeeProfiles((prev) => [...prev, data as EmployeeProfile])
    }

    setCustomCrewName('')
    setShowCustomCrewInput(false)
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    setFormError(null)

    try {
      if (!formName.trim()) throw new Error('Please enter an event name')
      if (!formStartDate) throw new Error('Please select a start date')
      if (!formEndDate) throw new Error('Please select an end date')
      if (formEndDate < formStartDate) throw new Error('End date must be on or after start date')

      const payload = {
        project_name: formName.trim(),
        project_id: project.id,
        start_date: formStartDate,
        end_date: formEndDate,
        include_weekends: formIncludeWeekends,
        crew: formCrewNames.join(', '),
        notes: formNotes.trim() || null,
        color: formColor,
      }

      const sb = createClient()
      if (editingEvent) {
        const { error } = await sb.from('calendar_events').update(payload).eq('id', editingEvent.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('calendar_events').insert({ ...payload, created_by: userId })
        if (error) throw error
      }

      setShowForm(false)
      resetForm()
      await fetchEvents()
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
    const sb = createClient()
    const { data: snapshot } = await sb.from('calendar_events').select('*').eq('id', detailEvent.id).single()
    if (snapshot) {
      const { error } = await moveToTrash(
        sb,
        'calendar_event',
        detailEvent.id,
        detailEvent.project_name,
        userId,
        snapshot as Record<string, unknown>,
        project.name,
      )
      if (error) {
        console.error('[SchedulingWorkspace] Delete failed:', error)
      }
    }
    setDeleting(false)
    setShowDeleteConfirm(false)
    setDetailEvent(null)
    await fetchEvents()
  }

  return (
    <WorkspaceShell
      title="Scheduling"
      icon={<CalendarIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <button
          onClick={() => openCreateForm()}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add Event
        </button>
      }
    >
      <div className="p-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600"><XIcon className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Event count summary */}
            <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
              {project.start_date && project.end_date && (
                <span>Job: {formatDisplayDate(project.start_date)} – {formatDisplayDate(project.end_date)}</span>
              )}
              <span>{events.length} event{events.length !== 1 ? 's' : ''}</span>
            </div>

            {/* FullCalendar */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm calendar-wrapper">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={fcEvents}
                dateClick={handleDateClick}
                eventClick={handleEventClick}
                headerToolbar={{
                  left: 'prev,next',
                  center: 'title',
                  right: 'today',
                }}
                height="auto"
                fixedWeekCount={false}
                eventDisplay="block"
                displayEventTime={false}
              />
            </div>

            {/* Event list below calendar */}
            {events.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Scheduled Events</h3>
                <div className="space-y-2">
                  {events.map((evt) => (
                    <button
                      key={evt.id}
                      onClick={() => setDetailEvent(evt)}
                      className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-amber-300 hover:shadow-sm transition group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: evt.color || PRESET_COLORS[0].value }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{evt.project_name}</p>
                          <p className="text-xs text-gray-500">
                            {formatDisplayDate(evt.start_date)} – {formatDisplayDate(evt.end_date)}
                          </p>
                        </div>
                        {evt.crew && (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <UsersIcon className="w-3 h-3" />
                            <span className="truncate max-w-[120px]">{evt.crew}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Day Summary Modal ──────────────────────────────────────────────── */}
      {daySummaryDate && (() => {
        const clickedD = new Date(daySummaryDate + 'T12:00:00')
        const dayLabel = clickedD.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        const activeEvents = events.filter((evt) => evt.start_date <= daySummaryDate! && daySummaryDate! <= evt.end_date)
        const jobActive = project.start_date && project.end_date && project.start_date <= daySummaryDate && daySummaryDate <= project.end_date

        return (
          <Portal>
            <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50" onClick={() => setDaySummaryDate(null)}>
              <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md bg-white md:rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">{dayLabel}</h3>
                  <button onClick={() => setDaySummaryDate(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded">
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                  {jobActive && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-sm font-medium text-gray-900">{project.name} (Job)</span>
                    </div>
                  )}
                  {activeEvents.map((evt) => (
                    <button
                      key={evt.id}
                      onClick={() => { setDaySummaryDate(null); setDetailEvent(evt) }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: evt.color || PRESET_COLORS[0].value }} />
                      <span className="text-sm text-gray-900">{evt.project_name}</span>
                    </button>
                  ))}
                  {!jobActive && activeEvents.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Nothing scheduled</p>
                  )}
                  <button
                    onClick={() => { setDaySummaryDate(null); openCreateForm(daySummaryDate!) }}
                    className="w-full flex items-center justify-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium py-2"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add event on this day
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )
      })()}

      {/* ── Event Detail Modal ────────────────────────────────────────────── */}
      {detailEvent && !showDeleteConfirm && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50" onClick={() => setDetailEvent(null)}>
            <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md bg-white md:rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: detailEvent.color || PRESET_COLORS[0].value }} />
                  <h3 className="font-semibold text-gray-900">{detailEvent.project_name}</h3>
                </div>
                <button onClick={() => setDetailEvent(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">Dates</p>
                  <p className="text-sm text-gray-900">{formatDisplayDate(detailEvent.start_date)} – {formatDisplayDate(detailEvent.end_date)}</p>
                  {!detailEvent.include_weekends && <p className="text-xs text-gray-400 mt-0.5">Weekdays only</p>}
                </div>
                {detailEvent.crew && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase">Crew</p>
                    <p className="text-sm text-gray-900">{detailEvent.crew}</p>
                  </div>
                )}
                {detailEvent.notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailEvent.notes}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 p-4 border-t border-gray-200">
                <button
                  onClick={() => openEditForm(detailEvent)}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 rounded-lg py-2 text-sm font-medium hover:bg-red-50 transition"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      {showDeleteConfirm && detailEvent && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
            <div className="bg-white rounded-xl p-6 mx-4 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-gray-900 mb-2">Delete Event</h3>
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to delete &ldquo;{detailEvent.project_name}&rdquo;? It will be moved to the trash bin.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold transition"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Create/Edit Event Form Modal ──────────────────────────────────── */}
      {showForm && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50" onClick={() => { setShowForm(false); resetForm() }}>
            <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
                <h2 className="text-lg font-semibold text-gray-900">{editingEvent ? 'Edit Event' : 'New Event'}</h2>
                <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                    <span>{formError}</span>
                    <button onClick={() => setFormError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Event Name */}
                <div>
                  <label className={labelCls}>Event Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Crew Day Off, Delivery, Inspection"
                    className={inputCls}
                  />
                </div>

                {/* Start Date & End Date */}
                <div className="flex flex-col gap-3 w-1/2">
                  <div>
                    <label className={labelCls}>Start Date *</label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => {
                        setFormStartDate(e.target.value)
                        if (formEndDate && e.target.value > formEndDate) setFormEndDate(e.target.value)
                      }}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>End Date *</label>
                    <input
                      type="date"
                      value={formEndDate}
                      min={formStartDate || undefined}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className={labelCls + ' mb-0'}>Include Weekends?</label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formIncludeWeekends}
                      onClick={() => setFormIncludeWeekends(!formIncludeWeekends)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${formIncludeWeekends ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${formIncludeWeekends ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                {/* Crew */}
                <div>
                  <label className={labelCls}>Crew</label>
                  <div className="flex flex-wrap gap-2">
                    {employeeProfiles.map((emp) => {
                      const isSelected = formCrewNames.includes(emp.name)
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => toggleCrewMember(emp.name)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            isSelected
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {emp.name}
                        </button>
                      )
                    })}
                    {showCustomCrewInput ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          value={customCrewName}
                          onChange={(e) => setCustomCrewName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') addCustomCrewMember(); if (e.key === 'Escape') { setShowCustomCrewInput(false); setCustomCrewName('') } }}
                          placeholder="Name"
                          className="border border-gray-300 rounded-full px-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <button type="button" onClick={addCustomCrewMember} className="text-green-600 hover:text-green-700 p-0.5">
                          <CheckIcon className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => { setShowCustomCrewInput(false); setCustomCrewName('') }} className="text-gray-400 hover:text-gray-600 p-0.5">
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCustomCrewInput(true)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                      >
                        <PlusIcon className="w-3 h-3" />
                        Employee
                      </button>
                    )}
                    {employeeProfiles.length === 0 && !showCustomCrewInput && employeesLoaded && (
                      <p className="text-xs text-gray-400">No employees found. Add employees in Employee Management.</p>
                    )}
                  </div>
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
              <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
                <button
                  onClick={() => { setShowForm(false); resetForm() }}
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
        </Portal>
      )}
    </WorkspaceShell>
  )
}
