'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileTextIcon,
  PlusIcon,
  Loader2Icon,
  SendIcon,
  CheckIcon,
  XIcon,
  MessageCircleIcon,
  PhoneIcon,
  MailIcon,
  MessageSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type {
  Customer,
  Proposal,
  ProposalFollowUp,
} from '@/components/proposals/types'
import type { EstimatingProject } from './types'
import SendProposalModal from './SendProposalModal'
import LogFollowUpModal from './LogFollowUpModal'

interface ProjectProposalsCardProps {
  project: EstimatingProject
  customer: Customer
  userId: string
}

type StatusFilter = 'All' | 'Draft' | 'Sent' | 'Accepted' | 'Declined'
const FILTERS: StatusFilter[] = ['All', 'Draft', 'Sent', 'Accepted', 'Declined']

function formatMoney(n: number): string {
  return `$${(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatShortDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function followUpIcon(type: ProposalFollowUp['follow_up_type']) {
  switch (type) {
    case 'call':
      return <PhoneIcon className="w-4 h-4" />
    case 'email':
      return <MailIcon className="w-4 h-4" />
    case 'text':
      return <MessageSquareIcon className="w-4 h-4" />
    default:
      return <MessageCircleIcon className="w-4 h-4" />
  }
}

function statusBadge(e: Proposal) {
  const base =
    'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap'
  if (e.status === 'Draft')
    return <span className={`${base} bg-gray-100 text-gray-600`}>Draft</span>
  if (e.status === 'Sent')
    return (
      <span className={`${base} bg-amber-100 text-amber-700`}>
        Sent{e.sent_at ? ` — ${formatShortDate(e.sent_at)}` : ''}
      </span>
    )
  if (e.status === 'Accepted')
    return (
      <span className={`${base} bg-green-100 text-green-700`}>
        Accepted{e.accepted_at ? ` — ${formatShortDate(e.accepted_at)}` : ''}
      </span>
    )
  if (e.status === 'Declined')
    return (
      <span className={`${base} bg-red-100 text-red-700`}>
        Declined{e.declined_at ? ` — ${formatShortDate(e.declined_at)}` : ''}
      </span>
    )
  return (
    <span className={`${base} bg-blue-100 text-blue-700`}>{e.status}</span>
  )
}

export default function ProjectProposalsCard({
  project,
  customer,
  userId,
}: ProjectProposalsCardProps) {
  const router = useRouter()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [followUpsByProposal, setFollowUpsByProposal] = useState<
    Record<string, ProposalFollowUp[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('All')
  const [sendingFor, setSendingFor] = useState<Proposal | null>(null)
  const [followingUpFor, setFollowingUpFor] = useState<Proposal | null>(null)
  const [expandedFollowUps, setExpandedFollowUps] = useState<
    Record<string, boolean>
  >({})
  const customerId = customer.id

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('proposals')
      .select('*')
      .eq('company_id', customerId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    const rows = (data as Proposal[]) ?? []
    setProposals(rows)

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id)
      const { data: fuData } = await supabase
        .from('proposal_follow_ups')
        .select('*')
        .in('proposal_id', ids)
        .order('created_at', { ascending: false })
      const grouped: Record<string, ProposalFollowUp[]> = {}
      ;((fuData as ProposalFollowUp[]) ?? []).forEach((f) => {
        if (!grouped[f.proposal_id]) grouped[f.proposal_id] = []
        grouped[f.proposal_id].push(f)
      })
      setFollowUpsByProposal(grouped)
    } else {
      setFollowUpsByProposal({})
    }
    setLoading(false)
  }, [customerId, userId])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  const counts: Record<StatusFilter, number> = {
    All: proposals.length,
    Draft: proposals.filter((e) => e.status === 'Draft' || !e.status).length,
    Sent: proposals.filter((e) => e.status === 'Sent').length,
    Accepted: proposals.filter((e) => e.status === 'Accepted').length,
    Declined: proposals.filter((e) => e.status === 'Declined').length,
  }

  const visible = proposals.filter((e) => {
    if (filter === 'All') return true
    if (filter === 'Draft') return e.status === 'Draft' || !e.status
    return e.status === filter
  })

  function patchLocal(id: string, patch: Partial<Proposal>) {
    setProposals((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    )
  }

  async function completePendingReminders() {
    const supabase = createClient()
    await supabase
      .from('estimating_reminders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .eq('status', 'pending')
  }

  async function handleMarkAccepted(e: Proposal) {
    const supabase = createClient()
    const now = new Date().toISOString()
    const patch: Partial<Proposal> = { status: 'Accepted', accepted_at: now }
    await supabase.from('proposals').update(patch).eq('id', e.id)
    patchLocal(e.id, patch)
    await completePendingReminders()
  }

  async function handleMarkDeclined(e: Proposal) {
    const supabase = createClient()
    const now = new Date().toISOString()
    const patch: Partial<Proposal> = { status: 'Declined', declined_at: now }
    await supabase.from('proposals').update(patch).eq('id', e.id)
    patchLocal(e.id, patch)
    await completePendingReminders()
  }

  function handleSent(proposal: Proposal, patch: Partial<Proposal>) {
    patchLocal(proposal.id, patch)
    setSendingFor(null)
  }

  function handleFollowUpCreated(proposal: Proposal, fu: ProposalFollowUp) {
    setFollowUpsByProposal((prev) => ({
      ...prev,
      [proposal.id]: [fu, ...(prev[proposal.id] ?? [])],
    }))
    setExpandedFollowUps((prev) => ({ ...prev, [proposal.id]: true }))
    setFollowingUpFor(null)
  }

  function toggleExpanded(proposalId: string) {
    setExpandedFollowUps((prev) => ({
      ...prev,
      [proposalId]: !prev[proposalId],
    }))
  }

  function handleNewProposal() {
    // The new editor handles the insert on first save, so this navigator no
    // longer creates a draft row on click. Pass project + customer so the
    // editor can pre-fill context and render the back-to-project link.
    router.push(
      `/estimating/proposals/new?project=${project.id}&customer=${customerId}`
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <FileTextIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">
            Proposals
            {project.project_number && (
              <span className="ml-2 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                #{project.project_number}
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={handleNewProposal}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition"
          >
            <PlusIcon className="w-4 h-4" />
            New proposal
          </button>
        </div>

        {!loading && proposals.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {FILTERS.map((f) => {
              const active = f === filter
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition whitespace-nowrap ${
                    active
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f} ({counts[f]})
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <div className="py-6 flex items-center justify-center text-gray-400">
            <Loader2Icon className="w-4 h-4 animate-spin" />
          </div>
        ) : proposals.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No proposals yet for this customer.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No proposals match this filter.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {visible.map((e) => {
              const followUps = followUpsByProposal[e.id] ?? []
              const isExpanded = expandedFollowUps[e.id] ?? false
              const isDraft = !e.status || e.status === 'Draft'
              const isSent = e.status === 'Sent'
              return (
                <div key={e.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/estimating/proposals/${e.id}?project=${project.id}`}
                      className="min-w-0 flex-1 group"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-amber-700 transition">
                        #{e.proposal_number}
                        {e.project_name ? ` · ${e.project_name}` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(e.date).toLocaleDateString()}
                      </p>
                    </Link>
                    {statusBadge(e)}
                    <span className="text-sm font-medium text-gray-900 tabular-nums">
                      {formatMoney(e.total)}
                    </span>
                    {isDraft && (
                      <button
                        type="button"
                        onClick={() => setSendingFor(e)}
                        title="Send proposal"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition"
                      >
                        <SendIcon className="w-4 h-4" />
                        Send
                      </button>
                    )}
                  </div>

                  {isSent && (
                    <div className="flex items-center gap-3 mt-2 pl-0.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleMarkAccepted(e)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
                      >
                        <CheckIcon className="w-4 h-4" />
                        Mark accepted
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkDeclined(e)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        <XIcon className="w-4 h-4" />
                        Mark declined
                      </button>
                      <button
                        type="button"
                        onClick={() => setFollowingUpFor(e)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                      >
                        <MessageCircleIcon className="w-4 h-4" />
                        Follow up
                      </button>
                    </div>
                  )}

                  {followUps.length > 0 && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(e.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 transition"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="w-3 h-3" />
                        ) : (
                          <ChevronRightIcon className="w-3 h-3" />
                        )}
                        {followUps.length} follow-up
                        {followUps.length === 1 ? '' : 's'}
                      </button>
                      {isExpanded && (
                        <div className="mt-1.5 space-y-1 pl-4 border-l-2 border-amber-100">
                          {followUps.map((f) => (
                            <div
                              key={f.id}
                              className="text-xs text-gray-600 py-1"
                            >
                              <div className="flex items-center gap-1.5 text-gray-700">
                                <span className="text-amber-600">
                                  {followUpIcon(f.follow_up_type)}
                                </span>
                                <span className="font-medium capitalize">
                                  {f.follow_up_type}
                                </span>
                                {f.contacted_name && (
                                  <>
                                    <span className="text-gray-300">·</span>
                                    <span>{f.contacted_name}</span>
                                  </>
                                )}
                                {f.outcome && (
                                  <>
                                    <span className="text-gray-300">·</span>
                                    <span className="capitalize text-gray-500">
                                      {f.outcome.replace(/_/g, ' ')}
                                    </span>
                                  </>
                                )}
                                <span className="ml-auto text-gray-400">
                                  {formatShortDate(f.created_at)}
                                </span>
                              </div>
                              {f.notes && (
                                <p className="text-gray-500 mt-0.5 line-clamp-2">
                                  {f.notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {sendingFor && (
        <SendProposalModal
          proposal={sendingFor}
          customer={customer}
          project={project}
          userId={userId}
          onClose={() => setSendingFor(null)}
          onSent={(patch) => handleSent(sendingFor, patch)}
        />
      )}

      {followingUpFor && (
        <LogFollowUpModal
          proposal={followingUpFor}
          customer={customer}
          project={project}
          userId={userId}
          onClose={() => setFollowingUpFor(null)}
          onCreated={(fu) => handleFollowUpCreated(followingUpFor, fu)}
        />
      )}
    </>
  )
}
