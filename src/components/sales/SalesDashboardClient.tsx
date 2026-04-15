'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  UsersIcon,
  PhoneIcon,
  CalendarIcon,
  TargetIcon,
  BarChart3Icon,
  BellIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PhoneCallIcon,
  MailIcon,
  VoicemailIcon,
  MessageSquareIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'
import type {
  ActivityWithComparison,
  OverdueContact,
  RecentActivityEntry,
  TeamMemberStats,
} from '@/lib/salesStats'

interface Props {
  userRole: UserRole
  companyCount: number
  contactCount: number
  upcomingApptCount: number
  activeLeadsCount: number
  weekActivity: ActivityWithComparison
  monthActivity: ActivityWithComparison
  overdueContacts: OverdueContact[]
  recentActivity: RecentActivityEntry[]
  teamStats: TeamMemberStats[]
}

export default function SalesDashboardClient({
  userRole,
  companyCount,
  contactCount,
  upcomingApptCount,
  activeLeadsCount,
  weekActivity,
  monthActivity,
  overdueContacts,
  recentActivity,
  teamStats,
}: Props) {
  const [overdueDismissed, setOverdueDismissed] = useState(false)
  const [overdueExpanded, setOverdueExpanded] = useState(false)
  const [activityFeed, setActivityFeed] = useState(recentActivity)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(recentActivity.length >= 20)

  async function loadMoreActivity() {
    setLoadingMore(true)
    const supabase = createClient()
    const offset = activityFeed.length
    const { data } = await supabase
      .from('crm_call_log')
      .select(
        'id, outcome, call_date, notes, created_by, company_id, ' +
          'crm_companies!inner(id, name), crm_contacts(first_name, last_name)'
      )
      .order('call_date', { ascending: false })
      .range(offset, offset + 19)

    type Row = {
      id: string
      outcome: string
      call_date: string
      notes: string | null
      created_by: string | null
      company_id: string
      crm_companies: { id: string; name: string } | null
      crm_contacts: { first_name: string; last_name: string } | null
    }
    const rows = ((data ?? []) as unknown as Row[])
    const creatorIds = [
      ...new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v)),
    ]
    const creatorNames = new Map<string, string>()
    if (creatorIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', creatorIds)
      for (const p of (profs ?? []) as Array<{
        id: string
        display_name: string | null
      }>) {
        creatorNames.set(p.id, p.display_name ?? 'Someone')
      }
    }
    const next: RecentActivityEntry[] = rows.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      call_date: r.call_date,
      notes: r.notes,
      created_by: r.created_by,
      creator_name: r.created_by ? creatorNames.get(r.created_by) ?? null : null,
      company_id: r.company_id,
      company_name: r.crm_companies?.name ?? 'Company',
      contact_name: r.crm_contacts
        ? `${r.crm_contacts.first_name} ${r.crm_contacts.last_name}`
        : null,
    }))
    setActivityFeed((prev) => [...prev, ...next])
    setLoadingMore(false)
    if (next.length < 20) setHasMore(false)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
      <p className="text-sm text-gray-500 mb-4">CRM, dialer, and appointments.</p>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <QuickActionCard
          href="/sales/crm"
          icon={<UsersIcon className="w-5 h-5" />}
          title="CRM"
          subtitle={`${companyCount} ${
            companyCount === 1 ? 'company' : 'companies'
          } · ${contactCount} ${contactCount === 1 ? 'contact' : 'contacts'}`}
        />
        <QuickActionCard
          href="/sales/dialer"
          icon={<PhoneIcon className="w-5 h-5" />}
          title="Dialer"
          subtitle="Start a call session"
        />
        <QuickActionCard
          href="/sales/appointments"
          icon={<CalendarIcon className="w-5 h-5" />}
          title="Appointments"
          subtitle={`${upcomingApptCount} upcoming`}
        />
        <QuickActionCard
          href="/sales/leads"
          icon={<TargetIcon className="w-5 h-5" />}
          title="Leads"
          subtitle={`${activeLeadsCount} active ${
            activeLeadsCount === 1 ? 'lead' : 'leads'
          }`}
        />
        <button
          onClick={() => {
            document
              .getElementById('activity-section')
              ?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="bg-white rounded-xl border border-gray-200 p-4 text-left transition-all hover:shadow-sm hover:border-gray-300 hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-500">
              <BarChart3Icon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">Activity</h3>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {weekActivity.current.calls}{' '}
            {weekActivity.current.calls === 1 ? 'call' : 'calls'} this week
          </p>
        </button>
      </div>

      {/* ── Overdue banner ── */}
      {!overdueDismissed && overdueContacts.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <BellIcon className="w-4 h-4 text-amber-600 flex-none" />
            <p className="text-sm font-medium text-amber-900 flex-1">
              {overdueContacts.length}{' '}
              {overdueContacts.length === 1 ? 'contact' : 'contacts'} haven&apos;t
              been called in 30+ days
            </p>
            <button
              onClick={() => setOverdueExpanded((v) => !v)}
              className="text-xs font-medium text-amber-800 hover:text-amber-900 inline-flex items-center gap-1"
            >
              {overdueExpanded ? 'Hide' : 'View list'}
              {overdueExpanded ? (
                <ChevronDownIcon className="w-3 h-3" />
              ) : (
                <ChevronRightIcon className="w-3 h-3" />
              )}
            </button>
            <button
              onClick={() => setOverdueDismissed(true)}
              className="text-amber-700 hover:text-amber-900 p-1 rounded"
              aria-label="Dismiss"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {overdueExpanded && (
            <div className="border-t border-amber-200 bg-white/50">
              <div className="divide-y divide-amber-100 max-h-96 overflow-y-auto">
                {overdueContacts.slice(0, 50).map((c) => (
                  <div
                    key={c.contact_id}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-amber-50/50 transition-colors"
                  >
                    <Link
                      href={`/sales/crm/${c.company_id}`}
                      className="min-w-0 block"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.company_name}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                        <span className="truncate">
                          {c.first_name} {c.last_name}
                        </span>
                        <span className="text-amber-700">
                          {c.last_call_date
                            ? `Last called ${formatDateShort(c.last_call_date)}`
                            : 'Never called'}
                        </span>
                        <span className="text-gray-400">
                          {c.days_since >= 9999
                            ? '—'
                            : `${c.days_since}d ago`}
                        </span>
                      </div>
                    </Link>
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors"
                      >
                        <PhoneCallIcon className="w-3 h-3" />
                        Call now
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── This week ── */}
      <div className="mt-6">
        <p className="text-[13px] font-medium text-gray-500 mb-2">This week</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Calls made"
            value={weekActivity.current.calls}
            prev={weekActivity.previous.calls}
            period="week"
          />
          <MetricCard
            label="Appointments set"
            value={weekActivity.current.appointments}
            prev={weekActivity.previous.appointments}
            period="week"
          />
          <MetricCard
            label="Conversions"
            value={weekActivity.current.conversions}
            prev={weekActivity.previous.conversions}
            period="week"
          />
          <MetricCard
            label="Pipeline value"
            value={weekActivity.current.pipelineValue}
            money
            noCompare
          />
        </div>
      </div>

      {/* ── This month ── */}
      <div className="mt-6">
        <p className="text-[13px] font-medium text-gray-500 mb-2">This month</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Calls made"
            value={monthActivity.current.calls}
            prev={monthActivity.previous.calls}
            period="month"
          />
          <MetricCard
            label="Appointments set"
            value={monthActivity.current.appointments}
            prev={monthActivity.previous.appointments}
            period="month"
          />
          <MetricCard
            label="Conversions"
            value={monthActivity.current.conversions}
            prev={monthActivity.previous.conversions}
            period="month"
          />
          <MetricCard
            label="Pipeline value"
            value={monthActivity.current.pipelineValue}
            money
            noCompare
          />
        </div>
      </div>

      {/* ── Team activity (admins only) ── */}
      {userRole === 'admin' && teamStats.length > 0 && (
        <div className="mt-6">
          <p className="text-[13px] font-medium text-gray-500 mb-2">Team activity</p>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="text-left font-normal px-4 py-3">User</th>
                    <th className="text-right font-normal px-3 py-3">Calls wk</th>
                    <th className="text-right font-normal px-3 py-3">Calls mo</th>
                    <th className="text-right font-normal px-3 py-3">Appts wk</th>
                    <th className="text-right font-normal px-3 py-3">Appts mo</th>
                    <th className="text-right font-normal px-3 py-3">Conv mo</th>
                    <th className="text-right font-normal px-4 py-3">Pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {teamStats.map((t) => (
                    <tr
                      key={t.user_id}
                      className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{t.display_name}</span>
                          <span className="text-[10px] uppercase tracking-wider text-gray-400">
                            {t.role.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700 tabular-nums">
                        {t.calls_week}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700 tabular-nums">
                        {t.calls_month}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700 tabular-nums">
                        {t.appts_week}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700 tabular-nums">
                        {t.appts_month}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700 tabular-nums">
                        {t.conversions_month}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatMoney(t.pipeline_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent activity feed ── */}
      <div id="activity-section" className="mt-6">
        <p className="text-[13px] font-medium text-gray-500 mb-2">Recent activity</p>
        {activityFeed.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-400 italic">No call activity yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="space-y-3">
              {activityFeed.map((e) => (
                <Link
                  key={e.id}
                  href={`/sales/crm/${e.company_id}`}
                  className="flex items-start gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-shrink-0 w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center relative">
                    <OutcomeIcon outcome={e.outcome} />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white ${outcomeDotColor(
                        e.outcome
                      )}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">
                      <span className="font-medium">
                        {e.creator_name ?? 'Someone'}
                      </span>{' '}
                      <span className="text-gray-500">
                        {outcomeVerb(e.outcome)}
                      </span>{' '}
                      {e.contact_name && (
                        <span className="font-medium">{e.contact_name}</span>
                      )}
                      {e.contact_name ? ' at ' : ''}
                      <span className="font-medium">{e.company_name}</span>
                    </p>
                    {e.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                        {e.notes}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {formatDateTime(e.call_date)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            {hasMore && (
              <div className="pt-3 mt-3 border-t border-gray-100 text-center">
                <button
                  onClick={loadMoreActivity}
                  disabled={loadingMore}
                  className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Subcomponents ── */

function QuickActionCard({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300 hover:bg-gray-50 cursor-pointer block"
    >
      <div className="flex items-center gap-2">
        <span className="text-amber-500">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">{title}</h3>
      </div>
      <p className="text-xs text-gray-500 mt-2">{subtitle}</p>
    </Link>
  )
}

function MetricCard({
  label,
  value,
  prev,
  period,
  money,
  noCompare,
}: {
  label: string
  value: number
  prev?: number
  period?: 'week' | 'month'
  money?: boolean
  noCompare?: boolean
}) {
  const display = money ? formatMoney(value) : String(value)
  let comparison: React.ReactNode = null
  if (!noCompare && prev != null) {
    const diff = value - prev
    if (diff > 0) {
      comparison = (
        <span className="text-[11px] text-emerald-600">
          +{diff} from last {period}
        </span>
      )
    } else if (diff < 0) {
      comparison = (
        <span className="text-[11px] text-red-600">
          {diff} from last {period}
        </span>
      )
    } else {
      comparison = (
        <span className="text-[11px] text-gray-400">Same as last {period}</span>
      )
    }
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3.5">
      <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-[24px] font-medium text-gray-900 mt-1 leading-tight tabular-nums">
        {display}
      </p>
      {comparison && <div className="mt-1">{comparison}</div>}
    </div>
  )
}

function OutcomeIcon({ outcome }: { outcome: string }) {
  const cls = 'w-4 h-4 text-gray-500'
  switch (outcome) {
    case 'connected':
      return <PhoneCallIcon className={cls} />
    case 'voicemail':
      return <VoicemailIcon className={cls} />
    case 'email_sent':
      return <MailIcon className={cls} />
    case 'text_sent':
      return <MessageSquareIcon className={cls} />
    default:
      return <PhoneIcon className={cls} />
  }
}

function outcomeDotColor(outcome: string): string {
  switch (outcome) {
    case 'connected':
      return 'bg-emerald-500'
    case 'voicemail':
      return 'bg-amber-500'
    case 'email_sent':
      return 'bg-blue-500'
    case 'text_sent':
      return 'bg-blue-500'
    case 'no_answer':
      return 'bg-gray-400'
    case 'busy':
      return 'bg-gray-400'
    case 'wrong_number':
      return 'bg-red-400'
    default:
      return 'bg-gray-300'
  }
}

function outcomeVerb(outcome: string): string {
  switch (outcome) {
    case 'connected':
      return 'called'
    case 'voicemail':
      return 'left a voicemail for'
    case 'email_sent':
      return 'emailed'
    case 'text_sent':
      return 'texted'
    case 'no_answer':
      return 'tried to reach'
    case 'busy':
      return 'got a busy line for'
    case 'wrong_number':
      return 'hit a wrong number for'
    default:
      return 'logged activity for'
  }
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
