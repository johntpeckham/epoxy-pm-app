'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  CalendarIcon,
  UserIcon,
  SearchIcon,
  ArrowLeftIcon,
  CalendarCheckIcon,
  Trash2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { usePermissions } from '@/lib/usePermissions'
import NewAppointmentModal, {
  type AppointmentCompanyOption,
  type AppointmentContactOption,
  type AppointmentAssigneeOption,
} from './NewAppointmentModal'
import type { LeadCategory } from './leads/LeadsClient'
import KebabMenu from '@/components/ui/KebabMenu'
import PageTabs from './PageTabs'

type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled'
type PushedTo = 'job_walk' | 'estimating' | 'proposal' | 'job'

interface AppointmentRow {
  id: string
  company_id: string
  contact_id: string | null
  title: string | null
  date: string
  address: string | null
  project_address: string | null
  notes: string | null
  status: AppointmentStatus
  pushed_to: PushedTo | null
  pushed_ref_id: string | null
  converted_to_project_id: string | null
  // Joined via PostgREST relationship — see Lead's converted_to_project
  // for the gating semantics.
  converted_to_project?: { project_number: string | null } | null
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

const APPOINTMENT_STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const APPOINTMENT_STATUS_COLORS: Record<AppointmentStatus, { bg: string; border: string; text: string }> = {
  scheduled: { bg: 'rgba(52,211,153,0.22)', border: 'rgba(52,211,153,0.55)', text: '#34d399' },
  completed: { bg: 'rgba(96,165,250,0.22)', border: 'rgba(96,165,250,0.55)', text: '#60a5fa' },
  cancelled: { bg: 'rgba(156,163,175,0.22)', border: 'rgba(156,163,175,0.55)', text: '#9ca3af' },
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
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [companies, setCompanies] = useState<AppointmentCompanyOption[]>([])
  const [contacts, setContacts] = useState<AppointmentContactOption[]>([])
  const [assignees, setAssignees] = useState<AppointmentAssigneeOption[]>([])
  const [categories, setCategories] = useState<LeadCategory[]>([])

  const [tab, setTab] = useState<TabKey>('upcoming')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [showNewModal, setShowNewModal] = useState(false)
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState<AppointmentRow | null>(null)
  const [deletingAppt, setDeletingAppt] = useState(false)
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
    // Join the converted-to project so the Completed-tab badge can show
    // "→ Project #XXXX" without a second roundtrip. See the leads route
    // for the same pattern + reasoning.
    const apptQuery = supabase
      .from('crm_appointments')
      .select(
        '*, converted_to_project:estimating_projects!converted_to_project_id(project_number)'
      )
      .order('date', { ascending: false })
    if (!isAdmin) apptQuery.eq('assigned_to', userId)
    const [
      { data: apptData },
      { data: compData },
      { data: contactData },
      { data: profileData },
      { data: catData, error: catErr },
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
      supabase
        .from('lead_categories')
        .select('*')
        .order('name', { ascending: true }),
    ])
    if (catErr) {
      console.error('[AppointmentsClient] Load lead_categories failed:', {
        code: catErr.code,
        message: catErr.message,
        hint: catErr.hint,
        details: catErr.details,
      })
    }
    setAppointments((apptData ?? []) as AppointmentRow[])
    setCompanies((compData ?? []) as AppointmentCompanyOption[])
    setContacts((contactData ?? []) as AppointmentContactOption[])
    setAssignees(
      ((profileData ?? []) as { id: string; display_name: string | null }[]).map((p) => ({
        id: p.id,
        display_name: p.display_name,
      }))
    )
    setCategories((catData ?? []) as LeadCategory[])
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

  // ─── Status update ─────────────────────────────────────────────────────
  const setApptStatus = useCallback(async (appt: AppointmentRow, next: AppointmentStatus) => {
    if (next === appt.status) return
    setAppointments((prev) => prev.map((a) => (a.id === appt.id ? { ...a, status: next } : a)))
    const { error } = await supabase
      .from('crm_appointments')
      .update({ status: next })
      .eq('id', appt.id)
    if (error) {
      console.error('[APPOINTMENT STATUS UPDATE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      setAppointments((prev) => prev.map((a) => (a.id === appt.id ? { ...a, status: appt.status } : a)))
      showToast(`Status update failed: ${error.message}`)
    }
  }, [supabase])

  // ─── Delete ────────────────────────────────────────────────────────────
  const handleDeleteAppt = useCallback(async () => {
    if (!confirmDeleteAppt) return
    setDeletingAppt(true)
    const { error } = await supabase
      .from('crm_appointments')
      .delete()
      .eq('id', confirmDeleteAppt.id)
    setDeletingAppt(false)
    if (error) {
      console.error('[APPOINTMENT DELETE ERROR]', {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      })
      showToast(`Delete failed: ${error.message}`)
      setConfirmDeleteAppt(null)
      return
    }
    setAppointments((prev) => prev.filter((a) => a.id !== confirmDeleteAppt.id))
    setConfirmDeleteAppt(null)
  }, [confirmDeleteAppt, supabase])

  // ─── Render ────────────────────────────────────────────────────────────

  function openDetailPage(appt: AppointmentRow) {
    router.push(`/sales/appointments/${appt.id}`)
  }

  function renderCard(appt: AppointmentRow) {
    const company = companyMap.get(appt.company_id)
    const contact = appt.contact_id ? contactMap.get(appt.contact_id) : null
    const isDimmed = appt.status === 'completed' || appt.status === 'cancelled'
    const colors = APPOINTMENT_STATUS_COLORS[appt.status]

    return (
      <div
        key={appt.id}
        onClick={() => openDetailPage(appt)}
        className={`bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all ${
          isDimmed ? 'opacity-70' : ''
        }`}
      >
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-[17px] font-medium text-gray-900 dark:text-white truncate block">
                {company?.name ?? 'Unknown company'}
              </span>
              <div className="mt-2 flex items-center gap-4 text-[13px] text-gray-500 dark:text-gray-400 flex-wrap">
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
                {appt.pushed_to && (
                  <span className="text-xs text-gray-400">
                    {PUSHED_TO_LABELS[appt.pushed_to]}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              {appt.converted_to_project_id && appt.converted_to_project && (
                <Link
                  href={`/estimating?customer=${appt.company_id}&project=${appt.converted_to_project_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5 transition"
                  title="View linked project"
                >
                  → Project #{appt.converted_to_project.project_number ?? '…'}
                </Link>
              )}
              <select
                value={appt.status}
                onChange={(e) => {
                  e.stopPropagation()
                  setApptStatus(appt, e.target.value as AppointmentStatus)
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                  color: colors.text,
                }}
                className="text-[12px] font-medium border rounded-md px-2 py-1 max-w-[175px] cursor-pointer outline-none"
              >
                {APPOINTMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <KebabMenu
                variant="light"
                items={[
                  {
                    label: 'Delete',
                    icon: <Trash2Icon className="w-4 h-4" />,
                    destructive: true,
                    onSelect: () => setConfirmDeleteAppt(appt),
                  },
                ]}
              />
            </div>
          </div>
        </div>
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
      <PageTabs<TabKey>
        tabs={[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'completed', label: 'Completed' },
          { key: 'all', label: 'All' },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

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

      {/* New appointment modal */}
      {showNewModal && (
        <NewAppointmentModal
          userId={userId}
          isAdmin={isAdmin}
          companies={companies}
          contacts={contacts}
          assignees={assignees}
          categories={categories}
          onClose={() => setShowNewModal(false)}
          onSaved={(createdId) => {
            setShowNewModal(false)
            router.push(`/sales/appointments/${createdId}`)
          }}
          onCompanyCreated={(company) => {
            setCompanies((prev) => [...prev, company].sort((a, b) => a.name.localeCompare(b.name)))
          }}
        />
      )}

      {/* Delete appointment confirmation */}
      {confirmDeleteAppt && (
        <ConfirmDialog
          title="Delete this appointment?"
          message="This will permanently remove this appointment. This cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          loading={deletingAppt}
          onConfirm={handleDeleteAppt}
          onCancel={() => (deletingAppt ? null : setConfirmDeleteAppt(null))}
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
