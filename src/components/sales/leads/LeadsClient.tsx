'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
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
  ArrowLeftIcon,
  MapPinIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
  UserIcon,
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

export type LeadStatus = 'new' | 'appointment_set' | 'sent_to_estimating' | 'unable_to_reach' | 'disqualified'
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

const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'appointment_set', label: 'Appointment Set' },
  { value: 'sent_to_estimating', label: 'Sent to Estimating' },
  { value: 'unable_to_reach', label: 'Unable to Reach' },
  { value: 'disqualified', label: 'Disqualified' },
]

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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ message: string; href?: string | null } | null>(null)

  function showToast(message: string, href?: string | null) {
    setToast({ message, href: href ?? null })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    const urlId = searchParams.get('lead')
    if (urlId && leads.some((l) => l.id === urlId)) {
      setExpandedId(urlId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  function toggleExpand(id: string) {
    const next = expandedId === id ? null : id
    setExpandedId(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next) {
      params.set('lead', next)
    } else {
      params.delete('lead')
    }
    const qs = params.toString()
    router.replace(qs ? `/sales/leads?${qs}` : '/sales/leads', { scroll: false })
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
    setLeads((prev) => prev.filter((l) => l.id !== deletedId))
    if (expandedId === deletedId) {
      setExpandedId(null)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('lead')
      const qs = params.toString()
      router.replace(qs ? `/sales/leads?${qs}` : '/sales/leads', { scroll: false })
    }
    setDeleting(false)
    setConfirmDelete(null)
  }, [confirmDelete, expandedId, router, searchParams])

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

  const activeLeads = useMemo(
    () => filtered.filter((l) => l.status !== 'disqualified'),
    [filtered]
  )
  const disqualifiedLeads = useMemo(
    () => filtered.filter((l) => l.status === 'disqualified'),
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
    setExpandedId(lead.id)
    const params = new URLSearchParams(searchParams.toString())
    params.set('lead', lead.id)
    router.replace(`/sales/leads?${params.toString()}`, { scroll: false })
  }

  function handleCategoriesChanged(next: LeadCategory[]) {
    setCategories(next)
  }

  function renderCard(lead: Lead) {
    const isExpanded = expandedId === lead.id
    const isDimmed = lead.status === 'disqualified'

    return (
      <div
        key={lead.id}
        className={`bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl transition-opacity ${
          isDimmed ? 'opacity-70' : ''
        }`}
      >
        {/* Collapsed summary — always visible */}
        <button
          type="button"
          onClick={() => toggleExpand(lead.id)}
          className="w-full text-left px-6 py-5"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[17px] font-medium text-gray-900 dark:text-white">
                  {lead.project_name || 'Untitled Lead'}
                </span>
                <select
                  value={lead.status}
                  onChange={(e) => {
                    e.stopPropagation()
                    setLeadStatus(lead, e.target.value as LeadStatus)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[12px] font-medium border border-gray-200 dark:border-[#3a3a3a] rounded-md px-1.5 py-1 text-gray-600 dark:text-gray-300 bg-white dark:bg-[#2a2a2a] max-w-[170px] cursor-pointer"
                >
                  {LEAD_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex items-center gap-4 text-[13px] text-gray-500 dark:text-gray-400 flex-wrap">
                {lead.customer_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4 text-gray-400" />
                    {lead.customer_name}
                  </span>
                )}
                {lead.date && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-gray-400" />
                    {formatDate(lead.date)}
                  </span>
                )}
              </div>
              {(lead.address || lead.customer_phone || lead.customer_email) && (
                <div className="mt-1 flex items-center gap-4 text-[13px] text-gray-500 dark:text-gray-400 flex-wrap">
                  {lead.address && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPinIcon className="w-4 h-4 text-gray-400" />
                      {lead.address}
                    </span>
                  )}
                  {lead.customer_phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <PhoneIcon className="w-4 h-4 text-gray-400" />
                      {lead.customer_phone}
                    </span>
                  )}
                  {lead.customer_email && (
                    <span className="inline-flex items-center gap-1.5">
                      <MailIcon className="w-4 h-4 text-gray-400" />
                      {lead.customer_email}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ChevronDownIcon
              className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="border-t border-gray-100 dark:border-[#2a2a2a]">
            {/* Action bar */}
            <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 dark:bg-[#1e1e1e] flex-wrap">
              <LeadPushMenu
                lead={lead}
                userId={userId}
                onPatch={(patch) => handleUpdate(lead.id, patch)}
                showToast={showToast}
              />
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setConfirmDelete(lead)}
                title="Delete lead"
                aria-label="Delete lead"
                className="flex-shrink-0 p-1.5 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 transition"
              >
                <Trash2Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Detail cards */}
            <div className="p-4 space-y-4">
              <LeadInfoCard
                key={`info-${lead.id}`}
                lead={lead}
                customers={customers}
                onPatch={(patch) => handleUpdate(lead.id, patch)}
              />
              <LeadCategoryCard
                key={`cat-${lead.id}`}
                lead={lead}
                categories={categories}
                isAdmin={userRole === 'admin'}
                onPatch={(patch) => handleUpdate(lead.id, patch)}
                onCategoriesChanged={handleCategoriesChanged}
              />
              <LeadProjectDetailsCard
                key={`pd-${lead.id}`}
                lead={lead}
                onPatch={(patch) => handleUpdate(lead.id, patch)}
              />
              <LeadPhotosCard
                key={`photos-${lead.id}`}
                leadId={lead.id}
                userId={userId}
              />
              <LeadMeasurementsCard
                key={`m-${lead.id}`}
                lead={lead}
                userId={userId}
                onPatch={(patch) => handleUpdate(lead.id, patch)}
              />
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
          <TargetIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Leads</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="w-[200px] pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white dark:bg-[#242424] dark:border-[#2a2a2a] dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Add lead
          </button>
        </div>
      </div>

      {/* Card list */}
      <div className="px-4 sm:px-7 py-6">
        {filtered.length === 0 ? (
          <div className="text-center py-14">
            <TargetIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {search ? 'No matching leads.' : 'No leads yet. Add one to get started.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeLeads.map((lead) => renderCard(lead))}

            {disqualifiedLeads.length > 0 && (
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
                  Disqualified ({disqualifiedLeads.length})
                  <span className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a2a] ml-2" />
                </button>
                {completedExpanded &&
                  disqualifiedLeads.map((lead) => renderCard(lead))}
              </>
            )}
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
  )
}
