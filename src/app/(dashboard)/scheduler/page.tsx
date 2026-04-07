export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SchedulerClient from '@/components/scheduler/SchedulerClient'
import type { EmployeeProfile, Project } from '@/types'

// ── Week start (Monday) helper — must match the client's calculation ─────
function startOfWeekMondayISO(d: Date): string {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const day = r.getDay()
  const diff = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diff)
  const y = r.getFullYear()
  const m = String(r.getMonth() + 1).padStart(2, '0')
  const dd = String(r.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export default async function SchedulerPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) return redirect('/login')
  const user = session.user

  // Access check: admin OR scheduler_access=true
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, scheduler_access')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'crew') as string
  const hasAccess = role === 'admin' || Boolean((profile as { scheduler_access?: boolean } | null)?.scheduler_access)
  if (!hasAccess) return redirect('/my-work')

  // Compute "next week" Monday ISO
  const thisWeekISO = startOfWeekMondayISO(new Date())
  const nextWeekISO = addDaysISO(thisWeekISO, 7)

  // Parallel fetches
  const [employeesRes, projectsRes, savedWeekRes] = await Promise.all([
    supabase.from('employee_profiles').select('*').order('name', { ascending: true }),
    supabase.from('projects').select('*').eq('status', 'Active').order('name', { ascending: true }),
    supabase.from('scheduler_weeks').select('*').eq('week_start', nextWeekISO).maybeSingle(),
  ])

  return (
    <SchedulerClient
      userId={user.id}
      employees={(employeesRes.data as EmployeeProfile[]) ?? []}
      projects={(projectsRes.data as Project[]) ?? []}
      nextWeekISO={nextWeekISO}
      initialScheduleData={(savedWeekRes.data as { schedule_data: unknown } | null)?.schedule_data ?? null}
    />
  )
}
