'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  SearchIcon,
  TargetIcon,
  Trash2Icon,
  MapPinIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
  UserIcon,
  PencilIcon,
} from 'lucide-react'
import type { Customer } from '@/components/proposals/types'
import type { UserRole } from '@/types'
import type { AppointmentAssigneeOption } from '../NewAppointmentModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AddLeadModal from './AddLeadModal'
import LeadEditInfoModal from './LeadEditInfoModal'
import KebabMenu from '@/components/ui/KebabMenu'
import PageTabs from '../PageTabs'
import { usePermissions } from '@/lib/usePermissions'

export type LeadStatus = 'new' | 'appointment_set' | 'sent_to_estimating' | 'unable_to_reach' | 'disqualified' | 'job_walk_scheduled'
export type LeadPushedTo = 'appointment' | 'job_walk' | 'estimating' | 'proposal' | 'job'

export interface Lead {
  id: string
  project_name: string
  company_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  project_address: string | null
  date: string | null
  status: LeadStatus
  category: string | null
  lead_source: string | null
  lead_category_id: string | null
  project_details: string | null
  measurements: string | null
  pushed_to: LeadPushedTo | null
  pushed_ref_id: string | null
  converted_to_project_id: string | null
  /**
   * Joined-in object from the PostgREST `select('*, converted_to_project:
   * estimating_projects!converted_to_project_id(project_number)')`. Used
   * by the Completed-tab badge to display "→ Project #XXXX". May be null
   * even when converted_to_project_id is non-null if the project was
   * deleted (the FK is ON DELETE SET NULL, so id resets to NULL in that
   * case — but PostgREST sometimes returns a stale shape; gate on both
   * fields).
   */
  converted_to_project?: { project_number: string | null } | null
  assigned_to: string | null
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
  { value: 'job_walk_scheduled', label: 'Job Walk Scheduled' },
  { value: 'sent_to_estimating', label: 'Sent to Estimating' },
  { value: 'unable_to_reach', label: 'Unable to Reach' },
  { value: 'disqualified', label: 'Disqualified' },
]

const LEAD_STATUS_COLORS: Record<LeadStatus, { bg: string; border: string; text: string }> = {
  new: { bg: 'rgba(156,163,175,0.22)', border: 'rgba(156,163,175,0.55)', text: '#d1d5db' },
  appointment_set: { bg: 'rgba(74,222,128,0.22)', border: 'rgba(74,222,128,0.55)', text: '#4ade80' },
  job_walk_scheduled: { bg: 'rgba(167,139,250,0.22)', border: 'rgba(167,139,250,0.55)', text: '#a78bfa' },
  sent_to_estimating: { bg: 'rgba(96,165,250,0.22)', border: 'rgba(96,165,250,0.55)', text: '#60a5fa' },
  unable_to_reach: { bg: 'rgba(251,191,36,0.22)', border: 'rgba(251,191,36,0.55)', text: '#fbbf24' },
  disqualified: { bg: 'rgba(248,113,113,0.22)', border: 'rgba(248,113,113,0.55)', text: '#f87171' },
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

export default function LeadsClient({
  initialLeads,
  initialCategories,
  userId,
  userRole,
}: LeadsClientProps) {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [categories] = useState<LeadCategory[]>(initialCategories)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [assignees, setAssignees] = useState<AppointmentAssigneeOption[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editLead, setEditLead] = useState<Lead | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ message: string; href?: string | null } | null>(null)
  const [tab, setTab] = useState<'new' | 'completed'>('new')

  function showToast(message: string, href?: string | null) {
    setToast({ message, href: href ?? null })
    setTimeout(() => setToast(null), 3500)
  }

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
    setLeads((prev) => prev.filter((l) => l.id !== confirmDelete.id))
    setDeleting(false)
    setConfirmDelete(null)
  }, [confirmDelete])

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

  // "All vs. mine" lead visibility was admin-only. Using user_management as
  // an admin-only proxy mirrors the default template (admin via shortcut).
  const { canEdit } = usePermissions()
  const isAdmin = canEdit('user_management')

  const assigneeMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of assignees) m.set(a.id, a.display_name || a.id.slice(0, 8))
    return m
  }, [assignees])

  const tabFiltered = useMemo(
    () =>
      filtered.filter((l) =>
        tab === 'new' ? l.status === 'new' : l.status !== 'new'
      ),
    [filtered, tab]
  )

  const myLeads = useMemo(
    () => (isAdmin ? tabFiltered.filter((l) => l.assigned_to === userId) : tabFiltered),
    [isAdmin, tabFiltered, userId]
  )

  const otherUserSections = useMemo(() => {
    if (!isAdmin) return []
    const others = tabFiltered.filter((l) => l.assigned_to !== userId)
    const grouped = new Map<string, Lead[]>()
    for (const l of others) {
      const key = l.assigned_to ?? '__unassigned__'
      const arr = grouped.get(key) ?? []
      arr.push(l)
      grouped.set(key, arr)
    }
    return Array.from(grouped.entries())
      .map(([uid, items]) => ({
        userId: uid,
        name: uid === '__unassigned__' ? 'Unassigned' : (assigneeMap.get(uid) ?? uid.slice(0, 8)),
        leads: items,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [isAdmin, tabFiltered, userId, assigneeMap])

  function handleLeadCreated(lead: Lead, newCustomer?: Customer | null) {
    setLeads((prev) => [lead, ...prev])
    if (newCustomer) {
      setCustomers((prev) => {
        if (prev.some((c) => c.id === newCustomer.id)) return prev
        return [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name))
      })
    }
    setShowAddModal(false)
    router.push(`/sales/leads/${lead.id}`)
  }

  function renderCard(lead: Lead) {
    const isDimmed = lead.status === 'disqualified'

    return (
      <div
        key={lead.id}
        className={`bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#2a2a2a] rounded-xl hover:border-gray-300 hover:shadow-sm transition-all ${
          isDimmed ? 'opacity-70' : ''
        }`}
      >
        {/* Card body — clicking navigates to the detail page */}
        <div
          onClick={() => router.push(`/sales/leads/${lead.id}`)}
          className="w-full text-left px-6 py-5 cursor-pointer"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span
                className={`text-[17px] font-medium text-gray-900 dark:text-white${
                  tab === 'completed' ? ' line-through' : ''
                }`}
              >
                {lead.project_name || 'Untitled Lead'}
              </span>
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
            <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
              {lead.converted_to_project_id && lead.converted_to_project && (
                <Link
                  href={`/estimating?customer=${lead.company_id}&project=${lead.converted_to_project_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5 transition"
                  title="View linked project"
                >
                  → Project #{lead.converted_to_project.project_number ?? '…'}
                </Link>
              )}
              <select
                value={lead.status}
                onChange={(e) => {
                  e.stopPropagation()
                  setLeadStatus(lead, e.target.value as LeadStatus)
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: LEAD_STATUS_COLORS[lead.status].bg,
                  borderColor: LEAD_STATUS_COLORS[lead.status].border,
                  color: LEAD_STATUS_COLORS[lead.status].text,
                }}
                className="text-[12px] font-medium border rounded-md px-2 py-1 max-w-[175px] cursor-pointer outline-none"
              >
                {LEAD_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <KebabMenu
                variant="light"
                items={[
                  {
                    label: 'Edit',
                    icon: <PencilIcon className="w-4 h-4" />,
                    onSelect: () => setEditLead(lead),
                  },
                  {
                    label: 'Delete',
                    icon: <Trash2Icon className="w-4 h-4" />,
                    destructive: true,
                    onSelect: () => setConfirmDelete(lead),
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

      <p className="text-sm text-gray-400 px-4 sm:px-6 pt-3">
        Track new leads and move them through the pipeline.
      </p>

      {/* Tabs */}
      <PageTabs<'new' | 'completed'>
        tabs={[
          { key: 'new', label: 'New Leads' },
          { key: 'completed', label: 'Completed' },
        ]}
        activeKey={tab}
        onChange={setTab}
      />

      {/* Card list */}
      <div className="px-4 sm:px-7 py-6">
        {tabFiltered.length === 0 ? (
          <div className="text-center py-14">
            <TargetIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {search
                ? 'No matching leads.'
                : tab === 'new'
                ? 'No new leads. Add one to get started.'
                : 'No completed leads yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {myLeads.map((lead) => renderCard(lead))}

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
                        ({section.leads.length})
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.leads.map((lead) => renderCard(lead))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddLeadModal
          userId={userId}
          isAdmin={isAdmin}
          customers={customers}
          categories={categories}
          assignees={assignees}
          onClose={() => setShowAddModal(false)}
          onCreated={handleLeadCreated}
        />
      )}

      {editLead && (
        <LeadEditInfoModal
          lead={editLead}
          customers={customers}
          assignees={assignees}
          categories={categories}
          isAdmin={isAdmin}
          onClose={() => setEditLead(null)}
          onSaved={(patch) => {
            handleUpdate(editLead.id, patch)
            setEditLead(null)
          }}
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
