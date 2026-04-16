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
  SearchIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import NewAppointmentModal, {
  type AppointmentCompanyOption,
  type AppointmentContactOption,
  type AppointmentAssigneeOption,
  type AppointmentDraft,
} from './NewAppointmentModal'

type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled'
type PushedTo = 'job_walk' | 'estimating' | 'estimate' | 'job'

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
  estimate: 'Pushed to estimate',
  job: 'Pushed to job',
}

// Pipeline stages in order
type StageKey = 'crm' | 'customer' | 'job_walk' | 'estimating' | 'estimate' | 'job'
const STAGE_ORDER: StageKey[] = [
  'crm',
  'customer',
  'job_walk',
  'estimating',
  'estimate',
  'job',
]
const STAGE_LABELS: Record<StageKey, string> = {
  crm: 'CRM',
  customer: 'Customer',
  job_walk: 'Job walk',
  estimating: 'Estimating',
  estimate: 'Estimate',
  job: 'Job',
}

function stageIndex(pushedTo: PushedTo | null): number {
  // CRM is always completed (stage 0). Push targets determine further progress.
  if (!pushedTo) return 0
  const map: Record<PushedTo, number> = {
    job_walk: 2,
    estimating: 3,
    estimate: 4,
    job: 5,
  }
  return map[pushedTo]
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

export default function AppointmentsClient({ userId }: AppointmentsClientProps) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [companies, setCompanies] = useState<AppointmentCompanyOption[]>([])
  const [contacts, setContacts] = useState<AppointmentContactOption[]>([])
  const [assignees, setAssignees] = useState<AppointmentAssigneeOption[]>([])

  const [tab, setTab] = useState<TabKey>('upcoming')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [showNewModal, setShowNewModal] = useState(false)
  const [editDraft, setEditDraft] = useState<AppointmentDraft | null>(null)
  const [openPushMenuFor, setOpenPushMenuFor] = useState<string | null>(null)
  const [pushTargetAppt, setPushTargetAppt] = useState<AppointmentRow | null>(null)
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
    const [
      { data: apptData },
      { data: compData },
      { data: contactData },
      { data: profileData },
    ] = await Promise.all([
      supabase.from('crm_appointments').select('*').order('date', { ascending: false }),
      supabase
        .from('crm_companies')
        .select('id, name, city, state')
        .order('name', { ascending: true }),
      supabase
        .from('crm_contacts')
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

    // Step 1: find-or-create customer for this company
    let customerId: string | null = null
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('company', company.name)
      .limit(1)
      .maybeSingle()
    if (existingCustomer) {
      customerId = (existingCustomer as { id: string }).id
    } else {
      const contactName = contact
        ? `${contact.first_name} ${contact.last_name}`.trim()
        : company.name
      // Look up a primary address for the company
      const { data: addrRows } = await supabase
        .from('crm_company_addresses')
        .select('address, city, state, zip, is_primary')
        .eq('company_id', company.id)
        .order('is_primary', { ascending: false })
        .limit(1)
      const addr = (addrRows ?? [])[0] as
        | {
            address: string
            city: string | null
            state: string | null
            zip: string | null
          }
        | undefined
      const { data: newCustomer, error: custErr } = await supabase
        .from('customers')
        .insert({
          name: contactName || company.name,
          company: company.name,
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
          address: addr?.address ?? null,
          city: addr?.city ?? company.city ?? null,
          state: addr?.state ?? company.state ?? null,
          zip: addr?.zip ?? null,
          user_id: userId,
        })
        .select('id')
        .single()
      if (custErr || !newCustomer) {
        setPushing(false)
        setPushTargetAppt(null)
        showToast(`Customer create failed: ${custErr?.message ?? 'unknown error'}`)
        return
      }
      customerId = (newCustomer as { id: string }).id
    }

    // Step 2: create a job walk
    const { data: newWalk, error: walkErr } = await supabase
      .from('job_walks')
      .insert({
        project_name: company.name,
        customer_id: customerId,
        customer_name: contact
          ? `${contact.first_name} ${contact.last_name}`.trim()
          : company.name,
        customer_email: contact?.email ?? null,
        customer_phone: contact?.phone ?? null,
        address: appt.address ?? null,
        date: appt.date ? appt.date.slice(0, 10) : null,
        notes: appt.notes ?? null,
        status: 'in_progress',
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

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* Header */}
      <div className="px-7 pt-8 pb-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-medium text-gray-900 leading-tight">
            Appointments
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Schedule visits and push them through the pipeline.
          </p>
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

      {/* Tabs */}
      <div className="px-7 border-b border-gray-200 flex items-center gap-6">
        {(['upcoming', 'completed', 'all'] as TabKey[]).map((t) => {
          const isActive = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px py-2 text-sm transition-colors ${
                isActive
                  ? 'text-gray-900 border-b-[1.5px] border-gray-900'
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
            {visibleAppointments.map((appt) => {
              const company = companyMap.get(appt.company_id)
              const contact = appt.contact_id ? contactMap.get(appt.contact_id) : null
              const currentStage = stageIndex(appt.pushed_to)
              const isDimmed = appt.status === 'completed'
              return (
                <div
                  key={appt.id}
                  className={`border border-gray-200 rounded-xl px-6 py-5 transition-opacity ${
                    isDimmed ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* Left side */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/sales/crm/${appt.company_id}`}
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
                          <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                          {formatDateTime(appt.date)}
                        </span>
                        {contact && (
                          <span className="inline-flex items-center gap-1.5">
                            <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                            {contact.first_name} {contact.last_name}
                          </span>
                        )}
                      </div>
                      {(appt.address || contact?.phone) && (
                        <div className="mt-1 flex items-center gap-4 text-[13px] text-gray-500 flex-wrap">
                          {appt.address && (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPinIcon className="w-3.5 h-3.5 text-gray-400" />
                              {appt.address}
                            </span>
                          )}
                          {contact?.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                              className="inline-flex items-center gap-1.5 hover:text-amber-600"
                            >
                              <PhoneIcon className="w-3.5 h-3.5 text-gray-400" />
                              {contact.phone}
                            </a>
                          )}
                        </div>
                      )}
                      {appt.notes && (
                        <p
                          className="mt-2 text-[12px] text-gray-400 whitespace-pre-wrap"
                          style={{ lineHeight: 1.6 }}
                        >
                          {appt.notes}
                        </p>
                      )}
                    </div>

                    {/* Right side: push button or pushed label */}
                    <div className="flex flex-col items-end gap-1">
                      {appt.status === 'scheduled' && !appt.pushed_to ? (
                        <div className="relative">
                          <button
                            onClick={() =>
                              setOpenPushMenuFor(
                                openPushMenuFor === appt.id ? null : appt.id
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
                          >
                            Push to…
                            <ChevronDownIcon className="w-3.5 h-3.5" />
                          </button>
                          {openPushMenuFor === appt.id && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => setOpenPushMenuFor(null)}
                              />
                              <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]">
                                <button
                                  onClick={() => {
                                    setOpenPushMenuFor(null)
                                    setPushTargetAppt(appt)
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  Push to job walk
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenPushMenuFor(null)
                                    showToast('Coming soon')
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                                >
                                  Push to estimating
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenPushMenuFor(null)
                                    showToast('Coming soon')
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                                >
                                  Push to estimate
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenPushMenuFor(null)
                                    showToast('Coming soon')
                                  }}
                                  className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                                >
                                  Push to job
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : appt.pushed_to ? (
                        appt.pushed_to === 'job_walk' && appt.pushed_ref_id ? (
                          <Link
                            href={`/job-walk?walk=${appt.pushed_ref_id}`}
                            className="text-xs text-gray-400 hover:text-amber-600"
                          >
                            {PUSHED_TO_LABELS[appt.pushed_to]} →
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {PUSHED_TO_LABELS[appt.pushed_to]}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">
                          {STATUS_LABELS[appt.status]}
                        </span>
                      )}
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
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Pipeline tracker */}
                  <div className="mt-4 pt-[14px] border-t border-gray-100">
                    <div className="text-[11px] text-gray-400 mb-2">
                      Pipeline progress
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {STAGE_ORDER.map((stage, i) => {
                        const isCompleted = i < currentStage
                        const isCurrent = i === currentStage
                        const stageClass = isCompleted
                          ? 'bg-amber-50 text-amber-700 border border-amber-50'
                          : isCurrent
                          ? 'border border-dashed border-amber-400 text-amber-700 bg-white'
                          : 'bg-gray-50 text-gray-400 border border-gray-50'
                        return (
                          <span key={stage} className="inline-flex items-center gap-1.5">
                            <span
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-full ${stageClass}`}
                            >
                              {STAGE_LABELS[stage]}
                            </span>
                            {i < STAGE_ORDER.length - 1 && (
                              <span className="text-gray-300 text-[11px]">→</span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New / edit modal */}
      {(showNewModal || editDraft) && (
        <NewAppointmentModal
          userId={userId}
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
