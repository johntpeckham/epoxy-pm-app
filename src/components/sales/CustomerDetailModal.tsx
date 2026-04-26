'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { XIcon, PlusIcon, PhoneIcon, MailIcon, MapPinIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

interface CustomerSummary {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
}

interface ProposalRow {
  id: string
  // DB column kept as proposal_number until Phase 4.
  proposal_number: number
  project_name: string | null
  total: number | null
  status: string | null
  created_at: string
}

interface ProjectRow {
  id: string
  name: string
  status: string
  created_at: string
}

interface CallLogRow {
  id: string
  outcome: string | null
  notes: string | null
  call_date: string
}

interface CustomerDetailModalProps {
  customer: CustomerSummary
  onClose: () => void
  onToast?: (msg: string) => void
}

export default function CustomerDetailModal({
  customer,
  onClose,
  onToast,
}: CustomerDetailModalProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [proposals, setProposals] = useState<ProposalRow[]>([])
  const [jobs, setJobs] = useState<ProjectRow[]>([])
  const [calls, setCalls] = useState<CallLogRow[]>([])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const [estRes, projRes, estProjRes] = await Promise.all([
        supabase
          .from('proposals')
          .select('id, proposal_number, project_name, total, status, created_at')
          .eq('company_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('projects')
          .select('id, name, status, created_at')
          .eq('company_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('estimating_projects')
          .select('id, name, status, created_at')
          .eq('company_id', customer.id)
          .order('created_at', { ascending: false }),
      ])

      let nextCalls: CallLogRow[] = []
      const nameLower = customer.name.trim().toLowerCase()
      if (nameLower) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name')
          .ilike('name', nameLower)
        const companyIds = (companies ?? [])
          .filter((c) => (c.name ?? '').trim().toLowerCase() === nameLower)
          .map((c) => c.id)
        if (companyIds.length > 0) {
          const { data: callRows } = await supabase
            .from('crm_call_log')
            .select('id, outcome, notes, call_date')
            .in('company_id', companyIds)
            .order('call_date', { ascending: false })
            .limit(20)
          nextCalls = (callRows as CallLogRow[] | null) ?? []
        }
      }

      if (cancelled) return
      setProposals((estRes.data as ProposalRow[] | null) ?? [])
      const projects = (projRes.data as ProjectRow[] | null) ?? []
      const estimatingProjects = (estProjRes.data as ProjectRow[] | null) ?? []
      setJobs([...projects, ...estimatingProjects])
      setCalls(nextCalls)
      setLoading(false)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [customer.id, customer.name, supabase])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function formatDate(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function formatCurrency(n: number | null): string {
    if (n === null || n === undefined) return '—'
    return `$${n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }

  const cityState = [customer.city, customer.state].filter(Boolean).join(', ')

  async function handleCreateLead() {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        city: customer.city,
        state: customer.state,
        status: 'new',
      })
      .select('id')
      .single()
    if (error) {
      onToast?.(`Failed to create lead: ${error.message}`)
      return
    }
    onToast?.('Lead created')
    if (data?.id) router.push(`/sales/leads?lead=${data.id}`)
    else router.push('/sales/leads')
  }

  function handleCreateProposal() {
    router.push(`/sales/estimating?customer=${customer.id}`)
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-medium text-gray-900 truncate">
                {customer.name}
              </h2>
              {customer.company && (
                <p className="text-sm text-gray-500 truncate">{customer.company}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                {customer.email && (
                  <span className="inline-flex items-center gap-1">
                    <MailIcon className="w-3 h-3" />
                    {customer.email}
                  </span>
                )}
                {customer.phone && (
                  <span className="inline-flex items-center gap-1">
                    <PhoneIcon className="w-3 h-3" />
                    {customer.phone}
                  </span>
                )}
                {cityState && (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="w-3 h-3" />
                    {cityState}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {loading ? (
              <div className="text-sm text-gray-400 text-center py-6">Loading…</div>
            ) : (
              <>
                {/* Jobs */}
                <section>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Job history ({jobs.length})
                  </h3>
                  {jobs.length === 0 ? (
                    <p className="text-xs text-gray-400">No jobs yet.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                      {jobs.slice(0, 10).map((j) => (
                        <li
                          key={j.id}
                          className="px-3 py-2 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{j.name}</p>
                            <p className="text-[11px] text-gray-400">
                              {formatDate(j.created_at)}
                            </p>
                          </div>
                          <span className="text-[11px] text-gray-500 shrink-0">
                            {j.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Proposals */}
                <section>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Proposal history ({proposals.length})
                  </h3>
                  {proposals.length === 0 ? (
                    <p className="text-xs text-gray-400">No proposals yet.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                      {proposals.slice(0, 10).map((e) => (
                        <li
                          key={e.id}
                          className="px-3 py-2 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">
                              #{e.proposal_number}
                              {e.project_name ? ` — ${e.project_name}` : ''}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {formatDate(e.created_at)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-gray-700">
                              {formatCurrency(e.total)}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {e.status ?? '—'}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Calls */}
                <section>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Call log ({calls.length})
                  </h3>
                  {calls.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      No call history.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                      {calls.slice(0, 10).map((c) => (
                        <li key={c.id} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-gray-900">
                              {c.outcome ?? 'Call'}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {formatDate(c.call_date)}
                            </p>
                          </div>
                          {c.notes && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {c.notes}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <button
              onClick={handleCreateLead}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Create new lead
            </button>
            <button
              onClick={handleCreateProposal}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Create new proposal
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
