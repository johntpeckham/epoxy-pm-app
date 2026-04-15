'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserRole } from '@/types'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PhoneIcon,
  MailIcon,
  MessageSquareIcon,
  CalendarIcon,
  SaveIcon,
  Loader2Icon,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OfficeDailyReportRow {
  id: string
  user_id: string
  report_date: string
  clock_in: string | null
  clock_out: string | null
  work_summary: string | null
  sales_not_applicable: boolean
  sales_calls: number
  sales_emails: number
  sales_appointments: number
  sales_texts: number
  created_at: string
  updated_at: string
}

interface ProfileRow {
  id: string
  display_name: string | null
  role: string | null
}

interface Props {
  userId: string
  userRole: UserRole
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateLabel(d: string): string {
  if (!d) return ''
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTimeLabel(t: string | null): string {
  if (!t) return '—'
  // t is HH:MM:SS or HH:MM
  const [hStr, mStr] = t.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return t
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function trimTimeForInput(t: string | null): string {
  if (!t) return ''
  // HTML time input expects HH:MM
  return t.length >= 5 ? t.slice(0, 5) : t
}

/* ------------------------------------------------------------------ */
/*  Sales metrics fetcher                                              */
/* ------------------------------------------------------------------ */

async function fetchSalesMetricsForUserOnDate(
  supabase: ReturnType<typeof createClient>,
  uid: string,
  dateStr: string
): Promise<{ calls: number; emails: number; texts: number; appointments: number }> {
  const start = new Date(dateStr + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  const [callsRes, emailsRes, textsRes, apptRes] = await Promise.all([
    supabase
      .from('crm_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', uid)
      .gte('call_date', startIso)
      .lt('call_date', endIso),
    supabase
      .from('crm_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', uid)
      .eq('outcome', 'email_sent')
      .gte('call_date', startIso)
      .lt('call_date', endIso),
    supabase
      .from('crm_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', uid)
      .eq('outcome', 'text_sent')
      .gte('call_date', startIso)
      .lt('call_date', endIso),
    supabase
      .from('crm_appointments')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', uid)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
  ])

  return {
    calls: callsRes.count ?? 0,
    emails: emailsRes.count ?? 0,
    texts: textsRes.count ?? 0,
    appointments: apptRes.count ?? 0,
  }
}

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */

export default function OfficeDailyReportsWorkspace({ userId, userRole }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const isAdmin = userRole === 'admin'

  /* ---- My report form state ---- */
  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [clockIn, setClockIn] = useState<string>('')
  const [clockOut, setClockOut] = useState<string>('')
  const [workSummary, setWorkSummary] = useState<string>('')
  const [salesNotApplicable, setSalesNotApplicable] = useState<boolean>(false)
  const [metrics, setMetrics] = useState<{
    calls: number
    emails: number
    texts: number
    appointments: number
  }>({ calls: 0, emails: 0, texts: 0, appointments: 0 })

  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [saveCount, setSaveCount] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)

  /* ---- Past reports list ---- */
  const [pastReports, setPastReports] = useState<OfficeDailyReportRow[]>([])

  /* ---- Admin team view state ---- */
  const [teamDate, setTeamDate] = useState<string>(todayStr())
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [teamReports, setTeamReports] = useState<OfficeDailyReportRow[]>([])
  const [teamLoading, setTeamLoading] = useState<boolean>(false)
  const [expandedTeamReportId, setExpandedTeamReportId] = useState<string | null>(null)

  /* ================================================================ */
  /*  Load report for selected date + past reports                     */
  /* ================================================================ */

  const loadReportForDate = useCallback(
    async (dateStr: string) => {
      setLoading(true)
      setError(null)

      const { data: existing, error: existingErr } = await supabase
        .from('office_daily_reports')
        .select('*')
        .eq('user_id', userId)
        .eq('report_date', dateStr)
        .maybeSingle()

      if (existingErr) {
        setError(existingErr.message)
        setLoading(false)
        return
      }

      // Always pull live sales metrics for the date
      const live = await fetchSalesMetricsForUserOnDate(supabase, userId, dateStr)

      if (existing) {
        const row = existing as OfficeDailyReportRow
        setClockIn(trimTimeForInput(row.clock_in))
        setClockOut(trimTimeForInput(row.clock_out))
        setWorkSummary(row.work_summary ?? '')
        setSalesNotApplicable(row.sales_not_applicable)
        setMetrics(
          row.sales_not_applicable
            ? {
                calls: row.sales_calls,
                emails: row.sales_emails,
                texts: row.sales_texts,
                appointments: row.sales_appointments,
              }
            : live
        )
      } else {
        setClockIn('')
        setClockOut('')
        setWorkSummary('')
        setSalesNotApplicable(false)
        setMetrics(live)
      }

      setLoading(false)
    },
    [supabase, userId]
  )

  const loadPastReports = useCallback(async () => {
    const { data } = await supabase
      .from('office_daily_reports')
      .select('*')
      .eq('user_id', userId)
      .order('report_date', { ascending: false })
      .limit(30)
    setPastReports((data ?? []) as OfficeDailyReportRow[])
  }, [supabase, userId])

  useEffect(() => {
    loadReportForDate(selectedDate)
  }, [selectedDate, loadReportForDate])

  useEffect(() => {
    loadPastReports()
  }, [loadPastReports])

  /* ================================================================ */
  /*  Save                                                              */
  /* ================================================================ */

  async function handleSave() {
    setSaving(true)
    setError(null)

    const payload = {
      user_id: userId,
      report_date: selectedDate,
      clock_in: clockIn || null,
      clock_out: clockOut || null,
      work_summary: workSummary || null,
      sales_not_applicable: salesNotApplicable,
      sales_calls: salesNotApplicable ? 0 : metrics.calls,
      sales_emails: salesNotApplicable ? 0 : metrics.emails,
      sales_texts: salesNotApplicable ? 0 : metrics.texts,
      sales_appointments: salesNotApplicable ? 0 : metrics.appointments,
    }

    const { error: upsertErr } = await supabase
      .from('office_daily_reports')
      .upsert(payload, { onConflict: 'user_id,report_date' })
      .select('id')
      .single()

    if (upsertErr) {
      setError(upsertErr.message)
      setSaving(false)
      return
    }

    setSaveCount((c) => c + 1)
    setSaving(false)

    // Refresh past reports list
    loadPastReports()

    // If admin and currently viewing today, refresh the team list too
    if (isAdmin && teamDate === selectedDate) {
      loadTeamReports(teamDate)
    }
  }

  /* ================================================================ */
  /*  Admin: team view                                                  */
  /* ================================================================ */

  const loadTeamReports = useCallback(
    async (dateStr: string) => {
      if (!isAdmin) return
      setTeamLoading(true)

      // Profiles include office-eligible roles
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, display_name, role')
        .order('display_name', { ascending: true })

      const profilesList = (profileRows ?? []) as ProfileRow[]
      setProfiles(profilesList)

      const { data: reportRows } = await supabase
        .from('office_daily_reports')
        .select('*')
        .eq('report_date', dateStr)

      setTeamReports((reportRows ?? []) as OfficeDailyReportRow[])
      setTeamLoading(false)
    },
    [supabase, isAdmin]
  )

  useEffect(() => {
    if (isAdmin) {
      loadTeamReports(teamDate)
    }
  }, [isAdmin, teamDate, loadTeamReports])

  /* ================================================================ */
  /*  Derived: team rows sorted (with reports first)                    */
  /* ================================================================ */

  const teamRows = useMemo(() => {
    const reportByUser = new Map<string, OfficeDailyReportRow>()
    for (const r of teamReports) reportByUser.set(r.user_id, r)

    const eligibleRoles = new Set([
      'admin',
      'office_manager',
      'salesman',
    ])

    // Office staff = eligible roles. Admins want to see office-only.
    const eligibleProfiles = profiles.filter(
      (p) => p.role && eligibleRoles.has(p.role)
    )

    return eligibleProfiles
      .map((p) => ({
        profile: p,
        report: reportByUser.get(p.id) ?? null,
      }))
      .sort((a, b) => {
        if (a.report && !b.report) return -1
        if (!a.report && b.report) return 1
        const an = (a.profile.display_name ?? '').toLowerCase()
        const bn = (b.profile.display_name ?? '').toLowerCase()
        return an.localeCompare(bn)
      })
  }, [profiles, teamReports])

  /* ================================================================ */
  /*  Render                                                            */
  /* ================================================================ */

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* My report form */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Office Daily Report
            </h3>
            <p className="text-xs text-gray-500">
              {formatDateLabel(selectedDate)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {saveCount > 0 && !saving && (
              <span className="text-xs text-amber-600">Saved</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-200 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition shadow-sm"
            >
              {saving ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                <SaveIcon className="w-4 h-4" />
              )}
              Save
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 sm:px-5 py-2 bg-red-50 text-red-700 text-xs">
            {error}
          </div>
        )}

        <div className="p-4 sm:p-5 space-y-4">
          {/* Date / clock in / clock out */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                max={todayStr()}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Clock in
              </label>
              <input
                type="time"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Clock out
              </label>
              <input
                type="time"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
          </div>

          {/* Work summary */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              What did you work on today?
            </label>
            <textarea
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              placeholder="Summary of today's work..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              style={{ minHeight: 150 }}
            />
          </div>

          {/* Sales metrics */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Sales activity
              </h4>
              <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={salesNotApplicable}
                  onChange={(e) => setSalesNotApplicable(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                />
                Does not apply
              </label>
            </div>

            {!salesNotApplicable && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MetricBox
                  icon={<PhoneIcon className="w-3.5 h-3.5" />}
                  label="Calls made"
                  value={metrics.calls}
                />
                <MetricBox
                  icon={<MailIcon className="w-3.5 h-3.5" />}
                  label="Emails sent"
                  value={metrics.emails}
                />
                <MetricBox
                  icon={<MessageSquareIcon className="w-3.5 h-3.5" />}
                  label="Texts sent"
                  value={metrics.texts}
                />
                <MetricBox
                  icon={<CalendarIcon className="w-3.5 h-3.5" />}
                  label="Appts set"
                  value={metrics.appointments}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Past reports list */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 sm:px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">My past reports</h3>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
          {pastReports.length === 0 && (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">
              No past reports yet
            </p>
          )}
          {pastReports.map((r) => {
            const isSelected = r.report_date === selectedDate
            return (
              <button
                key={r.id}
                onClick={() => setSelectedDate(r.report_date)}
                className={`w-full text-left px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors ${
                  isSelected ? 'bg-amber-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-xs font-semibold text-gray-900 w-32 flex-shrink-0">
                    {formatDateLabel(r.report_date)}
                  </div>
                  <div className="text-xs text-gray-500 flex-shrink-0 w-28">
                    {formatTimeLabel(r.clock_in)} – {formatTimeLabel(r.clock_out)}
                  </div>
                  <div className="text-xs text-gray-600 flex-1 min-w-0 truncate">
                    {r.work_summary ?? <span className="text-gray-400 italic">No summary</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Admin team view */}
      {isAdmin && (
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900">Team reports</h3>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Date</label>
              <input
                type="date"
                value={teamDate}
                onChange={(e) => setTeamDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-50">
            {teamLoading && (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">Loading...</p>
            )}
            {!teamLoading && teamRows.length === 0 && (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">
                No team members found
              </p>
            )}
            {!teamLoading &&
              teamRows.map(({ profile, report }) => {
                const expanded = report && expandedTeamReportId === report.id
                return (
                  <div key={profile.id}>
                    <button
                      onClick={() => {
                        if (!report) return
                        setExpandedTeamReportId(expanded ? null : report.id)
                      }}
                      disabled={!report}
                      className={`w-full text-left px-4 sm:px-5 py-3 transition-colors ${
                        report ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          {report ? (
                            expanded ? (
                              <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                            )
                          ) : (
                            <span className="block w-4 h-4" />
                          )}
                        </div>
                        <div className="text-sm font-medium text-gray-900 w-40 flex-shrink-0 truncate">
                          {profile.display_name ?? 'Unknown'}
                        </div>
                        {report ? (
                          <>
                            <div className="text-xs text-gray-500 flex-shrink-0 w-28">
                              {formatTimeLabel(report.clock_in)} –{' '}
                              {formatTimeLabel(report.clock_out)}
                            </div>
                            <div className="text-xs text-gray-600 flex-1 min-w-0 truncate">
                              {report.work_summary ?? (
                                <span className="text-gray-400 italic">No summary</span>
                              )}
                            </div>
                            {!report.sales_not_applicable && (
                              <div className="hidden md:flex items-center gap-2 text-[10px] text-gray-500 flex-shrink-0">
                                <span title="Calls">
                                  <PhoneIcon className="w-3 h-3 inline" />{' '}
                                  {report.sales_calls}
                                </span>
                                <span title="Emails">
                                  <MailIcon className="w-3 h-3 inline" />{' '}
                                  {report.sales_emails}
                                </span>
                                <span title="Texts">
                                  <MessageSquareIcon className="w-3 h-3 inline" />{' '}
                                  {report.sales_texts}
                                </span>
                                <span title="Appts">
                                  <CalendarIcon className="w-3 h-3 inline" />{' '}
                                  {report.sales_appointments}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-gray-400 italic">No report</div>
                        )}
                      </div>
                    </button>
                    {expanded && report && (
                      <div className="px-4 sm:px-5 pb-4 pt-1 bg-gray-50">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                          <ReadOnlyField
                            label="Date"
                            value={formatDateLabel(report.report_date)}
                          />
                          <ReadOnlyField
                            label="Clock in"
                            value={formatTimeLabel(report.clock_in)}
                          />
                          <ReadOnlyField
                            label="Clock out"
                            value={formatTimeLabel(report.clock_out)}
                          />
                        </div>
                        <div className="mb-3">
                          <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">
                            Work summary
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg px-3 py-2">
                            {report.work_summary ?? (
                              <span className="text-gray-400 italic">No summary</span>
                            )}
                          </div>
                        </div>
                        {report.sales_not_applicable ? (
                          <p className="text-xs text-gray-500 italic">
                            Sales activity does not apply
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <MetricBox
                              icon={<PhoneIcon className="w-3.5 h-3.5" />}
                              label="Calls made"
                              value={report.sales_calls}
                            />
                            <MetricBox
                              icon={<MailIcon className="w-3.5 h-3.5" />}
                              label="Emails sent"
                              value={report.sales_emails}
                            />
                            <MetricBox
                              icon={<MessageSquareIcon className="w-3.5 h-3.5" />}
                              label="Texts sent"
                              value={report.sales_texts}
                            />
                            <MetricBox
                              icon={<CalendarIcon className="w-3.5 h-3.5" />}
                              label="Appts set"
                              value={report.sales_appointments}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function MetricBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="border border-gray-200 rounded-lg px-3 py-2 bg-white">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500">
        <span className="text-amber-500">{icon}</span>
        {label}
      </div>
      <p className="text-xl font-medium text-gray-900 mt-0.5 tabular-nums">
        {value}
      </p>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </div>
      <div className="text-sm text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-2">
        {value}
      </div>
    </div>
  )
}
