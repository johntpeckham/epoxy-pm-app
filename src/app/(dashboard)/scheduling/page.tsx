export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import SchedulingPageClient from '@/components/scheduling/SchedulingPageClient'

// ── Week start (Monday) helper ──────────────────────────────────────────
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
  const dd2 = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd2}`
}

export default async function SchedulingPage() {
  const { supabase } = await requirePermission('scheduling', 'view')

  // Compute the three visible weeks
  const thisWeekISO = startOfWeekMondayISO(new Date())
  const nextWeekISO = addDaysISO(thisWeekISO, 7)
  const followingWeekISO = addDaysISO(thisWeekISO, 14)

  // Fetch published schedules for all three weeks
  const { data: publishedSchedules } = await supabase
    .from('published_schedules')
    .select('*')
    .in('week_start', [thisWeekISO, nextWeekISO, followingWeekISO])

  // Fetch publisher display names
  const publisherIds = [...new Set((publishedSchedules ?? []).map((ps: { published_by: string }) => ps.published_by))]
  let publisherNames: Record<string, string> = {}
  if (publisherIds.length > 0) {
    const { data: publishers } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', publisherIds)
    if (publishers) {
      publisherNames = Object.fromEntries(
        publishers.map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? 'Unknown'])
      )
    }
  }

  // Fetch employees for the send modals
  const { data: employees } = await supabase
    .from('employee_profiles')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  return (
    <SchedulingPageClient
      thisWeekISO={thisWeekISO}
      nextWeekISO={nextWeekISO}
      followingWeekISO={followingWeekISO}
      publishedSchedules={publishedSchedules ?? []}
      publisherNames={publisherNames}
      employees={employees ?? []}
    />
  )
}
