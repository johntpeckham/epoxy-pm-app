'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { EventClickArg, DatesSetArg } from '@fullcalendar/core'
import { PlusIcon, XIcon, Trash2Icon, PencilIcon, CalendarIcon, UsersIcon, FileTextIcon, DownloadIcon, LoaderIcon, CheckIcon, LinkIcon, ChevronDownIcon } from 'lucide-react'
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
  display?: string
  extendedProps: CalendarEvent & { _isStandalone?: boolean; _isLinkedProject?: boolean; _linkedProjectId?: string; _clientName?: string; _address?: string; _estimateNumber?: string | null; _status?: string; _isDriveTime?: boolean }
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

  const color = proj.color || PRESET_COLORS[0].value // Use job color, fallback to amber
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
      crew: proj.crew || '',
      notes: proj.notes || null,
      color: color,
      created_at: proj.created_at,
      _isStandalone: false,
      _isLinkedProject: true,
      _linkedProjectId: proj.id,
      _clientName: proj.client_name,
      _address: proj.address,
      _estimateNumber: proj.estimate_number || null,
      _status: proj.status,
      _isDriveTime: false,
    },
  }

  const mainEvents: FCEvent[] = []

  if (includeWeekends) {
    mainEvents.push({ id: `proj-${proj.id}`, ...base, start: proj.start_date, end: fcEndDateExclusive(proj.end_date) })
  } else {
    const endDate = new Date(proj.end_date + 'T12:00:00')
    let segStart = skipToWeekday(new Date(proj.start_date + 'T12:00:00'))

    while (segStart <= endDate) {
      const dayOfWeek = segStart.getDay()
      const daysUntilFri = 5 - dayOfWeek
      const friday = new Date(segStart)
      if (daysUntilFri > 0) friday.setDate(friday.getDate() + daysUntilFri)
      const segEnd = friday <= endDate ? friday : endDate

      if (!isWeekend(segEnd)) {
        mainEvents.push({
          id: `proj-${proj.id}` + (mainEvents.length > 0 ? `-${mainEvents.length}` : ''),
          ...base,
          start: toDateStr(segStart),
          end: fcEndDateExclusive(toDateStr(segEnd)),
        })
      }

      const nextMon = new Date(segEnd)
      nextMon.setDate(nextMon.getDate() + 1)
      segStart = skipToWeekday(nextMon)
    }
  }

  // Drive time bars (faded, non-interactive)
  if (proj.drive_time_enabled && (proj.drive_time_days ?? 0) > 0) {
    const days = proj.drive_time_days ?? 1
    const position = proj.drive_time_position ?? 'both'
    // Use hex color with ~40% opacity via alpha channel
    const fadedColor = color + '66' // 40% opacity in hex

    const driveBase = {
      title: `🚗 ${proj.name}`,
      backgroundColor: fadedColor,
      borderColor: fadedColor,
      classNames: ['drive-time-bar'] as string[],
      display: 'block' as const,
      extendedProps: {
        ...base.extendedProps,
        _isDriveTime: true,
      },
    }

    if (position === 'front' || position === 'both') {
      // N calendar days before start_date
      const frontEnd = new Date(proj.start_date + 'T12:00:00')
      frontEnd.setDate(frontEnd.getDate() - 1)
      const frontStart = new Date(proj.start_date + 'T12:00:00')
      frontStart.setDate(frontStart.getDate() - days)
      if (frontStart <= frontEnd) {
        mainEvents.push({
          id: `proj-${proj.id}-drive-front`,
          ...driveBase,
          start: toDateStr(frontStart),
          end: fcEndDateExclusive(toDateStr(frontEnd)),
        })
      }
    }

    if (position === 'back' || position === 'both') {
      // N calendar days after end_date
      const backStart = new Date(proj.end_date + 'T12:00:00')
      backStart.setDate(backStart.getDate() + 1)
      const backEnd = new Date(proj.end_date + 'T12:00:00')
      backEnd.setDate(backEnd.getDate() + days)
      mainEvents.push({
        id: `proj-${proj.id}-drive-back`,
        ...driveBase,
        start: toDateStr(backStart),
        end: fcEndDateExclusive(toDateStr(backEnd)),
      })
    }
  }

  return mainEvents
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
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [detailEvent, setDetailEvent] = useState<CalendarEvent & { _isStandalone?: boolean; _isLinkedProject?: boolean; _linkedProjectId?: string; _clientName?: string; _address?: string; _estimateNumber?: string | null; _status?: string } | null>(null)
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

  // "Create New Job" modal state
  const [showCreateNewJob, setShowCreateNewJob] = useState(false)
  const [newJobName, setNewJobName] = useState('')
  const [newJobClient, setNewJobClient] = useState('')
  const [newJobAddress, setNewJobAddress] = useState('')
  const [newJobEstimate, setNewJobEstimate] = useState('')
  const [newJobStatus, setNewJobStatus] = useState<'Active' | 'Complete'>('Active')
  const [newJobStartDate, setNewJobStartDate] = useState('')
  const [newJobEndDate, setNewJobEndDate] = useState('')
  const [newJobIncludeWeekends, setNewJobIncludeWeekends] = useState(false)
  const [newJobDriveTimeEnabled, setNewJobDriveTimeEnabled] = useState(false)
  const [newJobDriveTimeDays, setNewJobDriveTimeDays] = useState(1)
  const [newJobDriveTimePosition, setNewJobDriveTimePosition] = useState<'front' | 'back' | 'both'>('both')
  const [newJobCrewNames, setNewJobCrewNames] = useState<string[]>([])
  const [newJobNotes, setNewJobNotes] = useState('')
  const [newJobColor, setNewJobColor] = useState(PRESET_COLORS[0].value)
  const [newJobShowCustomCrew, setNewJobShowCustomCrew] = useState(false)
  const [newJobCustomCrewName, setNewJobCustomCrewName] = useState('')
  const [newJobCustomers, setNewJobCustomers] = useState<{ id: string; name: string; company?: string | null }[]>([])
  const [newJobShowCustomerDropdown, setNewJobShowCustomerDropdown] = useState(false)
  const [newJobCustomerSearch, setNewJobCustomerSearch] = useState('')
  const newJobDropdownRef = useRef<HTMLDivElement>(null)
  const [newJobSaving, setNewJobSaving] = useState(false)
  const [newJobError, setNewJobError] = useState<string | null>(null)

  // Edit Project modal state (for clicking job-linked bars)
  const [showEditProjectModal, setShowEditProjectModal] = useState(false)
  const [editProjectId, setEditProjectId] = useState('')
  const [editProjectName, setEditProjectName] = useState('')
  const [editProjectClient, setEditProjectClient] = useState('')
  const [editProjectAddress, setEditProjectAddress] = useState('')
  const [editProjectEstimate, setEditProjectEstimate] = useState('')
  const [editProjectStatus, setEditProjectStatus] = useState<'Active' | 'Complete'>('Active')
  const [editProjectStartDate, setEditProjectStartDate] = useState('')
  const [editProjectEndDate, setEditProjectEndDate] = useState('')
  const [editProjectIncludeWeekends, setEditProjectIncludeWeekends] = useState(false)
  const [editProjectDriveTimeEnabled, setEditProjectDriveTimeEnabled] = useState(false)
  const [editProjectDriveTimeDays, setEditProjectDriveTimeDays] = useState(1)
  const [editProjectDriveTimePosition, setEditProjectDriveTimePosition] = useState<'front' | 'back' | 'both'>('both')
  const [editProjectCrewNames, setEditProjectCrewNames] = useState<string[]>([])
  const [editProjectNotes, setEditProjectNotes] = useState('')
  const [editProjectColor, setEditProjectColor] = useState(PRESET_COLORS[0].value)
  const [editProjectShowCustomCrew, setEditProjectShowCustomCrew] = useState(false)
  const [editProjectCustomCrewName, setEditProjectCustomCrewName] = useState('')
  const [editProjectSaving, setEditProjectSaving] = useState(false)
  const [editProjectError, setEditProjectError] = useState<string | null>(null)
  const [showRemoveFromCalendarConfirm, setShowRemoveFromCalendarConfirm] = useState(false)
  const [removingFromCalendar, setRemovingFromCalendar] = useState(false)

  // Date clicked on calendar (passed to picker flows)
  const [clickedDate, setClickedDate] = useState<string | undefined>(undefined)

  // Day Summary modal
  const [daySummaryDate, setDaySummaryDate] = useState<string | null>(null)

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

  async function addCustomCrewMember() {
    const name = customCrewName.trim()
    if (!name) return

    // Check if an employee with this name already exists
    const existing = employeeProfiles.find((emp) => emp.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!formCrewNames.includes(existing.name)) setFormCrewNames((prev) => [...prev, existing.name])
      setCustomCrewName('')
      setShowCustomCrewInput(false)
      return
    }

    // Insert new employee into employee_profiles
    const { data, error } = await supabase
      .from('employee_profiles')
      .insert({ name })
      .select()
      .single()

    if (error) {
      console.error('Failed to create employee:', error)
      if (!formCrewNames.includes(name)) setFormCrewNames((prev) => [...prev, name])
    } else if (data) {
      setEmployeeProfiles((prev) => [...prev, data as EmployeeProfile])
      if (!formCrewNames.includes(data.name)) setFormCrewNames((prev) => [...prev, data.name])
    }

    setCustomCrewName('')
    setShowCustomCrewInput(false)
  }

  function toggleNewJobCrewMember(name: string) {
    setNewJobCrewNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  async function addNewJobCustomCrewMember() {
    const name = newJobCustomCrewName.trim()
    if (!name) return

    const existing = employeeProfiles.find((emp) => emp.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!newJobCrewNames.includes(existing.name)) setNewJobCrewNames((prev) => [...prev, existing.name])
      setNewJobCustomCrewName('')
      setNewJobShowCustomCrew(false)
      return
    }

    const { data, error } = await supabase
      .from('employee_profiles')
      .insert({ name })
      .select()
      .single()

    if (error) {
      console.error('Failed to create employee:', error)
      if (!newJobCrewNames.includes(name)) setNewJobCrewNames((prev) => [...prev, name])
    } else if (data) {
      setEmployeeProfiles((prev) => [...prev, data as EmployeeProfile])
      if (!newJobCrewNames.includes(data.name)) setNewJobCrewNames((prev) => [...prev, data.name])
    }

    setNewJobCustomCrewName('')
    setNewJobShowCustomCrew(false)
  }

  function toggleEditProjectCrewMember(name: string) {
    setEditProjectCrewNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  async function addEditProjectCustomCrewMember() {
    const name = editProjectCustomCrewName.trim()
    if (!name) return

    const existing = employeeProfiles.find((emp) => emp.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!editProjectCrewNames.includes(existing.name)) setEditProjectCrewNames((prev) => [...prev, existing.name])
      setEditProjectCustomCrewName('')
      setEditProjectShowCustomCrew(false)
      return
    }

    const { data, error } = await supabase
      .from('employee_profiles')
      .insert({ name })
      .select()
      .single()

    if (error) {
      console.error('Failed to create employee:', error)
      if (!editProjectCrewNames.includes(name)) setEditProjectCrewNames((prev) => [...prev, name])
    } else if (data) {
      setEmployeeProfiles((prev) => [...prev, data as EmployeeProfile])
      if (!editProjectCrewNames.includes(data.name)) setEditProjectCrewNames((prev) => [...prev, data.name])
    }

    setEditProjectCustomCrewName('')
    setEditProjectShowCustomCrew(false)
  }

  const canDownloadPdf = userRole === 'admin' || userRole === 'office_manager'

  // Map DB events + linked projects to FullCalendar events
  const fcEvents = useMemo(() => {
    const standaloneEvents = initialEvents.flatMap((evt) => eventToFCEvents(evt, true))
    const projectEvents = initialProjects.flatMap((proj) => projectToFCEvents(proj))
    return [...projectEvents, ...standaloneEvents]
  }, [initialEvents, initialProjects])

  // ── Picker helpers ────────────────────────────────────────────────────────

  function openNewPicker(startDate?: string) {
    setClickedDate(startDate)
    setShowNewPicker(true)
  }

  function handlePickStandalone() {
    setShowNewPicker(false)
    openCreateForm(clickedDate)
  }

  function handlePickNewJob() {
    setShowNewPicker(false)
    resetNewJobForm()
    if (clickedDate) {
      setNewJobStartDate(clickedDate)
      setNewJobEndDate(clickedDate)
    }
    setShowCreateNewJob(true)
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
    if (showCreateNewJob) {
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

  function resetNewJobForm() {
    setNewJobName('')
    setNewJobClient('')
    setNewJobAddress('')
    setNewJobEstimate('')
    setNewJobStatus('Active')
    setNewJobStartDate('')
    setNewJobEndDate('')
    setNewJobIncludeWeekends(false)
    setNewJobDriveTimeEnabled(false)
    setNewJobDriveTimeDays(1)
    setNewJobDriveTimePosition('both')
    setNewJobCrewNames([])
    setNewJobNotes('')
    setNewJobColor(PRESET_COLORS[0].value)
    setNewJobShowCustomCrew(false)
    setNewJobCustomCrewName('')
    setNewJobCustomerSearch('')
    setNewJobShowCustomerDropdown(false)
    setNewJobError(null)
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

  function openEditProjectModal(projectId: string) {
    const proj = initialProjects.find((p) => p.id === projectId)
    if (!proj) return
    setEditProjectId(proj.id)
    setEditProjectName(proj.name)
    setEditProjectClient(proj.client_name)
    setEditProjectAddress(proj.address)
    setEditProjectEstimate(proj.estimate_number ?? '')
    setEditProjectStatus(proj.status)
    setEditProjectStartDate(proj.start_date || '')
    setEditProjectEndDate(proj.end_date || '')
    setEditProjectIncludeWeekends(proj.include_weekends ?? false)
    setEditProjectDriveTimeEnabled(proj.drive_time_enabled ?? false)
    setEditProjectDriveTimeDays(proj.drive_time_days ?? 1)
    setEditProjectDriveTimePosition(proj.drive_time_position ?? 'both')
    setEditProjectCrewNames(proj.crew ? proj.crew.split(',').map((s) => s.trim()).filter(Boolean) : [])
    setEditProjectNotes(proj.notes || '')
    setEditProjectColor(proj.color || PRESET_COLORS[0].value)
    setEditProjectShowCustomCrew(false)
    setEditProjectCustomCrewName('')
    setEditProjectError(null)
    setShowRemoveFromCalendarConfirm(false)
    setDetailEvent(null)
    setShowEditProjectModal(true)
  }

  function resetEditProjectForm() {
    setEditProjectId('')
    setEditProjectName('')
    setEditProjectClient('')
    setEditProjectAddress('')
    setEditProjectEstimate('')
    setEditProjectStatus('Active')
    setEditProjectStartDate('')
    setEditProjectEndDate('')
    setEditProjectIncludeWeekends(false)
    setEditProjectDriveTimeEnabled(false)
    setEditProjectDriveTimeDays(1)
    setEditProjectDriveTimePosition('both')
    setEditProjectCrewNames([])
    setEditProjectNotes('')
    setEditProjectColor(PRESET_COLORS[0].value)
    setEditProjectShowCustomCrew(false)
    setEditProjectCustomCrewName('')
    setEditProjectError(null)
    setShowRemoveFromCalendarConfirm(false)
  }

  // ── Calendar callbacks ───────────────────────────────────────────────────

  const handleDateClick = useCallback((arg: DateClickArg) => {
    setDaySummaryDate(arg.dateStr)
  }, [])

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const evt = arg.event.extendedProps as CalendarEvent & { _isStandalone?: boolean; _isLinkedProject?: boolean; _linkedProjectId?: string; _clientName?: string; _address?: string; _estimateNumber?: string | null; _status?: string; _isDriveTime?: boolean }
      // Drive time bars are display-only — ignore clicks
      if (evt._isDriveTime) return
      // Both job-linked and standalone bars open the detail view first
      setDetailEvent(evt)
    },
    [initialProjects], // eslint-disable-line react-hooks/exhaustive-deps
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

  // ── Save (create new job) ──────────────────────────────────────────────

  async function handleCreateNewJobSave() {
    setNewJobSaving(true)
    setNewJobError(null)

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
        crew: newJobCrewNames.join(', ') || null,
        notes: newJobNotes.trim() || null,
        color: newJobColor,
        drive_time_enabled: newJobDriveTimeEnabled,
        drive_time_days: newJobDriveTimeDays,
        drive_time_position: newJobDriveTimePosition,
      })

      if (error) throw error

      setShowCreateNewJob(false)
      resetNewJobForm()
      router.refresh()
    } catch (err: unknown) {
      let msg = 'Failed to create job'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setNewJobError(msg)
    } finally {
      setNewJobSaving(false)
    }
  }

  // ── Save (edit project from calendar) ───────────────────────────────────

  async function handleEditProjectSave() {
    setEditProjectSaving(true)
    setEditProjectError(null)

    try {
      if (!editProjectName.trim()) throw new Error('Please enter a project name')
      if (!editProjectClient.trim()) throw new Error('Please enter a client name')
      if (!editProjectAddress.trim()) throw new Error('Please enter an address')
      if (!editProjectStartDate) throw new Error('Please select a start date')
      if (!editProjectEndDate) throw new Error('Please select an end date')
      if (editProjectEndDate < editProjectStartDate) throw new Error('End date must be on or after start date')

      const { error } = await supabase
        .from('projects')
        .update({
          name: editProjectName.trim(),
          client_name: editProjectClient.trim(),
          address: editProjectAddress.trim(),
          estimate_number: editProjectEstimate.trim() || null,
          status: editProjectStatus,
          start_date: editProjectStartDate,
          end_date: editProjectEndDate,
          include_weekends: editProjectIncludeWeekends,
          crew: editProjectCrewNames.join(', ') || null,
          notes: editProjectNotes.trim() || null,
          color: editProjectColor,
          drive_time_enabled: editProjectDriveTimeEnabled,
          drive_time_days: editProjectDriveTimeDays,
          drive_time_position: editProjectDriveTimePosition,
        })
        .eq('id', editProjectId)

      if (error) throw error

      setShowEditProjectModal(false)
      resetEditProjectForm()
      router.refresh()
    } catch (err: unknown) {
      let msg = 'Failed to save project'
      if (err instanceof Error) msg = err.message
      else if (typeof err === 'string') msg = err
      else if (err && typeof err === 'object' && 'message' in err) msg = String((err as { message: unknown }).message)
      setEditProjectError(msg)
    } finally {
      setEditProjectSaving(false)
    }
  }

  async function handleRemoveFromCalendar() {
    setRemovingFromCalendar(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update({ start_date: null, end_date: null, include_weekends: false })
        .eq('id', editProjectId)

      if (error) throw error

      setShowRemoveFromCalendarConfirm(false)
      setShowEditProjectModal(false)
      resetEditProjectForm()
      router.refresh()
    } catch {
      // silently fail – user can retry
    } finally {
      setRemovingFromCalendar(false)
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

      {/* ── Day Summary Modal ─────────────────────────────────────────────── */}
      {daySummaryDate && (() => {
        const clickedD = new Date(daySummaryDate + 'T12:00:00')
        const dayLabel = clickedD.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

        // Jobs active on this day (start_date <= clickedDate <= end_date)
        const activeJobs = initialProjects.filter((p) => {
          if (!p.start_date || !p.end_date) return false
          return p.start_date <= daySummaryDate && daySummaryDate <= p.end_date
        })

        // Standalone events active on this day
        const activeStandaloneEvents = initialEvents.filter((evt) => {
          return evt.start_date <= daySummaryDate && daySummaryDate <= evt.end_date
        })

        const hasItems = activeJobs.length > 0 || activeStandaloneEvents.length > 0

        return (
          <Portal>
            <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => setDaySummaryDate(null)}>
              <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
                  <h2 className="text-lg font-semibold text-gray-900">{dayLabel}</h2>
                  <button
                    onClick={() => setDaySummaryDate(null)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-4 md:p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                  {!hasItems && (
                    <p className="text-sm text-gray-500 text-center py-6">Nothing scheduled for this day</p>
                  )}

                  {activeJobs.map((job) => (
                    <div key={job.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                      <div className="w-4 h-4 rounded-sm flex-shrink-0 mt-0.5" style={{ backgroundColor: job.color || PRESET_COLORS[0].value }} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{job.name}</p>
                        {job.client_name && <p className="text-xs text-gray-500 truncate">{job.client_name}</p>}
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDisplayDate(job.start_date!)} – {formatDisplayDate(job.end_date!)}
                        </p>
                        {job.crew && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {job.crew.split(',').map((name) => name.trim()).filter(Boolean).map((name) => (
                              <span key={name} className="inline-block text-[10px] font-medium bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{name}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {activeStandaloneEvents.map((evt) => (
                    <div key={evt.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
                      <span className="text-base flex-shrink-0 mt-0.5">📅</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{evt.project_name}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDisplayDate(evt.start_date)} – {formatDisplayDate(evt.end_date)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex-none p-4 border-t border-gray-200" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
                  <button
                    onClick={() => setDaySummaryDate(null)}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </Portal>
        )
      })()}

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
                onClick={handlePickNewJob}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition group text-left"
              >
                <div className="w-11 h-11 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition">
                  <LinkIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">New Job</p>
                  <p className="text-xs text-gray-500 mt-0.5">Create a new job and add it to the calendar</p>
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

      {/* ── Create New Job Modal ────────────────────────────────────────────── */}
      {showCreateNewJob && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => { setShowCreateNewJob(false); resetNewJobForm() }}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <h2 className="text-lg font-semibold text-gray-900">New Job</h2>
              <button
                onClick={() => { setShowCreateNewJob(false); resetNewJobForm() }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
              {newJobError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                  <span>{newJobError}</span>
                  <button onClick={() => setNewJobError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

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

              {/* Drive Time */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className={labelCls + ' mb-0'}>Drive Time</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newJobDriveTimeEnabled}
                    onClick={() => setNewJobDriveTimeEnabled(!newJobDriveTimeEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${newJobDriveTimeEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${newJobDriveTimeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {newJobDriveTimeEnabled && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Days</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={newJobDriveTimeDays}
                        onChange={(e) => setNewJobDriveTimeDays(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-1">
                      {(['front', 'back', 'both'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setNewJobDriveTimePosition(pos)}
                          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                            newJobDriveTimePosition === pos
                              ? 'bg-gray-900 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {pos.charAt(0).toUpperCase() + pos.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Crew */}
              <div>
                <label className={labelCls}>Crew</label>
                <div className="flex flex-wrap gap-2">
                  {employeeProfiles.map((emp) => {
                    const isSelected = newJobCrewNames.includes(emp.name)
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => toggleNewJobCrewMember(emp.name)}
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
                  {newJobShowCustomCrew ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={newJobCustomCrewName}
                        onChange={(e) => setNewJobCustomCrewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addNewJobCustomCrewMember(); if (e.key === 'Escape') { setNewJobShowCustomCrew(false); setNewJobCustomCrewName('') } }}
                        placeholder="Name"
                        className="border border-gray-300 rounded-full px-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button type="button" onClick={addNewJobCustomCrewMember} className="text-green-600 hover:text-green-700 p-0.5">
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => { setNewJobShowCustomCrew(false); setNewJobCustomCrewName('') }} className="text-gray-400 hover:text-gray-600 p-0.5">
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNewJobShowCustomCrew(true)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                    >
                      <PlusIcon className="w-3 h-3" />
                      Employee
                    </button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  rows={3}
                  value={newJobNotes}
                  onChange={(e) => setNewJobNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className={inputCls + ' resize-none'}
                />
              </div>

              {/* Color */}
              <div>
                <label className={labelCls}>Color</label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setNewJobColor(c.value)}
                      title={c.label}
                      className={`w-8 h-8 rounded-full border-2 transition ${
                        newJobColor === c.value
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
                onClick={() => { setShowCreateNewJob(false); resetNewJobForm() }}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewJobSave}
                disabled={newJobSaving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {newJobSaving ? 'Creating...' : 'Create Job'}
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

      {/* ── Edit Project Modal (job-linked bars) ─────────────────────────── */}
      {showEditProjectModal && !showRemoveFromCalendarConfirm && (
        <Portal>
        <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => { setShowEditProjectModal(false); resetEditProjectForm() }}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <h2 className="text-lg font-semibold text-gray-900">Edit Project</h2>
              <button
                onClick={() => { setShowEditProjectModal(false); resetEditProjectForm() }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
              {editProjectError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
                  <span>{editProjectError}</span>
                  <button onClick={() => setEditProjectError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Client Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editProjectClient}
                  onChange={(e) => setEditProjectClient(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editProjectAddress}
                  onChange={(e) => setEditProjectAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Estimate #
                </label>
                <input
                  type="text"
                  value={editProjectEstimate}
                  onChange={(e) => setEditProjectEstimate(e.target.value)}
                  placeholder="e.g. EST-1042"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                <select
                  value={editProjectStatus}
                  onChange={(e) => setEditProjectStatus(e.target.value as 'Active' | 'Complete')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                >
                  <option value="Active">Active</option>
                  <option value="Complete">Complete</option>
                </select>
              </div>

              {/* Calendar Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editProjectStartDate}
                    onChange={(e) => {
                      setEditProjectStartDate(e.target.value)
                      if (editProjectEndDate && e.target.value > editProjectEndDate) setEditProjectEndDate(e.target.value)
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editProjectEndDate}
                    min={editProjectStartDate || undefined}
                    onChange={(e) => setEditProjectEndDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Include Weekends?</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editProjectIncludeWeekends}
                  onClick={() => setEditProjectIncludeWeekends(!editProjectIncludeWeekends)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${editProjectIncludeWeekends ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${editProjectIncludeWeekends ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Drive Time */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Drive Time</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editProjectDriveTimeEnabled}
                    onClick={() => setEditProjectDriveTimeEnabled(!editProjectDriveTimeEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${editProjectDriveTimeEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${editProjectDriveTimeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {editProjectDriveTimeEnabled && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Days</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={editProjectDriveTimeDays}
                        onChange={(e) => setEditProjectDriveTimeDays(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden flex-1">
                      {(['front', 'back', 'both'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setEditProjectDriveTimePosition(pos)}
                          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                            editProjectDriveTimePosition === pos
                              ? 'bg-gray-900 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {pos.charAt(0).toUpperCase() + pos.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Crew */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Crew</label>
                <div className="flex flex-wrap gap-2">
                  {employeeProfiles.map((emp) => {
                    const isSelected = editProjectCrewNames.includes(emp.name)
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => toggleEditProjectCrewMember(emp.name)}
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
                  {editProjectShowCustomCrew ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={editProjectCustomCrewName}
                        onChange={(e) => setEditProjectCustomCrewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addEditProjectCustomCrewMember(); if (e.key === 'Escape') { setEditProjectShowCustomCrew(false); setEditProjectCustomCrewName('') } }}
                        placeholder="Name"
                        className="border border-gray-300 rounded-full px-3 py-1.5 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button type="button" onClick={addEditProjectCustomCrewMember} className="text-green-600 hover:text-green-700 p-0.5">
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => { setEditProjectShowCustomCrew(false); setEditProjectCustomCrewName('') }} className="text-gray-400 hover:text-gray-600 p-0.5">
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditProjectShowCustomCrew(true)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                    >
                      <PlusIcon className="w-3 h-3" />
                      Employee
                    </button>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  value={editProjectNotes}
                  onChange={(e) => setEditProjectNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Color</label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditProjectColor(c.value)}
                      title={c.label}
                      className={`w-8 h-8 rounded-full border-2 transition ${
                        editProjectColor === c.value
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
                type="button"
                onClick={() => setShowRemoveFromCalendarConfirm(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition"
              >
                <Trash2Icon className="w-4 h-4" />
                Remove
              </button>
              <button
                type="button"
                onClick={() => { setShowEditProjectModal(false); resetEditProjectForm() }}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditProjectSave}
                disabled={editProjectSaving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {editProjectSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Remove from Calendar Confirmation ────────────────────────────────── */}
      {showRemoveFromCalendarConfirm && showEditProjectModal && (
        <Portal>
        <div className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={() => setShowRemoveFromCalendarConfirm(false)}>
          <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
              <h3 className="text-lg font-semibold text-gray-900">Remove from Calendar</h3>
              <button
                onClick={() => setShowRemoveFromCalendarConfirm(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <CalendarIcon className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm text-gray-500">
                  Remove &ldquo;{editProjectName}&rdquo; from the calendar? The job will not be deleted &mdash; only its calendar dates will be cleared.
                </p>
              </div>
            </div>
            <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
              <button
                onClick={() => setShowRemoveFromCalendarConfirm(false)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveFromCalendar}
                disabled={removingFromCalendar}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
              >
                {removingFromCalendar ? 'Removing...' : 'Remove from Calendar'}
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
              {/* Job-specific fields */}
              {detailEvent._isLinkedProject && (
                <div className="space-y-2">
                  {detailEvent._clientName && (
                    <div className="flex items-start gap-3">
                      <UsersIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Client</p>
                        <p className="text-sm text-gray-700">{detailEvent._clientName}</p>
                      </div>
                    </div>
                  )}
                  {detailEvent._address && (
                    <div className="flex items-start gap-3">
                      <CalendarIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Address</p>
                        <p className="text-sm text-gray-700">{detailEvent._address}</p>
                      </div>
                    </div>
                  )}
                  {detailEvent._estimateNumber && (
                    <div className="flex items-start gap-3">
                      <FileTextIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Estimate #</p>
                        <p className="text-sm text-gray-700">{detailEvent._estimateNumber}</p>
                      </div>
                    </div>
                  )}
                  {detailEvent._status && (
                    <div className="flex items-start gap-3">
                      <CheckIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Status</p>
                        <p className="text-sm text-gray-700">{detailEvent._status}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                  <div>
                    <p className="text-xs text-gray-500">Crew</p>
                    <p className="text-sm text-gray-700">{detailEvent.crew}</p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailEvent.notes && (
                <div className="flex items-start gap-3">
                  <FileTextIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailEvent.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
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
              {/* Job-linked bar: Edit / Close */}
              {detailEvent._isLinkedProject && detailEvent._linkedProjectId && (
                <>
                  <button
                    onClick={() => setDetailEvent(null)}
                    className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
                  >
                    Close
                  </button>
                  {canEditCalendar && (
                    <button
                      onClick={() => openEditProjectModal(detailEvent._linkedProjectId!)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg py-2.5 text-sm font-semibold transition"
                    >
                      <PencilIcon className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                </>
              )}
              {/* Fallback close (standalone without edit perms) */}
              {detailEvent._isStandalone && (!canEditCalendar || detailEvent.created_by !== userId) && (
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
