'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  FootprintsIcon,
  ChevronRightIcon,
} from 'lucide-react'
import type { Customer } from '@/components/estimates/types'
import JobWalkInfoCard from './JobWalkInfoCard'
import JobWalkNotesCard from './JobWalkNotesCard'
import JobWalkPhotosCard from './JobWalkPhotosCard'
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
  created_by: string | null
  created_at: string
  updated_at: string
}

interface JobWalkClientProps {
  initialJobWalks: JobWalk[]
  userId: string
}

const STATUS_STYLES: Record<JobWalkStatus, { label: string; className: string }> = {
  in_progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
  sent_to_estimating: { label: 'Sent to Estimating', className: 'bg-blue-100 text-blue-700' },
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
            filtered.map((walk) => {
              const isSelected = selectedId === walk.id
              const statusStyle = STATUS_STYLES[walk.status]
              return (
                <button
                  key={walk.id}
                  onClick={() => selectWalk(walk.id)}
                  className={`w-full text-left relative rounded-lg border p-3 transition ${
                    isSelected
                      ? 'border-amber-300 bg-amber-50/60'
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
            })
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
                <span
                  className={`inline-flex flex-shrink-0 items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[selected.status].className}`}
                >
                  {STATUS_STYLES[selected.status].label}
                </span>
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
              <JobWalkNotesCard
                key={`notes-${selected.id}`}
                walk={selected}
                onPatch={(patch) => handleUpdate(selected.id, patch)}
              />
              <JobWalkPhotosCard
                key={`photos-${selected.id}`}
                walkId={selected.id}
                userId={userId}
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
    </div>
  )
}
