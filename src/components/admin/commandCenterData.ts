import { createClient } from '@/lib/supabase/client'

export interface CommandCenterChecklistItem {
  id: string
  project_id: string
  name: string
  is_complete: boolean
  group_name: string | null
}

export interface CommandCenterProject {
  id: string
  name: string
  client_name: string | null
  estimate_number: string | null
  status: string
}

export interface CommandCenterCallLogEntry {
  id: string
  company_id: string
  outcome: string
  notes: string | null
  call_date: string
  created_by: string | null
  company_name?: string | null
  user_name?: string | null
}

export interface CommandCenterAppointment {
  id: string
  title: string | null
  date: string
  status: string
  assigned_to: string | null
  created_by: string | null
  created_at: string
  company_name?: string | null
  user_name?: string | null
}

export interface CommandCenterEstimate {
  id: string
  estimate_number: number | null
  project_name: string | null
  status: string | null
  salesperson: string | null
  created_at: string
  total: number | null
}

export interface CommandCenterReport {
  id: string
  project_id: string | null
  created_at: string
  project_name?: string | null
  author_name?: string | null
  author_id?: string | null
}

export interface CommandCenterTaskCompletion {
  task_id: string
  user_id: string
  is_completed: boolean
  completed_at: string | null
}

export interface CommandCenterAssignedTask {
  id: string
  title: string
  task_type: 'daily' | 'weekly' | 'one_time'
  day_of_week: number | null
  specific_date: string | null
  assigned_to: string
  is_active: boolean
}

export interface CommandCenterProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: string
}

export interface CommandCenterData {
  loadedAt: string
  profiles: CommandCenterProfile[]
  projects: CommandCenterProject[]
  checklistItems: CommandCenterChecklistItem[]
  callLogsToday: CommandCenterCallLogEntry[]
  appointmentsToday: CommandCenterAppointment[]
  estimatesRecent: CommandCenterEstimate[]
  reportsToday: CommandCenterReport[]
  assignedTasksForToday: CommandCenterAssignedTask[]
  taskCompletionsToday: CommandCenterTaskCompletion[]
}

function startOfTodayIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function endOfTodayIso() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

function todayDateOnly() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function fetchCommandCenterData(): Promise<CommandCenterData> {
  const supabase = createClient()
  const todayStart = startOfTodayIso()
  const todayEnd = endOfTodayIso()
  const todayDate = todayDateOnly()

  const [
    profilesRes,
    projectsRes,
    checklistRes,
    callLogsRes,
    appointmentsRes,
    estimatesRes,
    reportsRes,
    assignedTasksRes,
    completionsRes,
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url, role'),
    supabase
      .from('projects')
      .select('id, name, client_name, estimate_number, status')
      .order('name', { ascending: true }),
    supabase
      .from('project_checklist_items')
      .select('id, project_id, name, is_complete, group_name')
      .order('sort_order', { ascending: true }),
    supabase
      .from('crm_call_log')
      .select('id, company_id, outcome, notes, call_date, created_by, crm_companies(name)')
      .gte('call_date', todayStart)
      .lte('call_date', todayEnd)
      .order('call_date', { ascending: false }),
    supabase
      .from('crm_appointments')
      .select('id, title, date, status, assigned_to, created_by, created_at, crm_companies(name)')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)
      .order('created_at', { ascending: false }),
    supabase
      .from('estimates')
      .select('id, estimate_number, project_name, status, salesperson, created_at, total')
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('feed_posts')
      .select('id, project_id, created_at, user_id, projects(name)')
      .eq('post_type', 'daily_report')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)
      .order('created_at', { ascending: false }),
    supabase
      .from('assigned_tasks')
      .select('id, title, task_type, day_of_week, specific_date, assigned_to, is_active')
      .eq('is_active', true),
    supabase
      .from('assigned_task_completions')
      .select('task_id, user_id, is_completed, completed_at')
      .eq('completion_date', todayDate),
  ])

  const profiles = (profilesRes.data ?? []) as CommandCenterProfile[]
  const profileById = new Map(profiles.map((p) => [p.id, p]))

  const callLogsToday: CommandCenterCallLogEntry[] = (callLogsRes.data ?? []).map((row) => {
    const r = row as unknown as {
      id: string
      company_id: string
      outcome: string
      notes: string | null
      call_date: string
      created_by: string | null
      crm_companies: { name: string } | null
    }
    return {
      id: r.id,
      company_id: r.company_id,
      outcome: r.outcome,
      notes: r.notes,
      call_date: r.call_date,
      created_by: r.created_by,
      company_name: r.crm_companies?.name ?? null,
      user_name: r.created_by ? profileById.get(r.created_by)?.display_name ?? null : null,
    }
  })

  const appointmentsToday: CommandCenterAppointment[] = (appointmentsRes.data ?? []).map((row) => {
    const r = row as unknown as {
      id: string
      title: string | null
      date: string
      status: string
      assigned_to: string | null
      created_by: string | null
      created_at: string
      crm_companies: { name: string } | null
    }
    return {
      id: r.id,
      title: r.title,
      date: r.date,
      status: r.status,
      assigned_to: r.assigned_to,
      created_by: r.created_by,
      created_at: r.created_at,
      company_name: r.crm_companies?.name ?? null,
      user_name: r.created_by ? profileById.get(r.created_by)?.display_name ?? null : null,
    }
  })

  const reportsToday: CommandCenterReport[] = (reportsRes.data ?? []).map((row) => {
    const r = row as unknown as {
      id: string
      project_id: string | null
      created_at: string
      user_id: string | null
      projects: { name: string } | null
    }
    return {
      id: r.id,
      project_id: r.project_id,
      created_at: r.created_at,
      project_name: r.projects?.name ?? null,
      author_id: r.user_id,
      author_name: r.user_id ? profileById.get(r.user_id)?.display_name ?? null : null,
    }
  })

  return {
    loadedAt: new Date().toISOString(),
    profiles,
    projects: (projectsRes.data ?? []) as CommandCenterProject[],
    checklistItems: (checklistRes.data ?? []) as CommandCenterChecklistItem[],
    callLogsToday,
    appointmentsToday,
    estimatesRecent: (estimatesRes.data ?? []) as CommandCenterEstimate[],
    reportsToday,
    assignedTasksForToday: (assignedTasksRes.data ?? []) as CommandCenterAssignedTask[],
    taskCompletionsToday: (completionsRes.data ?? []) as CommandCenterTaskCompletion[],
  }
}

export function timeAgo(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function initialsFromName(name: string | null | undefined): string {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
