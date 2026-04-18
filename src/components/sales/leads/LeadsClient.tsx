'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  TargetIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  Trash2Icon,
  CheckIcon,
  ArrowLeftIcon,
} from 'lucide-react'
import type { Customer } from '@/components/estimates/types'
import type { UserRole } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import LeadInfoCard from './LeadInfoCard'
import LeadCategoryCard from './LeadCategoryCard'
import LeadProjectDetailsCard from './LeadProjectDetailsCard'
import LeadPhotosCard from './LeadPhotosCard'
import LeadMeasurementsCard from './LeadMeasurementsCard'
import LeadPushMenu from './LeadPushMenu'
import AddLeadModal from './AddLeadModal'

export type LeadStatus = 'in_progress' | 'completed'
export type LeadPushedTo = 'appointment' | 'job_walk' | 'estimating' | 'estimate' | 'job'

export interface Lead {
  id: string
  project_name: string
  company_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  date: string | null
  status: LeadStatus
  category: string | null
  project_details: string | null
  measurements: string | null
  pushed_to: LeadPushedTo | null
  pushed_ref_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadCategory {
  id: string
  name: string
  created_at: string
}

interface LeadsClientProps {
  initialLeads: Lead[]
  initialCategories: LeadCategory[]
  userId: string
  userRole: UserRole
}

export const LEAD_STATUS_STYLES: Record<LeadStatus, { label: string; className: string }> = {
  in_progress: { label: 'In Progress', className: 'bg-green-100 text-green-700' },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-700' },
}

export default function LeadsClient({
  initialLeads,
  initialCategories,
  userId,
  userRole,
}: LeadsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [categories, setCategories] = useState<LeadCategory[]>(initialCategories)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ message: string; href?: string | null } | null>(null)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId]
  )

  function showToast(message: string, href?: string | null) {
    setToast({ message, href: href ?? null })
    setTimeout(() => setToast(null), 3500)
  }

  // Restore selection from URL on mount
  useEffect(() => {
    const urlId = searchParams.get('lead')
    if (urlId && leads.some((l) => l.id === urlId)) {
      setSelectedId(urlId)
      setMobileView('detail')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close status dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false)
      }
    }
    if (statusDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [statusDropdownOpen])

  // Fetch customers for the modal + edit
  useEffect(() => {
    async function fetchCustomers() {
      const supabase = createClient()
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('archived', false)
        .order('name', { ascending: true })
      if (data) setCustomers(data as Customer[])
    }
    fetchCustomers()
  }, [userId])

  function selectLead(id: string) {
    setStatusDropdownOpen(false)
    setSelectedId(id)
    setMobileView('detail')
    const params = new URLSearchParams(searchParams.toString())
    params.set('lead', id)
    router.replace(`/sales/leads?${params.toString()}`, { scroll: false })
  }

  function backToList() {
    setMobileView('list')
  }

  const handleUpdate = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  const setLeadStatus = useCallback(async (lead: Lead, next: LeadStatus) => {
    if (next === lead.status) return
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, status: next } : l))
    )
    const supabase = createClient()
    const { error } = await supabase
      .from('leads')
      .update({ status: next })
      .eq('id', lead.id)
    if (error) {
      console.error('[Leads] Status update failed:', error)
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l))
      )
    }
  }, [])

  const handleDeleteLead = useCallback(async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('leads').delete().eq('id', confirmDelete.id)
    if (error) {
      console.error('[Leads] Delete failed:', error)
      setDeleting(false)
      return
    }
    const deletedId = confirmDelete.id
    setLeads((prev) => {
      const next = prev.filter((l) => l.id !== deletedId)
      const nextSelected = next[0]?.id ?? null
      setSelectedId(nextSelected)
      if (!nextSelected) setMobileView('list')
      const params = new URLSearchParams(searchParams.toString())
      if (nextSelected) {
        params.set('lead', nextSelected)
      } else {
        params.delete('lead')
      }
      const qs = params.toString()
      router.replace(qs ? `/sales/leads?${qs}` : '/sales/leads', { scroll: false })
      return next
    })
    setDeleting(false)
    setConfirmDelete(null)
  }, [confirmDelete, router, searchParams])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return leads
    return leads.filter((l) => {
      return (
        l.project_name.toLowerCase().includes(q) ||
        (l.customer_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [leads, search])

  const inProgressLeads = useMemo(
    () => filtered.filter((l) => l.status !== 'completed'),
    [filtered]
  )
  const completedLeads = useMemo(
    () => filtered.filter((l) => l.status === 'completed'),
    [filtered]
  )

  function handleLeadCreated(lead: Lead, newCustomer?: Customer | null) {
    setLeads((prev) => [lead, ...prev])
    if (newCustomer) {
      setCustomers((prev) => {
        if (prev.some((c) => c.id === newCustomer.id)) return prev
        return [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name))
      })
    }
    setShowAddModal(false)
    selectLead(lead.id)
  }

  function handleCategoriesChanged(next: LeadCategory[]) {
    setCategories(next)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden w-full max-w-full">
      <div className="px-4 pt-3 pb-1 flex-shrink-0 bg-white border-b border-gray-200 dark:border-[#2a2a2a]">
        <Link
          href="/sales"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Sales
        </Link>
      </div>
      <div className="flex flex-1 overflow-hidden">
      {/* ── Left panel: Lead list ── */}
      <div
        className={`flex-shrink-0 w-screen max-w-full lg:w-80 xl:w-96 min-w-0 bg-white border-r border-gray-200 flex-col overflow-hidden ${
          mobileView === 'detail' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-[#2a2a2a] space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TargetIcon className="w-5 h-5 text-gray-400" />
              <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
            >
              <PlusIcon className="w-4 h-4" />
              Add lead
            </button>
          </div>

          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search leads…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <TargetIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {search ? 'No matching leads' : 'No leads yet. Add one to get started.'}
              </p>
            </div>
          ) : (
            <>
              {inProgressLeads.map((lead) => (
                <LeadListItem
                  key={lead.id}
                  lead={lead}
                  isSelected={selectedId === lead.id}
                  onSelect={() => selectLead(lead.id)}
                />
              ))}

              {completedLeads.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setCompletedExpanded((v) => !v)}
                    className="w-full flex items-center gap-2 px-2 pt-3 pb-1 text-[11px] font-medium text-gray-400 uppercase tracking-widest hover:text-gray-500"
                  >
                    {completedExpanded ? (
                      <ChevronDownIcon className="w-3 h-3" />
                    ) : (
                      <ChevronRightIcon className="w-3 h-3" />
                    )}
                    Completed ({completedLeads.length})
                    <span className="flex-1 h-px bg-gray-200 ml-2" />
                  </button>
                  {completedExpanded &&
                    completedLeads.map((lead) => (
                      <LeadListItem
                        key={lead.id}
                        lead={lead}
                        isSelected={selectedId === lead.id}
                        onSelect={() => selectLead(lead.id)}
                      />
                    ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel: Detail ── */}
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
                  className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  aria-label="Back to list"
                >
                  <ChevronRightIcon className="w-5 h-5 rotate-180" />
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">
                    {selected.project_name || 'Untitled Lead'}
                  </h2>
                  <p className="text-xs text-gray-500 truncate">
                    {selected.customer_name || '—'}
                    {selected.address ? ` · ${selected.address}` : ''}
                  </p>
                </div>
                <div className="relative flex-shrink-0" ref={statusDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition ${LEAD_STATUS_STYLES[selected.status].className}`}
                  >
                    {LEAD_STATUS_STYLES[selected.status].label}
                    <ChevronDownIcon className="w-3 h-3" />
                  </button>
                  {statusDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]">
                      {(Object.keys(LEAD_STATUS_STYLES) as LeadStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setLeadStatus(selected, s)
                            setStatusDropdownOpen(false)
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center justify-between gap-2"
                        >
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${LEAD_STATUS_STYLES[s].className}`}>
                            {LEAD_STATUS_STYLES[s].label}
                          </span>
                          {s === selected.status && (
                            <CheckIcon className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <LeadPushMenu
                  lead={selected}
                  userId={userId}
                  onPatch={(patch) => handleUpdate(selected.id, patch)}
                  showToast={showToast}
                />
                <button
                  type="button"
                  onClick={() => setConfirmDelete(selected)}
                  title="Delete lead"
                  aria-label="Delete lead"
                  className="flex-shrink-0 p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 transition"
                >
                  <Trash2Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <LeadInfoCard
                key={`info-${selected.id}`}
                lead={selected}
                customers={customers}
                onPatch={(patch) => handleUpdate(selected.id, patch)}
              />
              <LeadCategoryCard
                key={`cat-${selected.id}`}
                lead={selected}
                categories={categories}
                isAdmin={userRole === 'admin'}
                onPatch={(patch) => handleUpdate(selected.id, patch)}
                onCategoriesChanged={handleCategoriesChanged}
              />
              <LeadProjectDetailsCard
                key={`pd-${selected.id}`}
                lead={selected}
                onPatch={(patch) => handleUpdate(selected.id, patch)}
              />
              <LeadPhotosCard
                key={`photos-${selected.id}`}
                leadId={selected.id}
                userId={userId}
              />
              <LeadMeasurementsCard
                key={`m-${selected.id}`}
                lead={selected}
                userId={userId}
                onPatch={(patch) => handleUpdate(selected.id, patch)}
              />
            </div>
          </>
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <TargetIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                Select a lead from the list, or click{' '}
                <span className="font-semibold text-amber-600">+ Add lead</span> to create
                one.
              </p>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddLeadModal
          userId={userId}
          customers={customers}
          categories={categories}
          onClose={() => setShowAddModal(false)}
          onCreated={handleLeadCreated}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Lead"
          message="Are you sure you want to delete this lead? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          loading={deleting}
          onConfirm={handleDeleteLead}
          onCancel={() => (deleting ? null : setConfirmDelete(null))}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg flex items-center gap-3">
          <span>{toast.message}</span>
          {toast.href && (
            <a href={toast.href} className="text-amber-300 hover:text-amber-100 underline">
              View
            </a>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

interface LeadListItemProps {
  lead: Lead
  isSelected: boolean
  onSelect: () => void
}

function LeadListItem({ lead, isSelected, onSelect }: LeadListItemProps) {
  const statusStyle = LEAD_STATUS_STYLES[lead.status]
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
            {lead.project_name || 'Untitled Lead'}
          </p>
          {lead.customer_name && (
            <p className="text-xs text-gray-600 truncate mt-0.5">{lead.customer_name}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {lead.category && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
            {lead.category}
          </span>
        )}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusStyle.className}`}
        >
          {statusStyle.label}
        </span>
      </div>
    </button>
  )
}
