'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, DatesSetArg } from '@fullcalendar/core'
import { PlusIcon, XIcon, Trash2Icon, PencilIcon, CalendarIcon, UsersIcon, FileTextIcon, DownloadIcon, LoaderIcon, CheckIcon, LinkIcon, SearchIcon, ChevronDownIcon, ArrowLeftIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { CalendarEvent, EmployeeProfile, Project } from '@/types'
import type { UserRole } from '@/types'
import { usePermissions } from '@/lib/usePermissions'

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

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6
}

/** Advance to next weekday if the date falls on a weekend. */
function skipToWeekday(d: Date): Date {
  const r = new Date(d)
  while (isWeekend(r)) r.setDate(r.getDate() + 1)
  return r
}

/**
 * Calculate end date from start + duration.
 * When includeWeekends is false, the start date is snapped to the next weekday
 * and only weekdays are counted.
 */
function addBusinessDays(start: string, days: number, includeWeekends: boolean): string {
  const d = new Date(start + 'T12:00:00')

  if (includeWeekends) {
    d.setDate(d.getDate() + days - 1)
    return toDateStr(d)
  }

  // Snap start to a weekday
  const cur = skipToWeekday(d)
  let remaining = days - 1 // start date counts as day 1
  while (remaining > 0) {
    cur.setDate(cur.getDate() + 1)
    if (!isWeekend(cur)) remaining--
  }
  return toDateStr(cur)
}

function countDuration(start: string, end: string, includeWeekends: boolean): number {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    if (includeWeekends || !isWeekend(cur)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(count, 1)
}

/** FullCalendar end dates are exclusive, so add 1 day for display. */
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
  extendedProps: CalendarEvent & { _isStandalone?: boolean; _isLinkedProject?: boolean; _linkedProjectId?: string }
}

/**
 * For events that exclude weekends, split the date range into per-week
 * Mon–Fri segments so FullCalendar never draws a bar through Sat/Sun.
 */
function eventToFCEvents(evt: CalendarEvent, isStandalone: boolean): FCEvent[] {
  const color = evt.color || PRESET_COLORS[0].value
  const base = {
    title: isStandalone ? `📅 ${evt.project_name}` : evt.project_name,
    backgroundColor: color,
    borderColor: color,
    classNames: isStandalone ? ['standalone-event'] : [],
    extendedProps: { ...evt, _isStandalone: isStandalone },
  }

  if (evt.include_weekends) {
    return [{ id: evt.id, ...base, start: evt.start_date, end: fcEndDateExclusive(evt.end_date) }]
  }

  const segments: FCEvent[] = []
  const endDate = new Date(evt.end_date + 'T12:00:00')

  let segStart = skipToWeekday(new Date(evt.start_date + 'T12:00:00'))

  while (segStart <= endDate) {
    // Find Friday of this week
    const dayOfWeek = segStart.getDay() // 1=Mon .. 5=Fri
    const daysUntilFri = 5 - dayOfWeek
    const friday = new Date(segStart)
    if (daysUntilFri > 0) friday.setDate(friday.getDate() + daysUntilFri)

    // Segment ends at Friday or the event end date, whichever is earlier
    const segEnd = friday <= endDate ? friday : endDate

    // Only add if segment end is a weekday
    if (!isWeekend(segEnd)) {
      segments.push({
        id: evt.id + (segments.length > 0 ? `-${segments.length}` : ''),
        ...base,
        start: toDateStr(segStart),
        end: fcEndDateExclusive(toDateStr(segEnd)),
      })
    }

    // Advance past the weekend to next Monday
    const nextMon = new Date(segEnd)
    nextMon.setDate(nextMon.getDate() + 1)
    segStart = skipToWeekday(nextMon)
  }

  return segments
}

/**
 * Convert a project (job) with dates into FCEvents for the calendar.
 */
function projectToFCEvents(proj: Project): FCEvent[] {
  if (!proj.start_date || !proj.end_date) return []

  const color = PRESET_COLORS[1].value // Blue for projects
  const includeWeekends = proj.include_weekends ?? false
  const base = {
    title: proj.name,
    backgroundColor: color,
    borderColor: color,
    classNames: [] as string[],
    extendedProps: {
      id: `proj-${proj.id}`,
      created_by: '',
      project_name: proj.name,
      start_date: proj.start_date,
      end_date: proj.end_date,
      include_weekends: includeWeekends,
      crew: '',
      notes: null,
      color: color,
      created_at: proj.created_at,
      _isStandalone: false,
      _isLinkedProject: true,
      _linkedProjectId: proj.id,
    },
  }

  if (includeWeekends) {
    return [{ id: `proj-${proj.id}`, ...base, start: proj.start_date, end: fcEndDateExclusive(proj.end_date) }]
  }

  const segments: FCEvent[] = []
  const endDate = new Date(proj.end_date + 'T12:00:00')
  let segStart = skipToWeekday(new Date(proj.start_date + 'T12:00:00'))

  while (segStart <= endDate) {
    const dayOfWeek = segStart.getDay()
    const daysUntilFri = 5 - dayOfWeek
    const friday = new Date(segStart)
    if (daysUntilFri > 0) friday.setDate(friday.getDate() + daysUntilFri)
    const segEnd = friday <= endDate ? friday : endDate

    if (!isWeekend(segEnd)) {
      segments.push({
        id: `proj-${proj.id}` + (segments.length > 0 ? `-${segments.length}` : ''),
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

// ── Component ────────────────────────────────────────────────────────────────

interface CalendarPageClientProps {
  initialEvents: CalendarEvent[]
  initialProjects: Project[]
  userId: string
  userRole?: UserRole
}

export default function CalendarPageClient({ initialEvents, initialProjects, userId, userRole = 'crew' }: CalendarPageClientProps) {
  const { canCreate: canCreatePerm, canEdit: canEditPerm } = usePermissions(userRole)
  const canCreateCalendar = canCreatePerm('calendar')
  const canEditCalendar = canEditPerm('calendar')
  const router = useRouter()
  const supabase = createClient()
  const calendarRef = useRef<HTMLDivElement>(null)

  // Modal state
  const [showNewPicker, setShowNewPicker] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [showLinkProjectModal, setShowLinkProjectModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [detailEvent, setDetailEvent] = useState<CalendarEvent & { _isStandalone?: boolean; _isLinkedProject?: boolean; _linkedProjectId?: string } | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state (standalone event)
  const [formProjectName, setFormProjectName] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formIncludeWeekends, setFormIncludeWeekends] = useState(false)
  const [formCrewNames, setFormCrewNames] = useState<string[]>([])
  const [formNotes, setFormNotes] = useState('')
  const [formColor, setFormColor] = useState(PRESET_COLORS[0].value)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [viewTitle, setViewTitle] = useState<string>('')

  // Employee pill selector
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([])
  const [employeesLoaded, setEmployeesLoaded] = useState(false)
  const [showCustomCrewInput, setShowCustomCrewInput] = useState(false)
  const [customCrewName, setCustomCrewName] = useState('')

  // Link Project form state
  const [linkSelectedProjectId, setLinkSelectedProjectId] = useState('')
  const [linkStartDate, setLinkStartDate] = useState('')
  const [linkEndDate, setLinkEndDate] = useState('')
  const [linkIncludeWeekends, setLinkIncludeWeekends] = useState(false)
  const [linkSearchQuery, setLinkSearchQuery] = useState('')
  const [linkSaving, setLinkSaving] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  // "Create New Job" sub-flow inside Link a Project modal
  const [showCreateNewJob, setShowCreateNewJob] = useState(false)
  const [newJobName, setNewJobName] = useState('')
  const [newJobClient, setNewJobClient] = useState('')
  const [newJobAddress, setNewJobAddress] = useState('')
  const [newJobEstimate, setNewJobEstimate] = useState('')
  const [newJobStatus, setNewJobStatus] = useState<'Active' | 'Complete'>('Active')
  const [newJobStartDate, setNewJobStartDate] = useState('')
  const [newJobEndDate, setNewJobEndDate] = useState('')
  const [newJobIncludeWeekends, setNewJobIncludeWeekends] = useState(false)
  const [newJobCustomers, setNewJobCustomers] = useState<{ id: string; name: string; company?: string | null }[]>([])
  const [newJobShowCustomerDropdown, setNewJobShowCustomerDropdown] = useState(false)
  const [newJobCustomerSearch, setNewJobCustomerSearch] = useState('')
  const newJobDropdownRef = useRef<HTMLDivElement>(null)

  // Date clicked on calendar (passed to picker flows)
  const [clickedDate, setClickedDate] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!employeesLoaded) {
      supabase
        .from('employee_profiles')
        .select('*')
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) console.error('[CalendarPageClient] Fetch employees failed:', error)
          setEmployeeProfiles((data as EmployeeProfile[]) ?? [])
          setEmployeesLoaded(true)
        })
    }
  }, [employeesLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCrewMember(name: string) {
    setFormCrewNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  function addCustomCrewMember() {
    const name = customCrewName.trim()
    if (!name) return
    if (!formCrewNames.includes(name)) {
      setFormCrewNames((prev) => [...prev, name])
    }
    setCustomCrewName('')
    setShowCustomCrewInput(false)
  }

  const canDownloadPdf = userRole === 'admin' || userRole === 'office_manager'

  // Map DB events + linked projects to FullCalendar events
  const fcEvents = useMemo(() => {
    const standaloneEvents = initialEvents.flatMap((evt) => eventToFCEvents(evt, true))
    const projectEvents = initialProjects.flatMap((proj) => projectToFCEvents(proj))
    return [...projectEvents, ...standaloneEvents]
  }, [initialEvents, initialProjects])

  // Filter projects for link search
  const filteredProjects = useMemo(() => {
    const q = linkSearchQuery.toLowerCase().trim()
    if (!q) return initialProjects
    return initialProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.client_name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    )
  }, [initialProjects, linkSearchQuery])

  // ── Picker helpers ────────────────────────────────────────────────────────

  function openNewPicker(startDate?: string) {
    setClickedDate(startDate)
    setShowNewPicker(true)
  }

  function handlePickStandalone() {
    setShowNewPicker(false)
    openCreateForm(clickedDate)
  }

  function handlePickLinkProject() {
    setShowNewPicker(false)
    resetLinkForm()
    if (clickedDate) {
      setLinkStartDate(clickedDate)
      setLinkEndDate(clickedDate)
    }
    setShowLinkProjectModal(true)
  }

  // ── Form helpers ─────────────────────────────────────────────────────────

  function resetForm() {
    setFormProjectName('')
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

  // Fetch customers for new job form
  useEffect(() => {
    if (showCreateNewJob && newJobCustomers.length === 0) {
      supabase
        .from('customers')
        .select('id, name, company')
        .order('name', { ascending: true })
        .then(({ data }) => {
          if (data) setNewJobCustomers(data)
        })
    }
  }, [showCreateNewJob]) // eslint-disable-line react-hooks/exhaustive-deps

  // Customer dropdown click-outside handler
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (newJobDropdownRef.current && !newJobDropdownRef.current.contains(e.target as Node)) {
        setNewJobShowCustomerDropdown(false)
      }
    }
    if (newJobShowCustomerDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [newJobShowCustomerDropdown])

  function resetLinkForm() {
    setLinkSelectedProjectId('')
    setLinkStartDate('')
    setLinkEndDate('')
    setLinkIncludeWeekends(false)
    setLinkSearchQuery('')
    setLinkError(null)
    resetNewJobForm()
  }

  function resetNewJobForm() {
    setShowCreateNewJob(false)
    setNewJobName('')
    setNewJobClient('')
    setNewJobAddress('')
    setNewJobEstimate('')
    setNewJobStatus('Active')
    setNewJobStartDate('')
    setNewJobEndDate('')
    setNewJobIncludeWeekends(false)
    setNewJobCustomerSearch('')
    setNewJobShowCustomerDropdown(false)
  }

  function openCreateForm(startDate?: string) {
    resetForm()
    if (startDate) {
      setFormStartDate(startDate)
      setFormEndDate(startDate)
    }
    setShowFormModal(true)
  }

  function openEditForm(evt: CalendarEvent) {
    setEditingEvent(evt)
    setFormProjectName(evt.project_name)
    setFormStartDate(evt.start_date)
    setFormEndDate(evt.end_date)
    setFormIncludeWeekends(evt.include_weekends ?? false)
    setFormCrewNames(evt.crew ? evt.crew.split(',').map((s) => s.trim()).filter(Boolean) : [])
    setFormNotes(evt.notes || '')
    setFormColor(evt.color || PRESET_COLORS[0].value)
    setFormError(null)
    setDetailEvent(null)
    setShowFormModal(true)
  }

  function openEditLinkedProject(projectId: string) {
    const proj = initialProjects.find((p) => p.id === projectId)
    if (!proj) return
    resetLinkForm()
    setLinkSelectedProjectId(proj.id)
    setLinkStartDate(proj.start_date || '')
    setLinkEndDate(proj.end_date || '')
    setLinkIncludeWeekends(proj.include_weekends ?? false)
    setDetailEvent(null)
    setShowLinkProjectModal(true)
  }

  // ── Calendar callbacks ───────────────────────────────────────────────────

  const handleDateClick = useCallback((arg: DateClickArg) => {
    if (!canCreateCalendar) return
    openNewPicker(arg.dateStr)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreateCalendar])

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const evt = arg.event.extendedProps as CalendarEvent & { _isStandalone?: boolean; _isLinkedProject?: boolean; _linkedProjectId?: string }
      setDetailEvent(evt)
    },
    [],
  )

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setViewTitle(arg.view.title)
  }, [])

  async function handleDownloadPdf() {
    setPdfLoading(true)
    try {
      const el = calendarRef.current
      if (!el) return

      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 10
      const maxW = pageW - margin * 2
      const maxH = pageH - margin * 2
      const ratio = Math.min(maxW / canvas.width, maxH / canvas.height)
      const imgW = canvas.width * ratio
      const imgH = canvas.height * ratio
      const x = (pageW - imgW) / 2
      const y = (pageH - imgH) / 2

      doc.addImage(imgData, 'PNG', x, y, imgW, imgH)

      const safeTitle = (viewTitle || 'Calendar').replace(/[^a-z0-9]/gi, '-')
      doc.save(`Calendar-${safeTitle}.pdf`)
    } catch {
      // silently fail
    } finally {
      setPdfLoading(false)
    }
  }

  // ── Save (standalone event) ───────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    setFormError(null)

    try {
      if (!formProjectName.trim()) throw new Error('Please enter a project name')
      if (!formStartDate) throw new Error('Please select a start date')
      if (!formEndDate) throw new Error('Please select an end date')
      if (formEndDate < formStartDate) throw new Error('End date must be on or after start date')

      const payload = {
        project_name: formProjectName.trim(),
        start_date: formStartDate,
        end_date: formEndDate,
        include_weekends: formIncludeWeekends,
        crew: formCrewNames.join(', '),
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

  // ── Save (link project) ──────────────────────────────────────────────────

  async function handleLinkProjectSave() {
    setLinkSaving(true)
    setLinkError(null)

    try {
      if (!linkSelectedProjectId) throw new Error('Please select a job')
      if (!linkStartDate) throw new Error('Please select a start date')
      if (!linkEndDate) throw new Error('Please select an end date')
      if (linkEndDate < linkStartDate) throw new Error('End date must be on or after start date')

      const { error } = await supabase
        .from('projects')
        .update({
          start_date: linkStartDate,
          end_date: linkEndDate,
          include_weekends: linkIncludeWeekends,
        })
        .eq('id', linkSelectedProjectId)

      if (error) throw error

      setShowLinkProjectModal(false)
      resetLinkForm()
      router.refresh()
    } catch (err: unknown) {
      let msg = 'Failed to link project'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setLinkError(msg)
    } finally {
      setLinkSaving(false)
    }
  }

  // ── Save (create new job from Link modal) ──────────────────────────────

  async function handleCreateNewJobSave() {
    setLinkSaving(true)
    setLinkError(null)

    try {
      if (!newJobName.trim()) throw new Error('Please enter a project name')
      if (!newJobClient.trim()) throw new Error('Please enter a client name')
      if (!newJobAddress.trim()) throw new Error('Please enter an address')
      if (!newJobStartDate) throw new Error('Please select a start date')
      if (!newJobEndDate) throw new Error('Please select an end date')
      if (newJobEndDate < newJobStartDate) throw new Error('End date must be on or after start date')

      const { error } = await supabase.from('projects').insert({
        name: newJobName.trim(),
        client_name: newJobClient.trim(),
        address: newJobAddress.trim(),
        status: newJobStatus,
        ...(newJobEstimate.trim() ? { estimate_number: newJobEstimate.trim() } : {}),
        start_date: newJobStartDate,
        end_date: newJobEndDate,
        include_weekends: newJobIncludeWeekends,
      })

      if (error) throw error

      setShowLinkProjectModal(false)
      resetLinkForm()
      router.refresh()
    } catch (err: unknown) {
      let msg = 'Failed to create job'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setLinkError(msg)
    } finally {
      setLinkSaving(false)
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

  // When a project is selected in Link modal, pre-fill dates
  function handleLinkProjectSelect(projectId: string) {
    setLinkSelectedProjectId(projectId)
    const proj = initialProjects.find((p) => p.id === projectId)
    if (proj) {
      if (proj.start_date) setLinkStartDate(proj.start_date)
      if (proj.end_date) setLinkEndDate(proj.end_date)
      setLinkIncludeWeekends(proj.include_weekends ?? false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-0 lg:h-screen">
      {/* Header */}
      <div className="px-4 py-5 sm:px-6 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          </div>
          <div className="flex items-center gap-2">
            {canDownloadPdf && (
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 p-2.5 rounded-lg transition disabled:opacity-50"
                title="Download PDF"
              >
                {pdfLoading ? (
                  <LoaderIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <DownloadIcon className="w-4 h-4" />
                )}
              </button>
            )}
            {canCreateCalendar && (
              <button
                onClick={() => openNewPicker()}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
              >
                <PlusIcon className="w-4 h-4" />
                New
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FullCalendar */}
      <div className="flex-1 px-4 pb-4 sm:px-6 sm:pb-6 min-h-0 lg:overflow-auto">
        <div ref={calendarRef} className="max-w-6xl mx-auto bg-white border border-gray-200 rounded-xl p-4 shadow-sm calendar-wrapper">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={fcEvents}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            headerToolbar={{
              left: 'prev,next',
              center: 'title',
              right: 'today dayGridMonth',
            }}
            height="auto"
            fixedWeekCount={false}
            eventDisplay="block"
            displayEventTime={false}
          />
        </div>
      </div>

      {/* ── "Add to Calendar" Picker Modal ──────────────────────────────────── */}
      {showNewPicker && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => setShowNewPicker(false)}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-sm bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <h2 className="text-lg font-semibold text-gray-900">Add to Calendar</h2>
              <button
                onClick={() => setShowNewPicker(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 md:p-6 space-y-3">
              <button
                onClick={handlePickLinkProject}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition group text-left"
              >
                <div className="w-11 h-11 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition">
                  <LinkIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Link a Project</p>
                  <p className="text-xs text-gray-500 mt-0.5">Connect an existing job to the calendar</p>
                </div>
              </button>

              <button
                onClick={handlePickStandalone}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition group text-left"
              >
                <div className="w-11 h-11 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 transition">
                  <CalendarIcon className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Standalone Event</p>
                  <p className="text-xs text-gray-500 mt-0.5">Crew day off, delivery, inspection, etc.</p>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="flex-none p-4 border-t border-gray-200" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
              <button
                onClick={() => setShowNewPicker(false)}
                className="w-full border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Link a Project Modal ────────────────────────────────────────────── */}
      {showLinkProjectModal && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => { setShowLinkProjectModal(false); resetLinkForm() }}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <div className="flex items-center gap-2">
                {showCreateNewJob && (
                  <button
                    onClick={() => setShowCreateNewJob(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                  </button>
                )}
                <h2 className="text-lg font-semibold text-gray-900">
                  {showCreateNewJob ? 'Create New Job' : 'Link a Project'}
                </h2>
              </div>
              <button
                onClick={() => { setShowLinkProjectModal(false); resetLinkForm() }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
              {linkError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                  <span>{linkError}</span>
                  <button onClick={() => setLinkError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {showCreateNewJob ? (
                /* ── Create New Job form ──────────────────────────────── */
                <>
                  <div>
                    <label className={labelCls}>Project Name *</label>
                    <input
                      type="text"
                      value={newJobName}
                      onChange={(e) => setNewJobName(e.target.value)}
                      placeholder="e.g. Aircraft Hangar Coating"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Client Name *</label>
                    <input
                      type="text"
                      value={newJobClient}
                      onChange={(e) => setNewJobClient(e.target.value)}
                      placeholder="e.g. John Smith"
                      className={inputCls}
                    />
                    <div className="relative mt-1" ref={newJobDropdownRef}>
                      <button
                        type="button"
                        onClick={() => { setNewJobShowCustomerDropdown(!newJobShowCustomerDropdown); setNewJobCustomerSearch('') }}
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                      >
                        Select existing customer
                        <ChevronDownIcon className="w-3 h-3" />
                      </button>
                      {newJobShowCustomerDropdown && (
                        <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 flex flex-col">
                          <div className="p-2 border-b border-gray-100">
                            <input
                              type="text"
                              placeholder="Search customers..."
                              value={newJobCustomerSearch}
                              onChange={(e) => setNewJobCustomerSearch(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                              autoFocus
                            />
                          </div>
                          <div className="overflow-y-auto flex-1">
                            {newJobCustomers
                              .filter((c) =>
                                c.name.toLowerCase().includes(newJobCustomerSearch.toLowerCase()) ||
                                (c.company && c.company.toLowerCase().includes(newJobCustomerSearch.toLowerCase()))
                              )
                              .map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setNewJobClient(c.name)
                                    setNewJobShowCustomerDropdown(false)
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors"
                                >
                                  <p className="text-gray-900 text-xs font-medium truncate">{c.name}</p>
                                  {c.company && <p className="text-gray-500 text-xs truncate">{c.company}</p>}
                                </button>
                              ))}
                            {newJobCustomers.filter((c) =>
                              c.name.toLowerCase().includes(newJobCustomerSearch.toLowerCase()) ||
                              (c.company && c.company.toLowerCase().includes(newJobCustomerSearch.toLowerCase()))
                            ).length === 0 && (
                              <p className="px-3 py-2 text-xs text-gray-400">No customers found.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Address *</label>
                    <input
                      type="text"
                      value={newJobAddress}
                      onChange={(e) => setNewJobAddress(e.target.value)}
                      placeholder="e.g. 123 Main St, Austin TX"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Estimate #</label>
                    <input
                      type="text"
                      value={newJobEstimate}
                      onChange={(e) => setNewJobEstimate(e.target.value)}
                      placeholder="e.g. EST-1042"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Status</label>
                    <select
                      value={newJobStatus}
                      onChange={(e) => setNewJobStatus(e.target.value as 'Active' | 'Complete')}
                      className={inputCls + ' bg-white'}
                    >
                      <option value="Active">Active</option>
                      <option value="Complete">Complete</option>
                    </select>
                  </div>

                  {/* Start Date & End Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Start Date *</label>
                      <input
                        type="date"
                        value={newJobStartDate}
                        onChange={(e) => {
                          setNewJobStartDate(e.target.value)
                          if (newJobEndDate && e.target.value > newJobEndDate) setNewJobEndDate(e.target.value)
                        }}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>End Date *</label>
                      <input
                        type="date"
                        value={newJobEndDate}
                        min={newJobStartDate || undefined}
                        onChange={(e) => setNewJobEndDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className={labelCls + ' mb-0'}>Include Weekends?</label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={newJobIncludeWeekends}
                      onClick={() => setNewJobIncludeWeekends(!newJobIncludeWeekends)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${newJobIncludeWeekends ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${newJobIncludeWeekends ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </>
              ) : (
                /* ── Select Existing Job flow ────────────────────────── */
                <>
                  {/* + Create New Job button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateNewJob(true)
                      if (clickedDate) {
                        setNewJobStartDate(clickedDate)
                        setNewJobEndDate(clickedDate)
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 transition"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Create New Job
                  </button>

                  {/* Job Search & Select */}
                  <div>
                    <label className={labelCls}>Select Job *</label>
                    <div className="relative mb-2">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={linkSearchQuery}
                        onChange={(e) => setLinkSearchQuery(e.target.value)}
                        placeholder="Search jobs by name, client, or address..."
                        className={inputCls + ' pl-9'}
                      />
                    </div>
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {filteredProjects.length === 0 && (
                        <p className="p-3 text-sm text-gray-400 text-center">No jobs found</p>
                      )}
                      {filteredProjects.map((proj) => {
                        const isSelected = linkSelectedProjectId === proj.id
                        const hasDates = !!(proj.start_date && proj.end_date)
                        return (
                          <button
                            key={proj.id}
                            type="button"
                            onClick={() => handleLinkProjectSelect(proj.id)}
                            className={`w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-b-0 transition text-sm ${
                              isSelected
                                ? 'bg-amber-50 border-l-2 border-l-amber-500'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <p className={`font-medium ${isSelected ? 'text-amber-700' : 'text-gray-900'}`}>
                              {proj.name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {proj.client_name} &middot; {proj.address}
                              {hasDates && (
                                <span className="ml-1 text-blue-500">&middot; On calendar</span>
                              )}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Start Date & End Date */}
                  <div className="flex flex-col gap-3 w-1/2">
                    <div>
                      <label className={labelCls}>Start Date *</label>
                      <input
                        type="date"
                        value={linkStartDate}
                        onChange={(e) => {
                          setLinkStartDate(e.target.value)
                          if (linkEndDate && e.target.value > linkEndDate) setLinkEndDate(e.target.value)
                        }}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>End Date *</label>
                      <input
                        type="date"
                        value={linkEndDate}
                        min={linkStartDate || undefined}
                        onChange={(e) => setLinkEndDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={labelCls + ' mb-0'}>Include Weekends?</label>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={linkIncludeWeekends}
                        onClick={() => setLinkIncludeWeekends(!linkIncludeWeekends)}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${linkIncludeWeekends ? 'bg-blue-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${linkIncludeWeekends ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
              <button
                onClick={() => {
                  if (showCreateNewJob) {
                    setShowCreateNewJob(false)
                  } else {
                    setShowLinkProjectModal(false)
                    resetLinkForm()
                  }
                }}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                {showCreateNewJob ? 'Back' : 'Cancel'}
              </button>
              <button
                onClick={showCreateNewJob ? handleCreateNewJobSave : handleLinkProjectSave}
                disabled={linkSaving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {linkSaving ? 'Saving...' : showCreateNewJob ? 'Create & Add to Calendar' : 'Save'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Add/Edit Standalone Event Modal ─────────────────────────────────── */}
      {showFormModal && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => { setShowFormModal(false); resetForm() }}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <h2 className="text-lg font-semibold text-gray-900">
                {editingEvent ? 'Edit Event' : 'Add Standalone Event'}
              </h2>
              <button
                onClick={() => { setShowFormModal(false); resetForm() }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
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

              {/* Project Name */}
              <div>
                <label className={labelCls}>Event Name *</label>
                <input
                  type="text"
                  value={formProjectName}
                  onChange={(e) => setFormProjectName(e.target.value)}
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
                  {/* One-off names not in profiles */}
                  {formCrewNames
                    .filter((name) => !employeeProfiles.some((emp) => emp.name === name))
                    .map((name) => (
                      <button
                        key={`custom-${name}`}
                        type="button"
                        onClick={() => toggleCrewMember(name)}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors bg-gray-900 text-white border-gray-900"
                      >
                        {name}
                      </button>
                    ))}
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
        </Portal>
      )}

      {/* ── Event Detail Modal ──────────────────────────────────────────────── */}
      {detailEvent && !showDeleteConfirm && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => setDetailEvent(null)}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header with color bar */}
            <div
              className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
              style={{ minHeight: '56px', borderTop: `4px solid ${detailEvent.color || PRESET_COLORS[0].value}` }}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{detailEvent.project_name}</h2>
                {detailEvent._isLinkedProject && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                    <LinkIcon className="w-3 h-3" />
                    Job
                  </span>
                )}
                {detailEvent._isStandalone && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                    📅 Event
                  </span>
                )}
              </div>
              <button
                onClick={() => setDetailEvent(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition flex-shrink-0"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
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
            <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
              {/* Linked project: edit dates */}
              {detailEvent._isLinkedProject && detailEvent._linkedProjectId && canEditCalendar && (
                <button
                  onClick={() => openEditLinkedProject(detailEvent._linkedProjectId!)}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg py-2.5 text-sm font-semibold transition"
                >
                  <PencilIcon className="w-4 h-4" />
                  Edit Dates
                </button>
              )}
              {/* Standalone event: edit / delete */}
              {detailEvent._isStandalone && canEditCalendar && detailEvent.created_by === userId && (
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
              {/* Fallback close */}
              {!detailEvent._isLinkedProject && (!detailEvent._isStandalone || !canEditCalendar || detailEvent.created_by !== userId) && (
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
        </Portal>
      )}

      {/* ── Delete Confirmation ─────────────────────────────────────────────── */}
      {showDeleteConfirm && detailEvent && (
        <Portal>
        <div className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => setShowDeleteConfirm(false)}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Title bar */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <h3 className="text-lg font-semibold text-gray-900">Delete Event</h3>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <Trash2Icon className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete &ldquo;{detailEvent.project_name}&rdquo; from the calendar? This cannot be undone.
                </p>
              </div>
            </div>
            {/* Footer */}
            <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
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
        </Portal>
      )}

      {/* Standalone event dashed-border style */}
      <style>{`
        .standalone-event .fc-event-main {
          border: 1.5px dashed rgba(255,255,255,0.6);
          border-radius: 3px;
        }
      `}</style>
    </div>
  )
}
