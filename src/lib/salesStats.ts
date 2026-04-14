import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns ISO date ranges (inclusive start, exclusive end) for the current
 * and previous week and month. Week is Monday–Sunday.
 */
export function getActivityRanges(now: Date = new Date()) {
  // Monday = start of week
  const weekStart = new Date(now)
  const day = weekStart.getDay() // 0 = Sun, 1 = Mon ...
  const diffToMonday = day === 0 ? -6 : 1 - day
  weekStart.setDate(weekStart.getDate() + diffToMonday)
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)

  // Month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
  const prevMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
    0,
    0,
    0,
    0
  )

  return {
    weekStart,
    weekEnd,
    prevWeekStart,
    prevWeekEnd: weekStart,
    monthStart,
    monthEnd,
    prevMonthStart,
    prevMonthEnd: monthStart,
  }
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  dateCol: string,
  from: Date,
  to: Date,
  userId?: string,
  userCol: string = 'created_by'
): Promise<number> {
  let q = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte(dateCol, from.toISOString())
    .lt(dateCol, to.toISOString())
  if (userId) q = q.eq(userCol, userId)
  const { count } = await q
  return count ?? 0
}

export interface ActivityStats {
  calls: number
  appointments: number
  conversions: number
  pipelineValue: number
}

export interface ActivityWithComparison {
  current: ActivityStats
  previous: ActivityStats
}

/**
 * Fetch this-week / last-week activity counts for a given user (or for all
 * if userId omitted). Pipeline value is point-in-time (not time bound).
 */
export async function fetchWeekActivity(
  supabase: SupabaseClient,
  userId?: string,
  now: Date = new Date()
): Promise<ActivityWithComparison> {
  const r = getActivityRanges(now)
  const [
    callsNow,
    callsPrev,
    apptsNow,
    apptsPrev,
    convNow,
    convPrev,
    pipeline,
  ] = await Promise.all([
    countRows(supabase, 'crm_call_log', 'call_date', r.weekStart, r.weekEnd, userId),
    countRows(
      supabase,
      'crm_call_log',
      'call_date',
      r.prevWeekStart,
      r.prevWeekEnd,
      userId
    ),
    countRows(
      supabase,
      'crm_appointments',
      'created_at',
      r.weekStart,
      r.weekEnd,
      userId
    ),
    countRows(
      supabase,
      'crm_appointments',
      'created_at',
      r.prevWeekStart,
      r.prevWeekEnd,
      userId
    ),
    countConversions(supabase, r.weekStart, r.weekEnd, userId),
    countConversions(supabase, r.prevWeekStart, r.prevWeekEnd, userId),
    fetchPipelineValue(supabase, userId),
  ])

  return {
    current: {
      calls: callsNow,
      appointments: apptsNow,
      conversions: convNow,
      pipelineValue: pipeline,
    },
    previous: {
      calls: callsPrev,
      appointments: apptsPrev,
      conversions: convPrev,
      pipelineValue: 0,
    },
  }
}

export async function fetchMonthActivity(
  supabase: SupabaseClient,
  userId?: string,
  now: Date = new Date()
): Promise<ActivityWithComparison> {
  const r = getActivityRanges(now)
  const [
    callsNow,
    callsPrev,
    apptsNow,
    apptsPrev,
    convNow,
    convPrev,
    pipeline,
  ] = await Promise.all([
    countRows(
      supabase,
      'crm_call_log',
      'call_date',
      r.monthStart,
      r.monthEnd,
      userId
    ),
    countRows(
      supabase,
      'crm_call_log',
      'call_date',
      r.prevMonthStart,
      r.prevMonthEnd,
      userId
    ),
    countRows(
      supabase,
      'crm_appointments',
      'created_at',
      r.monthStart,
      r.monthEnd,
      userId
    ),
    countRows(
      supabase,
      'crm_appointments',
      'created_at',
      r.prevMonthStart,
      r.prevMonthEnd,
      userId
    ),
    countConversions(supabase, r.monthStart, r.monthEnd, userId),
    countConversions(supabase, r.prevMonthStart, r.prevMonthEnd, userId),
    fetchPipelineValue(supabase, userId),
  ])

  return {
    current: {
      calls: callsNow,
      appointments: apptsNow,
      conversions: convNow,
      pipelineValue: pipeline,
    },
    previous: {
      calls: callsPrev,
      appointments: apptsPrev,
      conversions: convPrev,
      pipelineValue: 0,
    },
  }
}

/**
 * Conversion = company whose status is hot_lead or lost and whose updated_at
 * lands in the range. Proxy: we don't have a status-change audit log, so we
 * use updated_at as the best available signal.
 */
async function countConversions(
  supabase: SupabaseClient,
  from: Date,
  to: Date,
  userId?: string
): Promise<number> {
  let q = supabase
    .from('crm_companies')
    .select('id', { count: 'exact', head: true })
    .in('status', ['hot_lead', 'lost'])
    .gte('updated_at', from.toISOString())
    .lt('updated_at', to.toISOString())
  if (userId) q = q.eq('assigned_to', userId)
  const { count } = await q
  return count ?? 0
}

async function fetchPipelineValue(
  supabase: SupabaseClient,
  userId?: string
): Promise<number> {
  let q = supabase
    .from('crm_companies')
    .select('deal_value')
    .in('status', ['prospect', 'contacted', 'hot_lead'])
  if (userId) q = q.eq('assigned_to', userId)
  const { data } = await q
  return (data ?? []).reduce(
    (sum, r) => sum + Number((r as { deal_value: number | null }).deal_value ?? 0),
    0
  )
}

/**
 * Overdue contacts: have a phone number, last call > 30 days ago (or never),
 * company not blacklisted. Returns an enriched list for rendering.
 */
export interface OverdueContact {
  contact_id: string
  company_id: string
  company_name: string
  first_name: string
  last_name: string
  phone: string | null
  last_call_date: string | null
  days_since: number
}

export async function fetchOverdueContacts(
  supabase: SupabaseClient,
  daysThreshold: number = 30,
  limit: number = 200
): Promise<OverdueContact[]> {
  const { data: contactRows } = await supabase
    .from('crm_contacts')
    .select(
      'id, first_name, last_name, phone, company_id, crm_companies!inner(id, name, status)'
    )
    .not('phone', 'is', null)
    .limit(limit * 3) // over-fetch so we can filter blacklisted + sort

  type Row = {
    id: string
    first_name: string
    last_name: string
    phone: string | null
    company_id: string
    crm_companies: { id: string; name: string; status: string } | null
  }

  const rows = ((contactRows ?? []) as unknown as Row[]).filter(
    (r) => r.crm_companies && r.crm_companies.status !== 'blacklisted'
  )
  if (rows.length === 0) return []

  const contactIds = rows.map((r) => r.id)

  // Most recent call per contact.
  const { data: callRows } = await supabase
    .from('crm_call_log')
    .select('contact_id, call_date')
    .in('contact_id', contactIds)
    .order('call_date', { ascending: false })

  const lastCallByContact = new Map<string, string>()
  for (const c of (callRows ?? []) as Array<{ contact_id: string; call_date: string }>) {
    if (!lastCallByContact.has(c.contact_id)) {
      lastCallByContact.set(c.contact_id, c.call_date)
    }
  }

  const now = Date.now()
  const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000
  const overdue: OverdueContact[] = []
  for (const r of rows) {
    const lastCall = lastCallByContact.get(r.id) ?? null
    const sinceMs = lastCall ? now - new Date(lastCall).getTime() : Infinity
    if (sinceMs < thresholdMs) continue
    overdue.push({
      contact_id: r.id,
      company_id: r.company_id,
      company_name: r.crm_companies!.name,
      first_name: r.first_name,
      last_name: r.last_name,
      phone: r.phone,
      last_call_date: lastCall,
      days_since: lastCall
        ? Math.floor(sinceMs / (24 * 60 * 60 * 1000))
        : 9999,
    })
  }

  // Sort: most stale first.
  overdue.sort((a, b) => b.days_since - a.days_since)
  return overdue.slice(0, limit)
}

export interface RecentActivityEntry {
  id: string
  outcome: string
  call_date: string
  notes: string | null
  created_by: string | null
  creator_name: string | null
  company_id: string
  company_name: string
  contact_name: string | null
}

export async function fetchRecentActivity(
  supabase: SupabaseClient,
  limit: number = 20,
  offset: number = 0
): Promise<RecentActivityEntry[]> {
  const { data } = await supabase
    .from('crm_call_log')
    .select(
      'id, outcome, call_date, notes, created_by, company_id, ' +
        'crm_companies!inner(id, name), crm_contacts(first_name, last_name)'
    )
    .order('call_date', { ascending: false })
    .range(offset, offset + limit - 1)

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
    for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
      creatorNames.set(p.id, p.display_name ?? 'Someone')
    }
  }

  return rows.map((r) => ({
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
}

export interface TeamMemberStats {
  user_id: string
  display_name: string
  role: string
  calls_week: number
  calls_month: number
  appts_week: number
  appts_month: number
  conversions_month: number
  pipeline_value: number
}

export async function fetchTeamStats(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<TeamMemberStats[]> {
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .in('role', ['admin', 'office_manager', 'salesman'])

  type Prof = { id: string; display_name: string | null; role: string }
  const list = (profs ?? []) as Prof[]
  if (list.length === 0) return []

  const results = await Promise.all(
    list.map(async (p) => {
      const [w, m] = await Promise.all([
        fetchWeekActivity(supabase, p.id, now),
        fetchMonthActivity(supabase, p.id, now),
      ])
      return {
        user_id: p.id,
        display_name: p.display_name ?? 'Unknown',
        role: p.role,
        calls_week: w.current.calls,
        calls_month: m.current.calls,
        appts_week: w.current.appointments,
        appts_month: m.current.appointments,
        conversions_month: m.current.conversions,
        pipeline_value: w.current.pipelineValue, // same calc for both
      }
    })
  )

  results.sort((a, b) => b.calls_week - a.calls_week)
  return results
}
