'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  FootprintsIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Trash2Icon,
  ArrowLeftIcon,
  MapPinIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
  UserIcon,
} from 'lucide-react'
import Link from 'next/link'
import type { Customer } from '@/components/estimates/types'
import type { UserRole } from '@/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import JobWalkInfoCard from './JobWalkInfoCard'
import JobWalkNotesCard from './JobWalkNotesCard'
import JobWalkPhotosCard from './JobWalkPhotosCard'
import JobWalkMeasurementsCard from './JobWalkMeasurementsCard'
import JobWalkCamToPlanCard from './JobWalkCamToPlanCard'
import JobWalkPushMenu from './JobWalkPushMenu'
import NewJobWalkModal from './NewJobWalkModal'

export type JobWalkStatus = 'in_progress' | 'completed' | 'sent_to_estimating'
export type JobWalkPushedTo = 'estimating' | 'estimate' | 'job'

export interface JobWalk {
  id: string
  project_name: string
  company_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  date: string | null
  status: JobWalkStatus
  notes: string | null
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
  userId: string
  userRole: UserRole
}

const JOB_WALK_STATUS_OPTIONS: { value: JobWalkStatus; label: string }[] = [
  { value: 'in_progress', label: 'In Progress' },
  { value: 'sent_to_estimating', label: 'Sent to Estimating' },
  { value: 'completed', label: 'Completed' },
]

const JOB_WALK_STATUS_COLORS: Record<JobWalkStatus, { bg: string; border: string; text: string }> = {
  in_progress: { bg: 'rgba(239,159,39,0.15)', border: 'rgba(239,159,39,0.3)', text: '#EF9F27' },
  sent_to_estimating: { bg: 'rgba(55,138,221,0.15)', border: 'rgba(55,138,221,0.3)', text: '#378ADD' },
  completed: { bg: 'rgba(29,158,117,0.15)', border: 'rgba(29,158,117,0.3)', text: '#1D9E75' },
}

export const STATUS_STYLES: Record<JobWalkStatus, { label: string; className: string }> = {
  in_progress: { label: 'In Progress', className: 'bg-green-100 text-green-700' },
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

export default function JobWalkClient({ initialJobWalks, userId, userRole }: JobWalkClientProps) {
  const isAdmin = userRole === 'admin'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [jobWalks, setJobWalks] = useState<JobWalk[]>(initialJobWalks)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [assignees, setAssignees] = useState<AppointmentAssigneeOption[]>([])
  const [creating, setCreating] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [confirmDeleteWalk, setConfirmDeleteWalk] = useState<JobWalk | null>(null)
  const [deletingWalk, setDeletingWalk] = useState(false)
  const [completedExpanded, setCompletedExpanded] = useState(false)

  useEffect(() => {
    const urlId = searchParams.get('walk')
    if (urlId && jobWalks.some((w) => w.id === urlId)) {
      setExpandedId(urlId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function fetchCustomersAndAssignees() {
      const supabase = createClient()
      const [{ data: custData }, { data: profData }] = await Promise.all([
        supabase
          .from('companies')
          .select('*')
          .eq('archived', false)
          .order('name', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, display_name, role')
          .in('role', ['admin', 'office_manager', 'salesman'])
          .order('display_name', { ascending: true }),
      ])
      if (custData) setCustomers(custData as Customer[])
      setAssignees(
        ((profData ?? []) as { id: string; display_name: string | null }[]).map((p) => ({
          id: p.id,
          display_name: p.display_name,
        }))
      )
    }
    fetchCustomersAndAssignees()
  }, [userId])

  function toggleExpand(id: string) {
    const next = expandedId === id ? null : id
    setExpandedId(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next) {
      params.set('walk', next)
    } else {
      params.delete('walk')
    }
    const qs = params.toString()
    router.replace(qs ? `/job-walk?${qs}` : '/job-walk', { scroll: false })
  }

  const handleCreateFromModal = useCallback((walk: JobWalk, newCustomer?: import('@/components/estimates/types').Customer | null) => {
    setJobWalks((prev) => [walk, ...prev])
    if (newCustomer) {
      setCustomers((prev) => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setExpandedId(walk.id)
    setShowCreateModal(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('walk', walk.id)
    router.replace(`/job-walk?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  const handleUpdate = useCallback((id: string, patch: Partial<JobWalk>) => {
    setJobWalks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
    )
  }, [])

  const setWalkStatus = useCallback(async (walk: JobWalk, next: JobWalkStatus) => {
    if (next === walk.status) return
    // Optimistic update
    setJobWalks((prev) =>
      prev.map((w) => (w.id === walk.id ? { ...w, status: next } : w))
    )
    const supabase = createClient()
    const { error } = await supabase
      .from('job_walks')
      .update({ status: next })
      .eq('id', walk.id)
    if (error) {
      console.error('[JobWalk] Status update failed:', error)
      // Revert on error
      setJobWalks((prev) =>
        prev.map((w) => (w.id === walk.id ? { ...w, status: walk.status } : w))
      )
    }
  }, [])

  const handleDeleteWalk = useCallback(async () => {
    if (!confirmDeleteWalk) return
    setDeletingWalk(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('job_walks')
      .delete()
      .eq('id', confirmDeleteWalk.id)
    if (error) {
      console.error('[JobWalk] Delete failed:', error)
      setDeletingWalk(false)
      return
    }
    const deletedId = confirmDeleteWalk.id
    setJobWalks((prev) => prev.filter((w) => w.id !== deletedId))
    if (expandedId === deletedId) {
      setExpandedId(null)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('walk')
      const qs = params.toString()
      router.replace(qs ? `/job-walk?${qs}` : '/job-walk', { scroll: false })
    }
    setDeletingWalk(false)
    setConfirmDeleteWalk(null)
  }, [confirmDeleteWalk, expandedId, router, searchParams])

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

  const assigneeMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of assignees) m.set(a.id, a.display_name || a.id.slice(0, 8))
    return m
  }, [assignees])

  const myFiltered = useMemo(
    () => (isAdmin ? filtered.filter((w) => w.assigned_to === userId) : filtered),
    [isAdmin, filtered, userId]
  )

  const inProgressWalks = useMemo(
    () => myFiltered.filter((w) => w.status !== 'completed'),
    [myFiltered]
  )

  const otherUserSections = useMemo(() => {
    if (!isAdmin) return []
    const others = filtered.filter((w) => w.assigned_to !== userId && w.status !== 'completed')
    const grouped = new Map<string, JobWalk[]>()
    for (const w of others) {
      const key = w.assigned_to ?? '__unassigned__'
      const arr = grouped.get(key) ?? []
      arr.push(w)
      grouped.set(key, arr)
    }
    return Array.from(grouped.entries())
      .map(([uid, items]) => ({
        userId: uid,
        name: uid === '__unassigned__' ? 'Unassigned' : (assigneeMap.get(uid) ?? uid.slice(0, 8)),
        walks: items,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [isAdmin, filtered, userId, assigneeMap])

  const completedWalks = useMemo(
    () => (isAdmin ? filtered.filter((w) => w.status === 'completed') : filtered.filter((w) => w.status === 'completed')),
    [filtered, isAdmin]
  )

  function renderCard(walk: JobWalk) {
    const isExpanded = expandedId === walk.id
    const isDimmed = walk.status === 'completed'

    return (
      <div
        key={walk.id}
        className={`bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl transition-opacity ${
          isDimmed ? 'opacity-70' : ''
        }`}
      >
        {/* Collapsed summary — always visible */}
        <div
          onClick={() => toggleExpand(walk.id)}
          className="w-full text-left px-6 py-5 cursor-pointer"
        >
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
            <div className="flex items-center gap-2.5 flex-shrink-0 mt-0.5">
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
            {/* Action bar */}
            <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 dark:bg-[#1e1e1e] flex-wrap">
              <JobWalkPushMenu
                walk={walk}
                userId={userId}
                onPatch={(patch) => handleUpdate(walk.id, patch)}
              />
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setConfirmDeleteWalk(walk)}
                title="Delete job walk"
                aria-label="Delete job walk"
                className="flex-shrink-0 p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 transition"
              >
                <Trash2Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Detail cards */}
            <div className="p-4 space-y-4">
              <JobWalkInfoCard
                key={`info-${walk.id}`}
                walk={walk}
                customers={customers}
                assignees={assignees}
                isAdmin={isAdmin}
                onPatch={(patch) => handleUpdate(walk.id, patch)}
              />
              <JobWalkPhotosCard
                key={`photos-${walk.id}`}
                walkId={walk.id}
                userId={userId}
              />
              <JobWalkNotesCard
                key={`notes-${walk.id}`}
                walk={walk}
                onPatch={(patch) => handleUpdate(walk.id, patch)}
              />
              <JobWalkMeasurementsCard
                key={`measurements-${walk.id}`}
                walk={walk}
                userId={userId}
                onPatch={(patch) => handleUpdate(walk.id, patch)}
              />
              <JobWalkCamToPlanCard />
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

      {/* Card list */}
      <div className="px-4 sm:px-7 py-6">
        {filtered.length === 0 ? (
          <div className="text-center py-14">
            <FootprintsIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {search ? 'No matching job walks.' : 'No job walks yet. Create one to get started.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {inProgressWalks.map((walk) => renderCard(walk))}

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
                        ({section.walks.length})
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.walks.map((walk) => renderCard(walk))}
                    </div>
                  </div>
                ))}
              </>
            )}

            {completedWalks.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setCompletedExpanded((v) => !v)}
                  className="w-full flex items-center gap-2 px-2 pt-4 pb-1 text-[11px] font-medium text-gray-400 uppercase tracking-widest hover:text-gray-500"
                >
                  {completedExpanded ? (
                    <ChevronDownIcon className="w-3 h-3" />
                  ) : (
                    <ChevronRightIcon className="w-3 h-3" />
                  )}
                  Completed ({completedWalks.length})
                  <span className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a2a] ml-2" />
                </button>
                {completedExpanded &&
                  completedWalks.map((walk) => renderCard(walk))}
              </>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <NewJobWalkModal
          userId={userId}
          isAdmin={isAdmin}
          customers={customers}
          assignees={assignees}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreateFromModal}
        />
      )}

      {confirmDeleteWalk && (
        <ConfirmDialog
          title="Delete Job Walk"
          message="Are you sure you want to delete this job walk? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          loading={deletingWalk}
          onConfirm={handleDeleteWalk}
          onCancel={() => (deletingWalk ? null : setConfirmDeleteWalk(null))}
        />
      )}
    </div>
  )
}

