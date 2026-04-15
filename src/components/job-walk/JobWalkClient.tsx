'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  FootprintsIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon,
  Trash2Icon,
} from 'lucide-react'
import type { Customer } from '@/components/estimates/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import JobWalkInfoCard from './JobWalkInfoCard'
import JobWalkNotesCard from './JobWalkNotesCard'
import JobWalkPhotosCard from './JobWalkPhotosCard'
import JobWalkMeasurementsCard from './JobWalkMeasurementsCard'
import JobWalkCamToPlanCard from './JobWalkCamToPlanCard'

export type JobWalkStatus = 'in_progress' | 'completed' | 'sent_to_estimating'

export interface JobWalk {
  id: string
  project_name: string
  customer_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  date: string | null
  status: JobWalkStatus
  notes: string | null
  measurements: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface JobWalkClientProps {
  initialJobWalks: JobWalk[]
  userId: string
}

export const STATUS_STYLES: Record<JobWalkStatus, { label: string; className: string }> = {
  in_progress: { label: 'In Progress', className: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-700' },
  sent_to_estimating: { label: 'Sent to Estimating', className: 'bg-gray-100 text-gray-600' },
}

export default function JobWalkClient({ initialJobWalks, userId }: JobWalkClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [jobWalks, setJobWalks] = useState<JobWalk[]>(initialJobWalks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [creating, setCreating] = useState(false)
  const [confirmDeleteWalk, setConfirmDeleteWalk] = useState<JobWalk | null>(null)
  const [deletingWalk, setDeletingWalk] = useState(false)

  const selected = useMemo(
    () => jobWalks.find((w) => w.id === selectedId) ?? null,
    [jobWalks, selectedId]
  )

  // Restore selection from URL on mount
  useEffect(() => {
    const urlId = searchParams.get('walk')
    if (urlId && jobWalks.some((w) => w.id === urlId)) {
      setSelectedId(urlId)
      setMobileView('detail')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch customers for the dropdown
  useEffect(() => {
    async function fetchCustomers() {
      const supabase = createClient()
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', userId)
        .order('name', { ascending: true })
      if (data) setCustomers(data as Customer[])
    }
    fetchCustomers()
  }, [userId])

  function selectWalk(id: string) {
    setSelectedId(id)
    setMobileView('detail')
    const params = new URLSearchParams(searchParams.toString())
    params.set('walk', id)
    router.replace(`/job-walk?${params.toString()}`, { scroll: false })
  }

  function backToList() {
    setMobileView('list')
  }

  const handleCreate = useCallback(async () => {
    if (creating) return
    setCreating(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('job_walks')
      .insert({
        project_name: 'New Job Walk',
        status: 'in_progress',
        created_by: userId,
      })
      .select('*')
      .single()
    setCreating(false)
    if (error || !data) {
      console.error('[JobWalk] Create failed:', error)
      return
    }
    const created = data as JobWalk
    setJobWalks((prev) => [created, ...prev])
    selectWalk(created.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating, userId])

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
    setJobWalks((prev) => {
      const next = prev.filter((w) => w.id !== deletedId)
      // Pick the next available walk (first in list) or clear selection
      const nextSelected = next[0]?.id ?? null
      setSelectedId(nextSelected)
      if (!nextSelected) {
        setMobileView('list')
      }
      const params = new URLSearchParams(searchParams.toString())
      if (nextSelected) {
        params.set('walk', nextSelected)
      } else {
        params.delete('walk')
      }
      const qs = params.toString()
      router.replace(qs ? `/job-walk?${qs}` : '/job-walk', { scroll: false })
      return next
    })
    setDeletingWalk(false)
    setConfirmDeleteWalk(null)
  }, [confirmDeleteWalk, router, searchParams])

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

  const inProgressWalks = useMemo(
    () => filtered.filter((w) => w.status !== 'completed'),
    [filtered]
  )
  const completedWalks = useMemo(
    () => filtered.filter((w) => w.status === 'completed'),
    [filtered]
  )

  return (
    <div className="flex h-full overflow-hidden w-full max-w-full">
      {/* ── Left Panel: Job Walk List ──────────────────────────────── */}
      <div
        className={`flex-shrink-0 w-screen max-w-full lg:w-80 xl:w-96 min-w-0 bg-white border-r border-gray-200 flex-col overflow-hidden ${
          mobileView === 'detail' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Job Walk</h1>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              New
            </button>
          </div>

          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search job walks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <FootprintsIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {search
                  ? 'No matching job walks'
                  : 'No job walks yet. Create one to get started.'}
              </p>
            </div>
          ) : (
            <>
              {inProgressWalks.map((walk) => (
                <JobWalkListItem
                  key={walk.id}
                  walk={walk}
                  isSelected={selectedId === walk.id}
                  onSelect={() => selectWalk(walk.id)}
                />
              ))}

              {inProgressWalks.length > 0 && completedWalks.length > 0 && (
                <div className="flex items-center gap-3 px-1 pt-3 pb-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">
                    Completed
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}

              {completedWalks.map((walk) => (
                <JobWalkListItem
                  key={walk.id}
                  walk={walk}
                  isSelected={selectedId === walk.id}
                  onSelect={() => selectWalk(walk.id)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Right Panel: Detail ────────────────────────────────────── */}
      <div
        className={`flex-1 min-h-0 w-screen max-w-full min-w-0 overflow-hidden bg-gray-50 ${
          mobileView === 'list' ? 'hidden lg:flex' : 'flex'
        } flex-col`}
      >
        {selected ? (
          <>
            {/* Detail header */}
            <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={backToList}
                  className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  aria-label="Back to list"
                >
                  <ChevronRightIcon className="w-5 h-5 rotate-180" />
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">
                    {selected.project_name || 'Untitled Job Walk'}
                  </h2>
                  <p className="text-xs text-gray-500 truncate">
                    {selected.customer_name || '—'}
                    {selected.address ? ` · ${selected.address}` : ''}
                  </p>
                </div>
                <StatusDropdown
                  walk={selected}
                  onChange={(next) => setWalkStatus(selected, next)}
                />
                <button
                  type="button"
                  onClick={() => setConfirmDeleteWalk(selected)}
                  title="Delete job walk"
                  aria-label="Delete job walk"
                  className="flex-shrink-0 p-2 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 transition"
                >
                  <Trash2Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <JobWalkInfoCard
                key={`info-${selected.id}`}
                walk={selected}
                customers={customers}
                onPatch={(patch) => handleUpdate(selected.id, patch)}
              />
              <JobWalkPhotosCard
                key={`photos-${selected.id}`}
                walkId={selected.id}
                userId={userId}
              />
              <JobWalkNotesCard
                key={`notes-${selected.id}`}
                walk={selected}
                onPatch={(patch) => handleUpdate(selected.id, patch)}
              />
              <JobWalkMeasurementsCard
                key={`measurements-${selected.id}`}
                walk={selected}
                userId={userId}
                onPatch={(patch) => handleUpdate(selected.id, patch)}
              />
              <JobWalkCamToPlanCard />
            </div>
          </>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <FootprintsIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                Select a job walk from the list, or click <span className="font-semibold text-amber-600">+ New</span> to create one.
              </p>
            </div>
          </div>
        )}
      </div>

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

interface JobWalkListItemProps {
  walk: JobWalk
  isSelected: boolean
  onSelect: () => void
}

function JobWalkListItem({ walk, isSelected, onSelect }: JobWalkListItemProps) {
  const statusStyle = STATUS_STYLES[walk.status]
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left relative rounded-lg border p-3 transition ${
        isSelected
          ? 'border-gray-300 bg-gray-50 dark:bg-gray-100'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-amber-500" />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {walk.project_name || 'Untitled Job Walk'}
          </p>
          {walk.customer_name && (
            <p className="text-xs text-gray-600 truncate mt-0.5">
              {walk.customer_name}
            </p>
          )}
          {walk.address && (
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {walk.address}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusStyle.className}`}
        >
          {statusStyle.label}
        </span>
      </div>
    </button>
  )
}

interface StatusDropdownProps {
  walk: JobWalk
  onChange: (next: JobWalkStatus) => void
}

function StatusDropdown({ walk, onChange }: StatusDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const current = STATUS_STYLES[walk.status]

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const options: JobWalkStatus[] = ['in_progress', 'completed']

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition ${current.className} hover:opacity-80`}
      >
        {current.label}
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 z-20 min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {options.map((opt) => {
            const style = STATUS_STYLES[opt]
            const isActive = walk.status === opt
            return (
              <button
                key={opt}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 transition"
              >
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${style.className}`}
                >
                  {style.label}
                </span>
                {isActive && (
                  <CheckIcon className="w-4 h-4 text-amber-500 ml-auto flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
