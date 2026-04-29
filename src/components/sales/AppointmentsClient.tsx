'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  PlusIcon,
  CalendarIcon,
  UserIcon,
  MapPinIcon,
  PhoneIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  ArrowLeftIcon,
  CalendarCheckIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { assignNextProjectNumber } from '@/lib/nextProjectNumber'
import type { UserRole } from '@/types'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { usePermissions } from '@/lib/usePermissions'
import NewAppointmentModal, {
  type AppointmentCompanyOption,
  type AppointmentContactOption,
  type AppointmentAssigneeOption,
  type AppointmentDraft,
} from './NewAppointmentModal'

type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled'
type PushedTo = 'job_walk' | 'estimating' | 'proposal' | 'job'

interface AppointmentRow {
  id: string
  company_id: string
  contact_id: string | null
  title: string | null
  date: string
  address: string | null
  notes: string | null
  status: AppointmentStatus
  pushed_to: PushedTo | null
  pushed_ref_id: string | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
}

interface AppointmentsClientProps {
  userId: string
  userRole: UserRole
}

type TabKey = 'upcoming' | 'completed' | 'all'

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_TEXT_COLOR: Record<AppointmentStatus, string> = {
  scheduled: 'text-emerald-700',
  completed: 'text-blue-700',
  cancelled: 'text-gray-400',
}

const PUSHED_TO_LABELS: Record<PushedTo, string> = {
  job_walk: 'Pushed to job walk',
  estimating: 'Pushed to estimating',
  proposal: 'Pushed to proposal',
  job: 'Pushed to job',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${date} · ${time}`
}

function isTodayOrFuture(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return d.getTime() >= now.getTime()
}

export default function AppointmentsClient({ userId, userRole }: AppointmentsClientProps) {
  // The "all vs. mine" appointments view was admin-only. Using
  // user_management as an admin-only proxy matches the default template.
  const { canEdit } = usePermissions()
  const isAdmin = canEdit('user_management')
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [companies, setCompanies] = useState<AppointmentCompanyOption[]>([])
  const [contacts, setContacts] = useState<AppointmentContactOption[]>([])
  const [assignees, setAssignees] = useState<AppointmentAssigneeOption[]>([])

  const [tab, setTab] = useState<TabKey>('upcoming')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editDraft, setEditDraft] = useState<AppointmentDraft | null>(null)
  const [openPushMenuFor, setOpenPushMenuFor] = useState<string | null>(null)
  const [pushTargetAppt, setPushTargetAppt] = useState<AppointmentRow | null>(null)
  const [pushEstimatingAppt, setPushEstimatingAppt] = useState<AppointmentRow | null>(null)
  const [pushing, setPushing] = useState(false)
  const [toast, setToast] = useState<{
    message: string
    href?: string | null
  } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(message: string, href?: string | null) {
    setToast({ message, href: href ?? null })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const apptQuery = supabase.from('crm_appointments').select('*').order('date', { ascending: false })
    if (!isAdmin) apptQuery.eq('assigned_to', userId)
    const [
      { data: apptData },
      { data: compData },
      { data: contactData },
      { data: profileData },
    ] = await Promise.all([
      apptQuery,
      supabase
        .from('companies')
        .select('id, name, city, state')
        .eq('archived', false)
        .order('name', { ascending: true }),
      supabase
        .from('contacts')
        .select('id, company_id, first_name, last_name, phone, email, is_primary')
        .order('last_name', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, display_name, role')
        .in('role', ['admin', 'office_manager', 'salesman'])
        .order('display_name', { ascending: true }),
    ])
    setAppointments((apptData ?? []) as AppointmentRow[])
    setCompanies((compData ?? []) as AppointmentCompanyOption[])
    setContacts((contactData ?? []) as AppointmentContactOption[])
    setAssignees(
      ((profileData ?? []) as { id: string; display_name: string | null }[]).map((p) => ({
        id: p.id,
        display_name: p.display_name,
      }))
    )
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const companyMap = useMemo(() => {
    const m = new Map<string, AppointmentCompanyOption>()
    for (const c of companies) m.set(c.id, c)
    return m
  }, [companies])

  const contactMap = useMemo(() => {
    const m = new Map<string, AppointmentContactOption>()
    for (const c of contacts) m.set(c.id, c)
    return m
  }, [contacts])

  const assigneeMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of assignees) m.set(a.id, a.display_name || a.id.slice(0, 8))
    return m
  }, [assignees])

  // Filter + sort appointments per tab + search
  const visibleAppointments = useMemo(() => {
    let list = appointments
    if (tab === 'upcoming') {
      list = list.filter(
        (a) => a.status === 'scheduled' && isTodayOrFuture(a.date)
      )
      list = [...list].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
    } else if (tab === 'completed') {
      list = list.filter((a) => a.status === 'completed')
      list = [...list].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    } else {
      list = [...list].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    }

    if (debouncedSearch) {
      list = list.filter((a) => {
        const comp = companyMap.get(a.company_id)
        const contact = a.contact_id ? contactMap.get(a.contact_id) : null
        const haystack = [
          comp?.name ?? '',
          contact ? `${contact.first_name} ${contact.last_name}` : '',
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(debouncedSearch)
      })
    }

    return list
  }, [appointments, tab, debouncedSearch, companyMap, contactMap])

  const myAppointments = useMemo(
    () => (isAdmin ? visibleAppointments.filter((a) => a.assigned_to === userId) : visibleAppointments),
    [isAdmin, visibleAppointments, userId]
  )

  const otherUserSections = useMemo(() => {
    if (!isAdmin) return []
    const others = visibleAppointments.filter((a) => a.assigned_to !== userId)
    const grouped = new Map<string, AppointmentRow[]>()
    for (const a of others) {
      const key = a.assigned_to ?? '__unassigned__'
      const arr = grouped.get(key) ?? []
      arr.push(a)
      grouped.set(key, arr)
    }
    return Array.from(grouped.entries())
      .map(([uid, items]) => ({
        userId: uid,
        name: uid === '__unassigned__' ? 'Unassigned' : (assigneeMap.get(uid) ?? uid.slice(0, 8)),
        appointments: items,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [isAdmin, visibleAppointments, userId, assigneeMap])

  // ─── Push-to-job-walk ──────────────────────────────────────────────────
  async function handlePushToJobWalk(appt: AppointmentRow) {
    setPushing(true)
    const company = companyMap.get(appt.company_id)
    if (!company) {
      setPushing(false)
      showToast('Company not found.')
      return
    }
    const contact = appt.contact_id ? contactMap.get(appt.contact_id) : null

    // Step 1: the company itself is the customer in the unified table
    const customerId = company.id

    // Step 2: create a job walk
    const { data: newWalk, error: walkErr } = await supabase
      .from('job_walks')
      .insert({
        project_name: company.name,
        company_id: customerId,
        customer_name: contact
          ? `${contact.first_name} ${contact.last_name}`.trim()
          : company.name,
        customer_email: contact?.email ?? null,
        customer_phone: contact?.phone ?? null,
        address: appt.address ?? null,
        date: appt.date ? appt.date.slice(0, 10) : null,
        notes: appt.notes ?? null,
        status: 'in_progress',
        assigned_to: appt.assigned_to ?? userId,
        created_by: userId,
      })
      .select('id')
      .single()
    if (walkErr || !newWalk) {
      setPushing(false)
      setPushTargetAppt(null)
      showToast(`Job walk create failed: ${walkErr?.message ?? 'unknown error'}`)
      return
    }
    const walkId = (newWalk as { id: string }).id

    // Step 3: update the appointment
    const { error: updErr } = await supabase
      .from('crm_appointments')
      .update({
        status: 'completed',
        pushed_to: 'job_walk',
        pushed_ref_id: walkId,
      })
      .eq('id', appt.id)
    setPushing(false)
    setPushTargetAppt(null)
    if (updErr) {
      showToast(`Appointment update failed: ${updErr.message}`)
      return
    }
    // Update local state
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === appt.id
          ? {
              ...a,
              status: 'completed',
              pushed_to: 'job_walk',
              pushed_ref_id: walkId,
            }
          : a
      )
    )
    showToast('Job walk created.', `/job-walk?walk=${walkId}`)
  }

  // ─── Push-to-estimating ────────────────────────────────────────────────
  async function handlePushToEstimating(appt: AppointmentRow) {
    setPushing(true)
    const company = companyMap.get(appt.company_id)
    if (!company) {
      setPushing(false)
      showToast('Company not found.')
      return
    }
    const contact = appt.contact_id ? contactMap.get(appt.contact_id) : null

    // Step 1: the company itself is the customer in the unified table
    const customerId = company.id

    // Step 2: create an estimating project
    const projectNumber = await assignNextProjectNumber(supabase, userId)
    const { data: newProject, error: projErr } = await supabase
      .from('estimating_projects')
      .insert({
        company_id: customerId,
        name: appt.title || company.name,
        description: appt.notes,
        status: 'active',
        source: 'appointment',
        source_ref_id: appt.id,
        project_number: projectNumber,
        created_by: userId,
      })
      .select('id')
      .single()
    if (projErr || !newProject) {
      setPushing(false)
      setPushEstimatingAppt(null)
      showToast(`Project create failed: ${projErr?.message ?? 'unknown error'}`)
      return
    }
    const projectId = (newProject as { id: string }).id

    // Step 3: update the appointment
    const { error: updErr } = await supabase
      .from('crm_appointments')
      .update({
        status: 'completed',
        pushed_to: 'estimating',
        pushed_ref_id: projectId,
      })
      .eq('id', appt.id)
    setPushing(false)
    setPushEstimatingAppt(null)
    if (updErr) {
      showToast(`Appointment update failed: ${updErr.message}`)
      return
    }
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === appt.id
          ? {
              ...a,
              status: 'completed',
              pushed_to: 'estimating',
              pushed_ref_id: projectId,
            }
          : a
      )
    )
    showToast(
      'Estimating project created.',
      `/estimating?customer=${customerId}&project=${projectId}`
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id)
  }

  function renderCard(appt: AppointmentRow) {
    const isExpanded = expandedId === appt.id
    const company = companyMap.get(appt.company_id)
    const contact = appt.contact_id ? contactMap.get(appt.contact_id) : null
    const isDimmed = appt.status === 'completed'

    return (
      <div
        key={appt.id}
        className={`bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl transition-opacity ${
          isDimmed ? 'opacity-70' : ''
        }`}
      >
        {/* Collapsed summary */}
        <div
          onClick={() => toggleExpand(appt.id)}
          className="w-full text-left px-6 py-5 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/sales/crm/${appt.company_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[15px] font-medium text-gray-900 hover:text-amber-600"
                >
                  {company?.name ?? 'Unknown company'}
                </Link>
                <span className={`text-xs ${STATUS_TEXT_COLOR[appt.status]}`}>
                  {STATUS_LABELS[appt.status]}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-4 text-[13px] text-gray-500 flex-wrap">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="w-4 h-4 text-gray-400" />
                  {formatDateTime(appt.date)}
                </span>
                {contact && (
                  <span className="inline-flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4 text-gray-400" />
                    {contact.first_name} {contact.last_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0 mt-0.5">
              {appt.pushed_to && (
                appt.pushed_to === 'job_walk' && appt.pushed_ref_id ? (
                  <Link
                    href={`/job-walk?walk=${appt.pushed_ref_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-gray-400 hover:text-amber-600"
                  >
                    {PUSHED_TO_LABELS[appt.pushed_to]} →
                  </Link>
                ) : appt.pushed_to === 'estimating' && appt.pushed_ref_id ? (
                  <Link
                    href={`/estimating?project=${appt.pushed_ref_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-gray-400 hover:text-amber-600"
                  >
                    {PUSHED_TO_LABELS[appt.pushed_to]} →
                  </Link>
                ) : (
                  <span className="text-xs text-gray-400">
                    {PUSHED_TO_LABELS[appt.pushed_to]}
                  </span>
                )
              )}
              <span className="inline-flex items-center gap-1 text-[13px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors select-none">
                {isExpanded ? 'Close' : 'View'}
                {isExpanded ? (
                  <ChevronUpIcon className="w-4 h-4" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4" />
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-gray-100 dark:border-[#2a2a2a]">
            <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 dark:bg-[#1e1e1e] flex-wrap">
              {appt.status === 'scheduled' && !appt.pushed_to && (
                <div className="relative">
                  <button
                    onClick={() =>
                      setOpenPushMenuFor(openPushMenuFor === appt.id ? null : appt.id)
                    }
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
                  >
                    Push to…
                    <ChevronDownIcon className="w-4 h-4" />
                  </button>
                  {openPushMenuFor === appt.id && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setOpenPushMenuFor(null)}
                      />
                      <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]">
                        <button
                          onClick={() => { setOpenPushMenuFor(null); setPushTargetAppt(appt) }}
                          className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Push to job walk
                        </button>
                        <button
                          onClick={() => { setOpenPushMenuFor(null); setPushEstimatingAppt(appt) }}
                          className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Push to estimating
                        </button>
                        <button
                          onClick={() => { setOpenPushMenuFor(null); showToast('Coming soon') }}
                          className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                        >
                          Push to proposal
                        </button>
                        <button
                          onClick={() => { setOpenPushMenuFor(null); showToast('Coming soon') }}
                          className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                        >
                          Push to job
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="flex-1" />
              <button
                onClick={() =>
                  setEditDraft({
                    id: appt.id,
                    company_id: appt.company_id,
                    contact_id: appt.contact_id,
                    date: appt.date,
                    address: appt.address,
                    notes: appt.notes,
                    assigned_to: appt.assigned_to,
                    status: appt.status,
                  })
                }
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
              >
                Edit
              </button>
            </div>

            <div className="px-6 py-4 space-y-2">
              {(appt.address || contact?.phone) && (
                <div className="flex items-center gap-4 text-[13px] text-gray-500 flex-wrap">
                  {appt.address && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPinIcon className="w-4 h-4 text-gray-400" />
                      {appt.address}
                    </span>
                  )}
                  {contact?.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="inline-flex items-center gap-1.5 hover:text-amber-600"
                    >
                      <PhoneIcon className="w-4 h-4 text-gray-400" />
                      {contact.phone}
                    </a>
                  )}
                </div>
              )}
              {appt.notes && (
                <p
                  className="text-[12px] text-gray-400 whitespace-pre-wrap"
                  style={{ lineHeight: 1.6 }}
                >
                  {appt.notes}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/sales" className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
          <CalendarCheckIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight truncate">
            Appointments
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-[200px] pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New appointment
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-400 px-4 sm:px-6 pt-3">
        Schedule visits and push them through the pipeline.
      </p>

      {/* Tabs */}
      <div className="px-4 sm:px-6 border-b border-gray-200 flex items-center gap-6">
        {(['upcoming', 'completed', 'all'] as TabKey[]).map((t) => {
          const isActive = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px py-2 text-sm transition-colors ${
                isActive
                  ? 'text-amber-500 border-b-[1.5px] border-amber-500 font-medium'
                  : 'text-gray-400 hover:text-gray-600 border-b-[1.5px] border-transparent'
              }`}
            >
              {t === 'upcoming' ? 'Upcoming' : t === 'completed' ? 'Completed' : 'All'}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="px-7 py-6">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : visibleAppointments.length === 0 ? (
          <div className="text-center py-14">
            <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {tab === 'upcoming'
                ? 'No upcoming appointments.'
                : tab === 'completed'
                ? 'No completed appointments.'
                : 'No appointments yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {myAppointments.map((appt) => renderCard(appt))}

            {/* Admin: other users' sections */}
            {isAdmin && otherUserSections.length > 0 && (
              <>
                <div className="pt-4 pb-2">
                  <div className="border-t border-gray-200 dark:border-[#2a2a2a]" />
                </div>
                {otherUserSections.map((section) => (
                  <div key={section.userId}>
                    <div className="flex items-baseline gap-2 pb-2 pt-1">
                      <span className="text-[16px] font-medium text-gray-900 dark:text-white">
                        {section.name}
                      </span>
                      <span className="text-[13px] text-gray-400">
                        ({section.appointments.length})
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.appointments.map((appt) => renderCard(appt))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* New / edit modal */}
      {(showNewModal || editDraft) && (
        <NewAppointmentModal
          userId={userId}
          isAdmin={isAdmin}
          existing={editDraft ?? undefined}
          companies={companies}
          contacts={contacts}
          assignees={assignees}
          onClose={() => {
            setShowNewModal(false)
            setEditDraft(null)
          }}
          onSaved={() => {
            setShowNewModal(false)
            setEditDraft(null)
            fetchAll()
          }}
          onDeleted={() => {
            setShowNewModal(false)
            setEditDraft(null)
            fetchAll()
          }}
          onCompanyCreated={(company) => {
            setCompanies((prev) => [...prev, company].sort((a, b) => a.name.localeCompare(b.name)))
          }}
        />
      )}

      {/* Push-to-job-walk confirmation */}
      {pushTargetAppt && (
        <ConfirmDialog
          title="Push to job walk?"
          message="This will create a new job walk with the appointment details. Continue?"
          confirmLabel="Create job walk"
          onConfirm={() => handlePushToJobWalk(pushTargetAppt)}
          onCancel={() => setPushTargetAppt(null)}
          loading={pushing}
          variant="default"
        />
      )}

      {/* Push-to-estimating confirmation */}
      {pushEstimatingAppt && (
        <ConfirmDialog
          title="Push to estimating?"
          message="This will create a new estimating project for this customer. Continue?"
          confirmLabel="Create project"
          onConfirm={() => handlePushToEstimating(pushEstimatingAppt)}
          onCancel={() => setPushEstimatingAppt(null)}
          loading={pushing}
          variant="default"
        />
      )}

      {/* Toast */}
      {toast && (
        <Portal>
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg flex items-center gap-3">
            <span>{toast.message}</span>
            {toast.href && (
              <Link
                href={toast.href}
                className="text-amber-300 hover:text-amber-100 underline"
              >
                View
              </Link>
            )}
          </div>
        </Portal>
      )}
    </div>
  )
}
