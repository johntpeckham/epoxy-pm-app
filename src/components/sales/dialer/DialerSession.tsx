'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MessageSquareIcon,
  MailIcon,
  FileTextIcon,
  ArrowRightIcon,
  XIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CopyIcon,
  CheckIcon,
  UsersIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import NewAppointmentModal, {
  type AppointmentCompanyOption,
  type AppointmentContactOption,
  type AppointmentAssigneeOption,
} from '../NewAppointmentModal'
import {
  type QueuedCompany,
  type SessionStats,
  type OutcomeValue,
  OUTCOME_OPTIONS,
  outcomeToCallLog,
  initials,
  formatDate,
  getActiveContact,
  sortPhones,
  PHONE_TYPE_LABEL,
} from './dialerTypes'
import {
  type CallTemplateRow,
  TEMPLATE_TYPE_LABELS,
} from '../CallTemplateModal'

interface DialerSessionProps {
  userId: string
  queue: QueuedCompany[]
  onEnd: () => void
  onComplete: (stats: SessionStats) => void
}

interface RecentCall {
  id: string
  outcome: string
  call_date: string
  notes: string | null
}

interface RecentComment {
  id: string
  content: string
  created_at: string
}

const EMPTY_STATS: SessionStats = {
  total: 0,
  connected: 0,
  voicemail: 0,
  no_answer: 0,
  busy: 0,
  wrong_number: 0,
  appointment: 0,
  skipped: 0,
}

export default function DialerSession({
  userId,
  queue,
  onEnd,
  onComplete,
}: DialerSessionProps) {
  const supabase = useMemo(() => createClient(), [])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  // Per-company override: which contact the rep has switched to mid-session.
  // Keyed by company_id; value is the selected contact_id. Falls back to each
  // entry's initial `activeContactId` when not present.
  const [activeOverrides, setActiveOverrides] = useState<Map<string, string>>(
    new Map()
  )
  const [outcome, setOutcome] = useState<OutcomeValue | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState<SessionStats>({
    ...EMPTY_STATS,
    total: queue.length,
  })

  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [showOutcomePrompt, setShowOutcomePrompt] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)

  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([])
  const [recentComment, setRecentComment] = useState<RecentComment | null>(null)
  const [sidebarLoading, setSidebarLoading] = useState(false)

  const [templates, setTemplates] = useState<CallTemplateRow[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)

  const [toast, setToast] = useState<string | null>(null)

  // Appointment modal data
  const [apptCompanies, setApptCompanies] = useState<AppointmentCompanyOption[]>([])
  const [apptContacts, setApptContacts] = useState<AppointmentContactOption[]>([])
  const [apptAssignees, setApptAssignees] = useState<AppointmentAssigneeOption[]>([])

  const current = queue[currentIndex]
  const isLast = currentIndex === queue.length - 1
  // Resolve active contact: rep's override first, otherwise the entry's initial
  // activeContactId, otherwise the first contact in the list.
  const activeContact = useMemo(() => {
    if (!current) return null
    const overrideId = activeOverrides.get(current.company_id)
    if (overrideId) {
      const hit = current.contacts.find((c) => c.id === overrideId)
      if (hit) return hit
    }
    return getActiveContact(current)
  }, [current, activeOverrides])
  const activePhones = useMemo(
    () => (activeContact ? sortPhones(activeContact.phones) : []),
    [activeContact]
  )
  const otherContacts = useMemo(() => {
    if (!current || !activeContact) return []
    return current.contacts.filter((c) => c.id !== activeContact.id)
  }, [current, activeContact])

  function switchActiveContact(contactId: string) {
    if (!current) return
    setActiveOverrides((prev) => {
      const next = new Map(prev)
      next.set(current.company_id, contactId)
      return next
    })
  }

  // Transient toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  // Load sidebar data for the current contact's company
  useEffect(() => {
    if (!current) return
    let cancelled = false
    setSidebarLoading(true)
    setRecentCalls([])
    setRecentComment(null)

    async function load() {
      const companyId = current.company_id
      const [{ data: calls }, { data: comments }] = await Promise.all([
        supabase
          .from('crm_call_log')
          .select('id, outcome, call_date, notes')
          .eq('company_id', companyId)
          .order('call_date', { ascending: false })
          .limit(3),
        supabase
          .from('crm_comments')
          .select('id, content, created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(1),
      ])
      if (cancelled) return
      setRecentCalls((calls ?? []) as RecentCall[])
      setRecentComment(((comments ?? [])[0] as RecentComment) ?? null)
      setSidebarLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [current, supabase])

  // Reset form when current changes
  useEffect(() => {
    setOutcome(null)
    setNotes('')
  }, [currentIndex])

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('crm_call_templates')
      .select('id, name, type, content')
      .order('created_at', { ascending: false })
    setTemplates((data ?? []) as CallTemplateRow[])
    setTemplatesLoaded(true)
  }, [supabase])

  useEffect(() => {
    if (showTemplates && !templatesLoaded) loadTemplates()
  }, [showTemplates, templatesLoaded, loadTemplates])

  // Load appointment modal data once, lazily
  const loadAppointmentData = useCallback(async () => {
    const [
      { data: comps, error: compErr },
      { data: cts, error: ctErr },
      { data: profs, error: profErr },
    ] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, city, state')
        .eq('archived', false)
        .neq('status', 'active')
        .order('name', { ascending: true }),
      supabase
        .from('contacts')
        .select('id, company_id, first_name, last_name, phone, email, is_primary')
        .order('last_name', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, display_name')
        .order('display_name', { ascending: true }),
    ])
    if (compErr) {
      console.error('[DIALER SESSION COMPANIES FETCH ERROR]', {
        code: compErr.code,
        message: compErr.message,
        hint: compErr.hint,
        details: compErr.details,
      })
    }
    if (ctErr) {
      console.error('[DIALER SESSION CONTACTS FETCH ERROR]', {
        code: ctErr.code,
        message: ctErr.message,
        hint: ctErr.hint,
        details: ctErr.details,
      })
    }
    if (profErr) {
      console.error('[DIALER SESSION PROFILES FETCH ERROR]', {
        code: profErr.code,
        message: profErr.message,
        hint: profErr.hint,
        details: profErr.details,
      })
    }
    setApptCompanies((comps ?? []) as AppointmentCompanyOption[])
    setApptContacts((cts ?? []) as AppointmentContactOption[])
    setApptAssignees((profs ?? []) as AppointmentAssigneeOption[])
  }, [supabase])

  async function openAppointment() {
    if (apptCompanies.length === 0) await loadAppointmentData()
    setShowAppointmentModal(true)
  }

  function advance() {
    if (currentIndex >= queue.length - 1) {
      // last — compute completion
      onComplete(stats)
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }

  async function saveAndAdvance() {
    if (!current || !activeContact) return
    if (!outcome) {
      setShowOutcomePrompt(true)
      return
    }
    setSaving(true)
    const loggedOutcome = outcomeToCallLog(outcome)
    const { error } = await supabase.from('crm_call_log').insert({
      company_id: current.company_id,
      contact_id: activeContact.id,
      outcome: loggedOutcome,
      notes: notes.trim() || null,
      call_date: new Date().toISOString(),
      created_by: userId,
    })
    setSaving(false)
    if (error) {
      setToast('Error saving — ' + error.message)
      return
    }
    // Update stats
    setStats((prev) => {
      const next = { ...prev }
      if (outcome === 'appointment') next.appointment += 1
      else next[outcome] += 1
      if (outcome === 'appointment') next.connected += 1
      return next
    })
    setCompletedIds((prev) => new Set(prev).add(current.company_id))

    // If appointment selected, open the appointment modal after saving the call.
    if (outcome === 'appointment') {
      await openAppointment()
      return // appointment modal onSaved / onClose will advance
    }
    advance()
  }

  function skip() {
    setStats((prev) => ({ ...prev, skipped: prev.skipped + 1 }))
    advance()
  }

  async function copyTemplate(content: string, id: string) {
    try {
      await navigator.clipboard.writeText(content)
      setToast('Copied template')
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setToast('Could not copy')
    }
  }
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (!current) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">No contacts in queue.</p>
      </div>
    )
  }

  const progressPct = Math.round((currentIndex / Math.max(1, queue.length)) * 100)

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-[#1a1a1a] min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 space-y-4">
          {/* Session bar card */}
          <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] px-5 py-3 flex items-center gap-4">
            <button
              onClick={() => setShowEndConfirm(true)}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              End session
            </button>
            <div className="flex-1 flex items-center gap-3">
              <span className="text-xs text-gray-500 tabular-nums">
                {currentIndex + 1} of {queue.length}
              </span>
              <div className="flex-1 h-[3px] bg-gray-100 dark:bg-[#333] rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 transition-all duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <button
              onClick={skip}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={saveAndAdvance}
              disabled={saving}
              className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-full disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isLast ? 'Finish' : 'Next contact'}
              {!saving && <ArrowRightIcon className="w-3 h-3" />}
            </button>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            {/* Left column */}
            <div className="space-y-4">
              {/* Contact card */}
              <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-6">
            {/* Avatar */}
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 text-base font-medium mb-4">
                {activeContact ? initials(activeContact.first_name, activeContact.last_name) : ''}
              </div>
              <h2 className="text-[22px] font-medium text-gray-900 leading-tight">
                {activeContact?.first_name} {activeContact?.last_name}
              </h2>
              {activeContact?.job_title && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {activeContact.job_title}
                </p>
              )}
              <p className="text-[13px] text-gray-400 mt-0.5">
                {current.company_name}
              </p>
              {activeContact?.email && (
                <p className="text-[13px] text-gray-500 mt-2">
                  {activeContact.email}
                </p>
              )}

              {/* Phone list */}
              {activePhones.length > 0 && (
                <div className="mt-3 w-full max-w-[340px] space-y-1.5">
                  {activePhones.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setToast(`Calling ${p.phone_number} — coming soon`)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="tabular-nums text-gray-700">
                        {p.phone_number}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 px-2 py-0.5 bg-gray-50 rounded-full">
                        {PHONE_TYPE_LABEL[p.phone_type]}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-5 flex items-center justify-center gap-2">
                <button
                  onClick={() => setToast('Text — coming soon')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
                >
                  <MessageSquareIcon className="w-3.5 h-3.5" />
                  Text
                </button>
                <button
                  onClick={() => setToast('Email — coming soon')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
                >
                  <MailIcon className="w-3.5 h-3.5" />
                  Email
                </button>
              </div>
            </div>

              </div>

              {/* Outcome + Notes card */}
              <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-6">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-3">
                  Outcome
                </p>
                <div className="flex flex-wrap gap-2">
                  {OUTCOME_OPTIONS.map((opt) => {
                    const isActive = outcome === opt.value
                    const isAppointment = opt.value === 'appointment'
                    const activeClass = isAppointment
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-teal-50 border-teal-200 text-teal-800'
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setOutcome(opt.value)}
                        className={`px-4 py-1.5 text-xs rounded-full border transition-colors ${
                          isActive
                            ? activeClass
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                <label className="block text-[11px] uppercase tracking-wide text-gray-400 mt-6 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Quick notes from the conversation…"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                />

                <div className="mt-4">
                  <button
                    onClick={() => setShowTemplates(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    <FileTextIcon className="w-3.5 h-3.5" />
                    Templates
                  </button>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {/* Other contacts at this company */}
              {otherContacts.length > 0 && (
                <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2.5 flex items-center gap-1.5">
                    <UsersIcon className="w-3 h-3" />
                    Other contacts at this company
                  </p>
                  <ul className="space-y-2">
                    {otherContacts.map((oc) => (
                      <li
                        key={oc.id}
                        className="flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-gray-900 truncate">
                            {oc.first_name} {oc.last_name}
                          </div>
                          {oc.job_title && (
                            <div className="text-[11px] text-gray-400 truncate">
                              {oc.job_title}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => switchActiveContact(oc.id)}
                          className="flex-shrink-0 text-[11px] text-teal-700 hover:text-teal-900 border border-teal-100 hover:border-teal-300 px-2 py-1 rounded-full transition-colors"
                        >
                          Use this contact
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Company card */}
              <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">
                  Company
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {current.company_name}
                </p>
                {current.company_industry && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {current.company_industry}
                  </p>
                )}
                {(current.company_city || current.company_state) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[current.company_city, current.company_state]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                {current.company_priority && (
                  <span
                    className={`inline-block mt-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      current.company_priority === 'high'
                        ? 'bg-red-50 text-red-700'
                        : current.company_priority === 'medium'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {current.company_priority} priority
                  </span>
                )}
              </div>

              {/* Last Activity card */}
              <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
                  Last activity
                </p>
                {sidebarLoading ? (
                  <p className="text-xs text-gray-400 italic">Loading…</p>
                ) : recentCalls.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No calls yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {recentCalls.map((c) => (
                      <li key={c.id} className="text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="capitalize text-gray-700">
                            {c.outcome.replace(/_/g, ' ')}
                          </span>
                          <span className="text-gray-400 tabular-nums">
                            {formatDate(c.call_date)}
                          </span>
                        </div>
                        {c.notes && (
                          <p className="text-gray-500 mt-0.5 line-clamp-2">
                            {c.notes}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* CRM Notes card */}
              <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
                  Notes
                </p>
                {sidebarLoading ? (
                  <p className="text-xs text-gray-400 italic">Loading…</p>
                ) : !recentComment ? (
                  <p className="text-xs text-gray-400 italic">No notes.</p>
                ) : (
                  <div className="text-xs text-gray-600">
                    <p className="line-clamp-4 whitespace-pre-wrap leading-relaxed">
                      {recentComment.content}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {formatDate(recentComment.created_at, true)}
                    </p>
                  </div>
                )}
              </div>

              {/* Queue card */}
              <div className="bg-white dark:bg-[#242424] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
                  Queue
                </p>
                <ul className="space-y-1">
                  {queue.map((q, idx) => {
                    const isCurrent = idx === currentIndex
                    const isDone = completedIds.has(q.company_id)
                    const overrideId = activeOverrides.get(q.company_id)
                    const ac =
                      (overrideId && q.contacts.find((c) => c.id === overrideId)) ||
                      q.contacts.find((c) => c.id === q.activeContactId) ||
                      q.contacts[0]
                    return (
                      <li
                        key={q.company_id}
                        className={`text-xs flex items-center gap-2 px-2 py-1 rounded ${
                          isDone
                            ? 'text-gray-300 line-through'
                            : isCurrent
                              ? 'text-amber-700 font-medium bg-amber-50'
                              : 'text-gray-500'
                        }`}
                      >
                        {isCurrent && (
                          <ChevronRightIcon className="w-3 h-3 text-amber-500 flex-none" />
                        )}
                        <span className="truncate flex-1">
                          {ac?.first_name} {ac?.last_name}
                        </span>
                        {q.contacts.length > 1 && (
                          <UsersIcon className="w-3 h-3 text-gray-300 flex-none" />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* End session confirm */}
      {showEndConfirm && (
        <ConfirmDialog
          title="End session?"
          message="Your progress so far is saved. You can start a new session anytime."
          confirmLabel="End session"
          onConfirm={() => {
            setShowEndConfirm(false)
            onEnd()
          }}
          onCancel={() => setShowEndConfirm(false)}
          variant="default"
        />
      )}

      {/* No-outcome prompt */}
      {showOutcomePrompt && (
        <ConfirmDialog
          title="No outcome selected"
          message="Please pick an outcome before moving on — or use Skip if you didn't reach them."
          confirmLabel="Got it"
          onConfirm={() => setShowOutcomePrompt(false)}
          onCancel={() => setShowOutcomePrompt(false)}
          variant="default"
        />
      )}

      {/* Templates viewer */}
      {showTemplates && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
            onClick={() => setShowTemplates(false)}
          >
            <div
              className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
                style={{ minHeight: '56px' }}
              >
                <h3 className="text-base font-bold text-gray-900">Templates</h3>
                <button
                  onClick={() => setShowTemplates(false)}
                  className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {!templatesLoaded ? (
                  <p className="text-xs text-gray-400 italic p-3">Loading…</p>
                ) : templates.length === 0 ? (
                  <p className="text-xs text-gray-400 italic p-3">
                    No templates yet.
                  </p>
                ) : (
                  templates.map((t) => (
                    <TemplateItem
                      key={t.id}
                      template={t}
                      copied={copiedId === t.id}
                      onCopy={() => copyTemplate(t.content, t.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Appointment modal (after outcome=appointment) */}
      {showAppointmentModal && (
        <NewAppointmentModal
          userId={userId}
          companies={apptCompanies}
          contacts={apptContacts}
          assignees={apptAssignees}
          prefill={{
            companyId: current.company_id,
            contactId: activeContact?.id ?? null,
          }}
          onClose={() => {
            setShowAppointmentModal(false)
            advance()
          }}
          onSaved={() => {
            setShowAppointmentModal(false)
            setToast('Appointment set')
            advance()
          }}
        />
      )}
    </div>
  )
}

function TemplateItem({
  template,
  copied,
  onCopy,
}: {
  template: CallTemplateRow
  copied: boolean
  onCopy: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 flex items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-gray-900 truncate">
            {template.name}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-gray-400 px-2 py-0.5 bg-gray-50 rounded-full">
            {TEMPLATE_TYPE_LABELS[template.type]}
          </span>
        </button>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded"
          title="Copy"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      {open && (
        <div className="px-4 pb-3 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed border-t border-gray-100 pt-3">
          {template.content}
        </div>
      )}
    </div>
  )
}
