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
import { DEFAULT_TERMS } from '@/components/estimates/types'
import type {
  Customer,
  Estimate,
  EstimateFollowUp,
} from '@/components/estimates/types'
import type {
  EstimatingProject,
  PipelineStage,
} from './types'
import SendEstimateModal from './SendEstimateModal'
import LogFollowUpModal from './LogFollowUpModal'

interface ProjectEstimatesCardProps {
  project: EstimatingProject
  customer: Customer
  userId: string
  onPatch: (patch: Partial<EstimatingProject>) => void
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

function followUpIcon(type: EstimateFollowUp['follow_up_type']) {
  switch (type) {
    case 'call':
      return <PhoneIcon className="w-3.5 h-3.5" />
    case 'email':
      return <MailIcon className="w-3.5 h-3.5" />
    case 'text':
      return <MessageSquareIcon className="w-3.5 h-3.5" />
    default:
      return <MessageCircleIcon className="w-3.5 h-3.5" />
  }
}

function statusBadge(e: Estimate) {
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

export default function ProjectEstimatesCard({
  project,
  customer,
  userId,
  onPatch,
}: ProjectEstimatesCardProps) {
  const router = useRouter()
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [followUpsByEstimate, setFollowUpsByEstimate] = useState<
    Record<string, EstimateFollowUp[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('All')
  const [sendingFor, setSendingFor] = useState<Estimate | null>(null)
  const [followingUpFor, setFollowingUpFor] = useState<Estimate | null>(null)
  const [expandedFollowUps, setExpandedFollowUps] = useState<
    Record<string, boolean>
  >({})
  const [creatingEstimate, setCreatingEstimate] = useState(false)

  const customerId = customer.id

  const fetchEstimates = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('estimates')
      .select('*')
      .eq('customer_id', customerId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    const rows = (data as Estimate[]) ?? []
    setEstimates(rows)

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id)
      const { data: fuData } = await supabase
        .from('estimate_follow_ups')
        .select('*')
        .in('estimate_id', ids)
        .order('created_at', { ascending: false })
      const grouped: Record<string, EstimateFollowUp[]> = {}
      ;((fuData as EstimateFollowUp[]) ?? []).forEach((f) => {
        if (!grouped[f.estimate_id]) grouped[f.estimate_id] = []
        grouped[f.estimate_id].push(f)
      })
      setFollowUpsByEstimate(grouped)
    } else {
      setFollowUpsByEstimate({})
    }
    setLoading(false)
  }, [customerId, userId])

  useEffect(() => {
    fetchEstimates()
  }, [fetchEstimates])

  const counts: Record<StatusFilter, number> = {
    All: estimates.length,
    Draft: estimates.filter((e) => e.status === 'Draft' || !e.status).length,
    Sent: estimates.filter((e) => e.status === 'Sent').length,
    Accepted: estimates.filter((e) => e.status === 'Accepted').length,
    Declined: estimates.filter((e) => e.status === 'Declined').length,
  }

  const visible = estimates.filter((e) => {
    if (filter === 'All') return true
    if (filter === 'Draft') return e.status === 'Draft' || !e.status
    return e.status === filter
  })

  function patchLocal(id: string, patch: Partial<Estimate>) {
    setEstimates((prev) =>
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

  async function moveToTerminalStage(target: 'Won' | 'Lost') {
    const supabase = createClient()
    const fromStage = project.pipeline_stage
    if (fromStage === target) return
    const { data: stagesData } = await supabase
      .from('pipeline_stages')
      .select('*')
      .order('display_order', { ascending: true })
    const stages = (stagesData as PipelineStage[]) ?? []
    const targetExists = stages.some((s) => s.name === target)
    if (!targetExists) return

    const projectPatch: Partial<EstimatingProject> = { pipeline_stage: target }
    if (target === 'Won') projectPatch.status = 'completed'
    if (target === 'Lost') projectPatch.status = 'on_hold'
    await supabase
      .from('estimating_projects')
      .update(projectPatch)
      .eq('id', project.id)
    await supabase.from('pipeline_history').insert({
      project_id: project.id,
      from_stage: fromStage,
      to_stage: target,
      changed_by: userId,
    })
    onPatch(projectPatch)
  }

  async function handleMarkAccepted(e: Estimate) {
    const supabase = createClient()
    const now = new Date().toISOString()
    const patch: Partial<Estimate> = { status: 'Accepted', accepted_at: now }
    await supabase.from('estimates').update(patch).eq('id', e.id)
    patchLocal(e.id, patch)
    await moveToTerminalStage('Won')
    await completePendingReminders()
  }

  async function handleMarkDeclined(e: Estimate) {
    const supabase = createClient()
    const now = new Date().toISOString()
    const patch: Partial<Estimate> = { status: 'Declined', declined_at: now }
    await supabase.from('estimates').update(patch).eq('id', e.id)
    patchLocal(e.id, patch)
    await moveToTerminalStage('Lost')
    await completePendingReminders()
  }

  function handleSent(
    estimate: Estimate,
    patch: Partial<Estimate>,
    pipelinePatch?: Partial<EstimatingProject>
  ) {
    patchLocal(estimate.id, patch)
    if (pipelinePatch) onPatch(pipelinePatch)
    setSendingFor(null)
  }

  function handleFollowUpCreated(estimate: Estimate, fu: EstimateFollowUp) {
    setFollowUpsByEstimate((prev) => ({
      ...prev,
      [estimate.id]: [fu, ...(prev[estimate.id] ?? [])],
    }))
    setExpandedFollowUps((prev) => ({ ...prev, [estimate.id]: true }))
    setFollowingUpFor(null)
  }

  function toggleExpanded(estimateId: string) {
    setExpandedFollowUps((prev) => ({
      ...prev,
      [estimateId]: !prev[estimateId],
    }))
  }

  async function handleNewEstimate() {
    if (creatingEstimate) return
    setCreatingEstimate(true)
    const supabase = createClient()

    // Default estimate_number to numeric portion of project_number when possible.
    let estimateNumber: number | null = null
    if (project.project_number) {
      const match = project.project_number.match(/(\d+)/)
      if (match) estimateNumber = parseInt(match[1], 10)
    }
    if (estimateNumber == null) {
      const { data: settings } = await supabase
        .from('estimate_settings')
        .select('next_estimate_number')
        .eq('user_id', userId)
        .maybeSingle()
      estimateNumber = (settings as { next_estimate_number?: number } | null)?.next_estimate_number ?? 1000
      await supabase
        .from('estimate_settings')
        .update({ next_estimate_number: estimateNumber + 1 })
        .eq('user_id', userId)
    }

    // Pre-fill defaults from estimate_form_settings (admin-configured).
    const { data: formSettings } = await supabase
      .from('estimate_form_settings')
      .select('default_terms, default_notes, default_tax_rate, default_salesperson_id')
      .limit(1)
      .maybeSingle()
    let defaultSalespersonName = ''
    if (formSettings?.default_salesperson_id) {
      const { data: spProfile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', formSettings.default_salesperson_id)
        .maybeSingle()
      defaultSalespersonName =
        (spProfile as { display_name?: string | null } | null)?.display_name ??
        ''
    }

    const { data, error } = await supabase
      .from('estimates')
      .insert({
        estimate_number: estimateNumber,
        customer_id: customerId,
        date: new Date().toISOString().split('T')[0],
        project_name: project.name || '',
        description: '',
        salesperson: defaultSalespersonName,
        line_items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        terms: formSettings?.default_terms ?? DEFAULT_TERMS,
        notes: formSettings?.default_notes ?? '',
        status: 'Draft',
        user_id: userId,
      })
      .select('id')
      .single()

    setCreatingEstimate(false)
    if (error || !data) {
      console.error('[ProjectEstimatesCard] create estimate failed:', error)
      return
    }
    router.push(
      `/estimates?customer=${customerId}&estimate=${data.id}&from=estimating&project=${project.id}`
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
            Estimates
            {project.project_number && (
              <span className="ml-2 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                #{project.project_number}
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={handleNewEstimate}
            disabled={creatingEstimate}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition disabled:opacity-60"
          >
            {creatingEstimate ? (
              <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlusIcon className="w-3.5 h-3.5" />
            )}
            New estimate
          </button>
        </div>

        {!loading && estimates.length > 0 && (
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
        ) : estimates.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No estimates yet for this customer.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            No estimates match this filter.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {visible.map((e) => {
              const followUps = followUpsByEstimate[e.id] ?? []
              const isExpanded = expandedFollowUps[e.id] ?? false
              const isDraft = !e.status || e.status === 'Draft'
              const isSent = e.status === 'Sent'
              return (
                <div key={e.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/estimates?customer=${customerId}&estimate=${e.id}&from=estimating&project=${project.id}`}
                      className="min-w-0 flex-1 group"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:text-amber-700 transition">
                        #{e.estimate_number}
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
                        title="Send estimate"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition"
                      >
                        <SendIcon className="w-3.5 h-3.5" />
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
                        <CheckIcon className="w-3.5 h-3.5" />
                        Mark accepted
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkDeclined(e)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                        Mark declined
                      </button>
                      <button
                        type="button"
                        onClick={() => setFollowingUpFor(e)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
                      >
                        <MessageCircleIcon className="w-3.5 h-3.5" />
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
        <SendEstimateModal
          estimate={sendingFor}
          customer={customer}
          project={project}
          userId={userId}
          onClose={() => setSendingFor(null)}
          onSent={(patch, pipelinePatch) =>
            handleSent(sendingFor, patch, pipelinePatch)
          }
        />
      )}

      {followingUpFor && (
        <LogFollowUpModal
          estimate={followingUpFor}
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
