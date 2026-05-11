'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  FootprintsIcon,
  ChevronRightIcon,
  Trash2Icon,
  ArrowLeftIcon,
  MapPinIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
  UserIcon,
  PencilIcon,
} from 'lucide-react'
import Link from 'next/link'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import KebabMenu from '@/components/ui/KebabMenu'
import NewJobWalkModal from './NewJobWalkModal'
import JobWalkEditInfoModal from './JobWalkEditInfoModal'
import PageTabs from '@/components/sales/PageTabs'
import { usePermissions } from '@/lib/usePermissions'
import { softDeleteJobWalk } from '@/lib/trashBin'

export type JobWalkStatus = 'upcoming' | 'completed' | 'sent_to_estimating'
export type JobWalkPushedTo = 'estimating' | 'proposal' | 'job'

export interface JobWalk {
  id: string
  project_name: string
  company_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  project_address: string | null
  date: string | null
  status: JobWalkStatus
  notes: string | null
  project_details: string | null
  lead_source: string | null
  lead_category_id: string | null
  measurements: string | null
  pushed_to: JobWalkPushedTo | null
  pushed_ref_id: string | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface JobWalkClientProps {
  initialJobWalks: JobWalk[]
  initialEmployeeWalks?: JobWalk[]
  userId: string
}

export const JOB_WALK_STATUS_OPTIONS: { value: JobWalkStatus; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'sent_to_estimating', label: 'Sent to Estimating' },
  { value: 'completed', label: 'Completed' },
]

export const JOB_WALK_STATUS_COLORS: Record<JobWalkStatus, { bg: string; border: string; text: string }> = {
  upcoming: { bg: 'rgba(251,191,36,0.22)', border: 'rgba(251,191,36,0.55)', text: '#fbbf24' },
  sent_to_estimating: { bg: 'rgba(96,165,250,0.22)', border: 'rgba(96,165,250,0.55)', text: '#60a5fa' },
  completed: { bg: 'rgba(52,211,153,0.22)', border: 'rgba(52,211,153,0.55)', text: '#34d399' },
}

export const STATUS_STYLES: Record<JobWalkStatus, { label: string; className: string }> = {
  upcoming: { label: 'Upcoming', className: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-700' },
  sent_to_estimating: { label: 'Sent to Estimating', className: 'bg-gray-100 text-gray-600' },
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function JobWalkClient({ initialJobWalks, initialEmployeeWalks = [], userId }: JobWalkClientProps) {
  const { canEdit } = usePermissions()
  const isAdmin = canEdit('user_management')
  const router = useRouter()
  const [jobWalks, setJobWalks] = useState<JobWalk[]>(initialJobWalks)
  const [employeeWalks, setEmployeeWalks] = useState<JobWalk[]>(initialEmployeeWalks)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [assignees, setAssignees] = useState<AppointmentAssigneeOption[]>([])
  const [categories, setCategories] = useState<LeadCategory[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingWalk, setEditingWalk] = useState<JobWalk | null>(null)
  const [confirmDeleteWalk, setConfirmDeleteWalk] = useState<JobWalk | null>(null)
  const [deletingWalk, setDeletingWalk] = useState(false)
  const [deleteToast, setDeleteToast] = useState<string | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'completed'>('upcoming')
  const [employeeExpanded, setEmployeeExpanded] = useState(false)
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchCustomersAndAssignees() {
      const supabase = createClient()
      const [{ data: custData }, { data: profData }, { data: permsData }, { data: catData }] = await Promise.all([
        supabase
          .from('companies')
          .select('*')
          .eq('archived', false)
          .order('name', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, display_name, role')
          .order('display_name', { ascending: true }),
        supabase
          .from('user_permissions')
          .select('user_id')
          .eq('feature', 'job_walk')
          .eq('access_level', 'full'),
        supabase
          .from('lead_categories')
          .select('*')
          .order('name', { ascending: true }),
      ])
      if (custData) setCustomers(custData as Customer[])
      if (catData) setCategories(catData as LeadCategory[])
      const jobWalkEditIds = new Set(
        ((permsData ?? []) as { user_id: string }[]).map((p) => p.user_id)
      )
      setAssignees(
        ((profData ?? []) as { id: string; display_name: string | null; role: string }[])
          .filter((p) => p.role === 'admin' || jobWalkEditIds.has(p.id))
          .map((p) => ({ id: p.id, display_name: p.display_name }))
      )
    }
    fetchCustomersAndAssignees()
  }, [userId])

  const handleCreateFromModal = useCallback((walk: JobWalk, newCustomer?: import('@/components/proposals/types').Customer | null) => {
    if (walk.assigned_to === userId) {
      setJobWalks((prev) => [walk, ...prev])
    } else {
      setEmployeeWalks((prev) => [walk, ...prev])
    }
    if (newCustomer) {
      setCustomers((prev) => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setShowCreateModal(false)
    router.push(`/job-walk/${walk.id}`)
  }, [router, userId])

  const handleUpdate = useCallback((id: string, patch: Partial<JobWalk>) => {
    setJobWalks((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)))
    setEmployeeWalks((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  }, [])

  const setWalkStatus = useCallback(async (walk: JobWalk, next: JobWalkStatus) => {
    if (next === walk.status) return
    setJobWalks((prev) => prev.map((w) => (w.id === walk.id ? { ...w, status: next } : w)))
    setEmployeeWalks((prev) => prev.map((w) => (w.id === walk.id ? { ...w, status: next } : w)))
    const supabase = createClient()
    const { error } = await supabase
      .from('job_walks')
      .update({ status: next })
      .eq('id', walk.id)
    if (error) {
      console.error('[JobWalk] Status update failed:', error)
      setJobWalks((prev) => prev.map((w) => (w.id === walk.id ? { ...w, status: walk.status } : w)))
      setEmployeeWalks((prev) => prev.map((w) => (w.id === walk.id ? { ...w, status: walk.status } : w)))
    }
  }, [])

  const handleDeleteWalk = useCallback(async () => {
    if (!confirmDeleteWalk) return
    setDeletingWalk(true)
    const supabase = createClient()
    const result = await softDeleteJobWalk(
      supabase,
      confirmDeleteWalk.id,
      confirmDeleteWalk.project_name,
      userId,
    )
    if (result.error) {
      setDeletingWalk(false)
      setConfirmDeleteWalk(null)
      setDeleteToast(result.error)
      setTimeout(() => setDeleteToast(null), 6000)
      return
    }
    setJobWalks((prev) => prev.filter((w) => w.id !== confirmDeleteWalk.id))
    setEmployeeWalks((prev) => prev.filter((w) => w.id !== confirmDeleteWalk.id))
    setDeletingWalk(false)
    setConfirmDeleteWalk(null)
  }, [confirmDeleteWalk, userId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return jobWalks
    return jobWalks.filter((w) => {
      return (
        w.project_name.toLowerCase().includes(q) ||
        (w.customer_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [jobWalks, search])

  const canManage = canEdit('job_walk')

  const tabWalks = useMemo(
    () =>
      filtered.filter((w) =>
        tab === 'upcoming'
          ? w.status === 'upcoming'
          : w.status === 'sent_to_estimating' || w.status === 'completed'
      ),
    [filtered, tab]
  )

  const filteredEmployeeWalks = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matchesTab = (w: JobWalk) =>
      tab === 'upcoming'
        ? w.status === 'upcoming'
        : w.status === 'sent_to_estimating' || w.status === 'completed'
    const base = employeeWalks.filter(matchesTab)
    if (!q) return base
    return base.filter(
      (w) =>
        w.project_name.toLowerCase().includes(q) ||
        (w.customer_name ?? '').toLowerCase().includes(q)
    )
  }, [employeeWalks, search, tab])

  const employeeWalksByUser = useMemo(() => {
    const byUser = new Map<string, JobWalk[]>()
    for (const w of filteredEmployeeWalks) {
      const uid = w.assigned_to ?? '__unassigned__'
      if (!byUser.has(uid)) byUser.set(uid, [])
      byUser.get(uid)!.push(w)
    }
    return byUser
  }, [filteredEmployeeWalks])

  function getEmployeeDisplayName(uid: string): string {
    if (uid === '__unassigned__') return 'Unassigned'
    const a = assignees.find((x) => x.id === uid)
    return a?.display_name || uid.slice(0, 8)
  }

  function toggleEmployee(uid: string) {
    setExpandedEmployees((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  function renderCard(walk: JobWalk) {
    const isDimmed = walk.status === 'completed'
    const kebabItems = canManage
      ? [
          {
            label: 'Edit',
            icon: <PencilIcon className="w-4 h-4" />,
            onSelect: () => setEditingWalk(walk),
          },
          {
            label: 'Delete',
            icon: <Trash2Icon className="w-4 h-4" />,
            destructive: true as const,
            onSelect: () => setConfirmDeleteWalk(walk),
          },
        ]
      : []

    return (
      <div
        key={walk.id}
        onClick={() => router.push(`/job-walk/${walk.id}`)}
        className={`bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all ${
          isDimmed ? 'opacity-70' : ''
        }`}
      >
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-[17px] font-medium text-gray-900 dark:text-white">
                {walk.project_name || 'Untitled Job Walk'}
              </span>
              <div className="mt-2 flex items-center gap-4 text-[13px] text-gray-500 dark:text-gray-400 flex-wrap">
                {walk.customer_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4 text-gray-400" />
                    {walk.customer_name}
                  </span>
                )}
                {walk.date && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-gray-400" />
                    {formatDate(walk.date)}
                  </span>
                )}
              </div>
              {(walk.address || walk.customer_phone || walk.customer_email) && (
                <div className="mt-1 flex items-center gap-4 text-[13px] text-gray-500 dark:text-gray-400 flex-wrap">
                  {walk.address && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPinIcon className="w-4 h-4 text-gray-400" />
                      {walk.address}
                    </span>
                  )}
                  {walk.customer_phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <PhoneIcon className="w-4 h-4 text-gray-400" />
                      {walk.customer_phone}
                    </span>
                  )}
                  {walk.customer_email && (
                    <span className="inline-flex items-center gap-1.5">
                      <MailIcon className="w-4 h-4 text-gray-400" />
                      {walk.customer_email}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              <select
                value={walk.status}
                onChange={(e) => {
                  e.stopPropagation()
                  setWalkStatus(walk, e.target.value as JobWalkStatus)
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: JOB_WALK_STATUS_COLORS[walk.status].bg,
                  borderColor: JOB_WALK_STATUS_COLORS[walk.status].border,
                  color: JOB_WALK_STATUS_COLORS[walk.status].text,
                }}
                className="text-[12px] font-medium border rounded-md px-2 py-1 max-w-[175px] cursor-pointer outline-none"
              >
                {JOB_WALK_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {kebabItems.length > 0 && (
                <KebabMenu items={kebabItems} variant="light" />
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderSectionHeader(
    label: string,
    count: number,
    expanded: boolean,
    onToggle: () => void,
  ) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 pt-4 pb-1 text-[11px] font-medium text-gray-400 uppercase tracking-widest hover:text-gray-500"
      >
        <ChevronRightIcon
          className={`w-3 h-3 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        {label} ({count})
        <span className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a2a] ml-2" />
      </button>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2 gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/sales" className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
          <FootprintsIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Job Walk</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search job walks…"
              className="w-[200px] pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#242424] dark:border-[#2a2a2a] dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-400 px-4 sm:px-6 pt-3">
        Walk the job site and capture details for estimating.
      </p>

      {/* Tabs */}
      <PageTabs<'upcoming' | 'completed'>
        tabs={[
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'completed', label: 'Completed' },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

      {/* List */}
      <div className="px-4 sm:px-7 py-6">
        {tabWalks.length === 0 ? (
          <div className="text-center py-14">
            <FootprintsIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {search
                ? 'No matching job walks.'
                : tab === 'upcoming'
                ? 'No upcoming job walks. Create one to get started.'
                : 'No completed job walks yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tabWalks.map((walk) => renderCard(walk))}
          </div>
        )}

        {isAdmin && filteredEmployeeWalks.length > 0 && (
          <div className="mt-2">
            {renderSectionHeader(
              'Employee Job Walks',
              filteredEmployeeWalks.length,
              employeeExpanded,
              () => setEmployeeExpanded((v) => !v),
            )}
            {employeeExpanded && (
              <div className="space-y-1 pt-1">
                {(Array.from(employeeWalksByUser.entries()) as [string, JobWalk[]][]).map(([uid, walks]) => (
                  <div key={uid} className="pl-4">
                    {renderSectionHeader(
                      getEmployeeDisplayName(uid),
                      walks.length,
                      expandedEmployees.has(uid),
                      () => toggleEmployee(uid),
                    )}
                    {expandedEmployees.has(uid) && (
                      <div className="space-y-3 pt-2">
                        {walks.map((walk) => renderCard(walk))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <NewJobWalkModal
          userId={userId}
          customers={customers}
          assignees={assignees}
          categories={categories}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreateFromModal}
        />
      )}

      {editingWalk && (
        <JobWalkEditInfoModal
          walk={editingWalk}
          customers={customers}
          assignees={assignees}
          categories={categories}
          onClose={() => setEditingWalk(null)}
          onSaved={(patch) => {
            handleUpdate(editingWalk.id, patch)
            setEditingWalk(null)
          }}
        />
      )}

      {confirmDeleteWalk && (
        <ConfirmDialog
          title="Delete Job Walk"
          message={`Are you sure you want to delete "${confirmDeleteWalk.project_name}"? It will be moved to the trash bin and can be restored within 1 year.`}
          confirmLabel="Delete"
          variant="destructive"
          loading={deletingWalk}
          onConfirm={handleDeleteWalk}
          onCancel={() => (deletingWalk ? null : setConfirmDeleteWalk(null))}
        />
      )}

      {deleteToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-md w-full px-4">
          <div className="bg-red-600 text-white text-sm rounded-lg shadow-lg px-4 py-3 flex items-start gap-3">
            <span className="flex-1 break-words">{deleteToast}</span>
            <button
              onClick={() => setDeleteToast(null)}
              className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

