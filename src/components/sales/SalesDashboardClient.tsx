'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  TrendingUpIcon,
  UsersIcon,
  PhoneIcon,
  MailIcon,
  CalendarIcon,
  TargetIcon,
  FootprintsIcon,
  CalculatorIcon,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/usePermissions'
import type { FeatureKey } from '@/lib/featureKeys'
import {
  fetchTeamOverview,
  hasAnyActivity,
  type SalesmanStats,
  type TeamOverview,
  type TimeRange,
} from '@/lib/salesTeamStats'

interface Props {
  initialRange: TimeRange
  initialOverview: TeamOverview
}

const NAV_BUTTONS: { label: string; href: string; icon: typeof UsersIcon; feature: FeatureKey }[] = [
  { label: 'CRM',          href: '/sales/crm',          icon: UsersIcon,       feature: 'crm' },
  { label: 'Dialer',       href: '/sales/dialer',       icon: PhoneIcon,       feature: 'dialer' },
  { label: 'Emailer',      href: '/sales/emailer',      icon: MailIcon,        feature: 'emailer' },
  { label: 'Appointments', href: '/sales/appointments', icon: CalendarIcon,    feature: 'appointments' },
  { label: 'Leads',        href: '/sales/leads',        icon: TargetIcon,      feature: 'leads' },
  { label: 'Job Walk',     href: '/job-walk',           icon: FootprintsIcon,  feature: 'job_walk' },
  { label: 'Estimating',   href: '/sales/estimating',   icon: CalculatorIcon,  feature: 'estimating' },
]

const RANGES: { value: TimeRange; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

export default function SalesDashboardClient({
  initialRange,
  initialOverview,
}: Props) {
  const { canView } = usePermissions()
  const visibleButtons = NAV_BUTTONS.filter((btn) => canView(btn.feature))
  const [range, setRange] = useState<TimeRange>(initialRange)
  const [overview, setOverview] = useState<TeamOverview>(initialOverview)
  const [isPending, startTransition] = useTransition()

  const dateLabel = useMemo(
    () => formatRangeLabel(overview.range.displayStart, overview.range.displayEnd),
    [overview.range.displayStart, overview.range.displayEnd]
  )

  async function switchRange(next: TimeRange) {
    if (next === range) return
    setRange(next)
    const supabase = createClient()
    const data = await fetchTeamOverview(supabase, next)
    startTransition(() => setOverview(data))
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="flex items-center px-4 sm:px-6 pt-4 pb-2">
        <TrendingUpIcon className="w-5 h-5 text-gray-400" />
        <h1 className="ml-2 text-2xl font-bold text-gray-900">Sales</h1>
      </div>

      {/* Navigation buttons — only those the user has permission to view */}
      {visibleButtons.length > 0 && (
        <div className="px-4 sm:px-6 pb-2 flex flex-wrap gap-2">
          {visibleButtons.map((btn) => (
            <Link
              key={btn.href}
              href={btn.href}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <btn.icon className="w-4 h-4" />
              {btn.label}
            </Link>
          ))}
        </div>
      )}

      {/* Time range toggle + date range */}
      <div className="p-4 flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 bg-white rounded-full border border-gray-200 p-0.5">
          {RANGES.map((r) => {
            const active = r.value === range
            return (
              <button
                key={r.value}
                onClick={() => switchRange(r.value)}
                disabled={isPending}
                className={
                  active
                    ? 'px-3 py-1 text-[12px] font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200'
                    : 'px-3 py-1 text-[12px] font-medium rounded-full text-gray-400 hover:text-gray-600 border border-transparent'
                }
              >
                {r.label}
              </button>
            )
          })}
        </div>
        <span className="text-[12px] text-gray-400">
          {dateLabel}
          {isPending && <span className="ml-2 text-gray-300">updating…</span>}
        </span>
      </div>

      {/* Team totals row */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <TotalCard label="Total calls" value={overview.totals.totalCalls} />
        <TotalCard label="Emails sent" value={overview.totals.emailsSent} />
        <TotalCard label="Appts set" value={overview.totals.apptsSet} />
        <TotalCard label="Estimates sent" value={overview.totals.estimatesSent} />
        <TotalCard label="Projects won" value={overview.totals.projectsWon} />
        <TotalCard
          label="Revenue won"
          value={formatMoney(overview.totals.revenueWon)}
          green
        />
      </div>

      {/* Per-salesman cards */}
      <div className="mt-4 flex flex-col gap-2">
        {overview.salesmen.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400 italic">
              No salesmen found. Assign admin, salesman, or office_manager roles
              in profiles.
            </p>
          </div>
        ) : (
          overview.salesmen.map((s) => <SalesmanCard key={s.user_id} s={s} />)
        )}
      </div>
    </div>
  )
}

function SalesmanCard({ s }: { s: SalesmanStats }) {
  const active = hasAnyActivity(s)
  const decisions = s.wonCount + s.declinedCount
  const winPct =
    decisions > 0 ? Math.round((s.wonCount / decisions) * 100) : null

  return (
    <div
      className={
        'bg-white rounded-lg border border-gray-200 px-5 py-3.5 flex items-stretch gap-5 flex-wrap md:flex-nowrap' +
        (active ? '' : ' opacity-50')
      }
      style={{ borderWidth: 0.5 }}
    >
      {/* Identity */}
      <div className="flex items-center gap-3 min-w-[140px]">
        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[11px] font-medium">
          {initials(s.display_name)}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-900 truncate">
            {s.display_name}
          </p>
          <p className="text-[11px] text-gray-400 capitalize">
            {s.role.replace('_', ' ')}
          </p>
        </div>
      </div>

      <Divider />

      {/* Outreach */}
      <Section>
        <Metric label="Calls" value={s.calls} />
        <Metric label="Connected" value={s.connected} color="green" />
        <Metric label="VM" value={s.voicemail} />
        <Metric label="Email" value={s.email} />
      </Section>

      <Divider />

      {/* Pipeline */}
      <Section>
        <Metric label="Appts" value={s.appts} />
        <Metric label="Walks" value={s.walks} />
      </Section>

      <Divider />

      {/* Estimates */}
      <Section>
        <Metric label="Est. sent" value={s.estimatesSentCount} />
        <Metric
          label="Est. value"
          value={formatMoney(s.estimatesSentValue)}
        />
      </Section>

      <Divider />

      {/* Results */}
      <Section>
        <Metric label="Won" value={s.wonCount} color="green" />
        <Metric
          label="Revenue"
          value={formatMoney(s.wonRevenue)}
          color="green"
        />
        <Metric
          label="Win %"
          value={winPct == null ? '—' : `${winPct}%`}
          color="green"
        />
      </Section>
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-5 flex-1">
      {children}
    </div>
  )
}

function Divider() {
  return (
    <div
      className="self-center hidden md:block bg-gray-200"
      style={{ width: 0.5, height: 32 }}
    />
  )
}

function Metric({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color?: 'green'
}) {
  const valueClass =
    color === 'green'
      ? 'text-emerald-600'
      : 'text-gray-900'
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-[11px] text-gray-400 leading-none">{label}</p>
      <p
        className={`text-[15px] font-medium tabular-nums mt-1 leading-none ${valueClass}`}
      >
        {value}
      </p>
    </div>
  )
}

function TotalCard({
  label,
  value,
  green,
}: {
  label: string
  value: number | string
  green?: boolean
}) {
  return (
    <div className="bg-white rounded-md border border-gray-200 px-3 py-2.5">
      <p className="text-[11px] text-gray-400 leading-none">{label}</p>
      <p
        className={`text-[18px] font-medium tabular-nums mt-1 leading-none ${
          green ? 'text-emerald-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatMoney(n: number): string {
  if (!n) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

function formatRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const startMonth = start.toLocaleDateString(undefined, { month: 'short' })
  const endMonth = end.toLocaleDateString(undefined, { month: 'short' })
  const year = end.getFullYear()
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`
  }
  return `${startMonth} ${start.getDate()}, ${start.getFullYear()} – ${endMonth} ${end.getDate()}, ${year}`
}
