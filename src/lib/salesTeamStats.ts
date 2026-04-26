import type { SupabaseClient } from '@supabase/supabase-js'

export type TimeRange = 'weekly' | 'monthly' | 'yearly'

export interface DateRange {
  start: Date // inclusive
  end: Date // exclusive upper bound used in queries
  displayStart: Date // inclusive, for display
  displayEnd: Date // inclusive, for display
}

export function getDateRange(
  range: TimeRange,
  now: Date = new Date()
): DateRange {
  if (range === 'weekly') {
    const start = new Date(now)
    const day = start.getDay() // 0 = Sun, 1 = Mon ...
    const diffToMonday = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + diffToMonday)
    start.setHours(0, 0, 0, 0)
    const endExclusive = new Date(start)
    endExclusive.setDate(start.getDate() + 7)
    const displayEnd = new Date(start)
    displayEnd.setDate(start.getDate() + 6)
    return { start, end: endExclusive, displayStart: start, displayEnd }
  }
  if (range === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const endExclusive = new Date(now)
    endExclusive.setHours(0, 0, 0, 0)
    endExclusive.setDate(endExclusive.getDate() + 1)
    const displayEnd = new Date(now)
    return { start, end: endExclusive, displayStart: start, displayEnd }
  }
  // yearly
  const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
  const endExclusive = new Date(now)
  endExclusive.setHours(0, 0, 0, 0)
  endExclusive.setDate(endExclusive.getDate() + 1)
  const displayEnd = new Date(now)
  return { start, end: endExclusive, displayStart: start, displayEnd }
}

export interface SalesmanStats {
  user_id: string
  display_name: string
  role: string
  calls: number
  connected: number
  voicemail: number
  email: number
  appts: number
  walks: number
  proposalsSentCount: number
  proposalsSentValue: number
  wonCount: number
  wonRevenue: number
  declinedCount: number
}

export interface TeamTotals {
  totalCalls: number
  emailsSent: number
  apptsSet: number
  proposalsSent: number
  projectsWon: number
  revenueWon: number
}

export interface TeamOverview {
  totals: TeamTotals
  salesmen: SalesmanStats[]
  range: {
    start: string
    end: string
    displayStart: string
    displayEnd: string
  }
}

const SALES_ROLES = ['admin', 'salesman', 'office_manager']

export function hasAnyActivity(s: SalesmanStats): boolean {
  return (
    s.calls > 0 ||
    s.connected > 0 ||
    s.voicemail > 0 ||
    s.email > 0 ||
    s.appts > 0 ||
    s.walks > 0 ||
    s.proposalsSentCount > 0 ||
    s.proposalsSentValue > 0 ||
    s.wonCount > 0 ||
    s.wonRevenue > 0
  )
}

export async function fetchTeamOverview(
  supabase: SupabaseClient,
  range: TimeRange,
  now: Date = new Date()
): Promise<TeamOverview> {
  const { start, end, displayStart, displayEnd } = getDateRange(range, now)
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  const [
    profilesRes,
    callRowsRes,
    apptRowsRes,
    walkRowsRes,
    sentEstRes,
    wonEstRes,
    declinedEstRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .in('role', SALES_ROLES),
    supabase
      .from('crm_call_log')
      .select('created_by, outcome')
      .gte('call_date', startIso)
      .lt('call_date', endIso),
    supabase
      .from('crm_appointments')
      .select('created_by')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('job_walks')
      .select('created_by')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('estimates')
      .select('user_id, total')
      .eq('status', 'Sent')
      .gte('sent_at', startIso)
      .lt('sent_at', endIso),
    supabase
      .from('estimates')
      .select('user_id, total')
      .eq('status', 'Accepted')
      .gte('accepted_at', startIso)
      .lt('accepted_at', endIso),
    supabase
      .from('estimates')
      .select('user_id')
      .eq('status', 'Declined')
      .gte('declined_at', startIso)
      .lt('declined_at', endIso),
  ])

  type Profile = { id: string; display_name: string | null; role: string }
  type CallRow = { created_by: string | null; outcome: string }
  type ApptRow = { created_by: string | null }
  type WalkRow = { created_by: string | null }
  type EstRow = { user_id: string | null; total: number | null }
  type EstDeclined = { user_id: string | null }

  const profiles = (profilesRes.data ?? []) as Profile[]
  const callRows = (callRowsRes.data ?? []) as CallRow[]
  const apptRows = (apptRowsRes.data ?? []) as ApptRow[]
  const walkRows = (walkRowsRes.data ?? []) as WalkRow[]
  const sentEstRows = (sentEstRes.data ?? []) as EstRow[]
  const wonEstRows = (wonEstRes.data ?? []) as EstRow[]
  const declinedEstRows = (declinedEstRes.data ?? []) as EstDeclined[]

  const byUser = new Map<string, SalesmanStats>()
  for (const p of profiles) {
    byUser.set(p.id, {
      user_id: p.id,
      display_name: p.display_name ?? 'Unknown',
      role: p.role,
      calls: 0,
      connected: 0,
      voicemail: 0,
      email: 0,
      appts: 0,
      walks: 0,
      proposalsSentCount: 0,
      proposalsSentValue: 0,
      wonCount: 0,
      wonRevenue: 0,
      declinedCount: 0,
    })
  }

  for (const r of callRows) {
    if (!r.created_by) continue
    const u = byUser.get(r.created_by)
    if (!u) continue
    u.calls++
    if (r.outcome === 'connected') u.connected++
    else if (r.outcome === 'voicemail') u.voicemail++
    else if (r.outcome === 'email_sent') u.email++
  }
  for (const r of apptRows) {
    if (!r.created_by) continue
    const u = byUser.get(r.created_by)
    if (u) u.appts++
  }
  for (const r of walkRows) {
    if (!r.created_by) continue
    const u = byUser.get(r.created_by)
    if (u) u.walks++
  }
  for (const r of sentEstRows) {
    if (!r.user_id) continue
    const u = byUser.get(r.user_id)
    if (!u) continue
    u.proposalsSentCount++
    u.proposalsSentValue += Number(r.total ?? 0)
  }
  for (const r of wonEstRows) {
    if (!r.user_id) continue
    const u = byUser.get(r.user_id)
    if (!u) continue
    u.wonCount++
    u.wonRevenue += Number(r.total ?? 0)
  }
  for (const r of declinedEstRows) {
    if (!r.user_id) continue
    const u = byUser.get(r.user_id)
    if (u) u.declinedCount++
  }

  const totals: TeamTotals = {
    totalCalls: callRows.length,
    emailsSent: callRows.filter((r) => r.outcome === 'email_sent').length,
    apptsSet: apptRows.length,
    proposalsSent: sentEstRows.length,
    projectsWon: wonEstRows.length,
    revenueWon: wonEstRows.reduce((s, r) => s + Number(r.total ?? 0), 0),
  }

  const salesmen = Array.from(byUser.values())
  salesmen.sort((a, b) => {
    const aActive = hasAnyActivity(a)
    const bActive = hasAnyActivity(b)
    if (aActive !== bActive) return aActive ? -1 : 1
    return b.calls - a.calls
  })

  return {
    totals,
    salesmen,
    range: {
      start: startIso,
      end: endIso,
      displayStart: displayStart.toISOString(),
      displayEnd: displayEnd.toISOString(),
    },
  }
}
