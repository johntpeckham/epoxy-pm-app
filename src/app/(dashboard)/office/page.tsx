export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import OfficeTasksPageClient from '@/components/office-tasks/OfficeTasksPageClient'
import type { EquipmentRow } from '@/app/(dashboard)/equipment/page'

export default async function OfficePage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  // Check role — admin, office_manager, salesman get the full dashboard.
  // Foreman is allowed on this page but sees an Equipment-only view
  // (card visibility is gated client-side in OfficeTasksPageClient).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role ?? 'crew') as UserRole
  const userDisplayName = (profile?.display_name as string | null) ?? ''

  if (
    userRole !== 'admin' &&
    userRole !== 'office_manager' &&
    userRole !== 'salesman' &&
    userRole !== 'foreman'
  ) {
    return redirect('/my-work')
  }

  // Fetch ALL office tasks
  const { data: tasks } = await supabase
    .from('office_tasks')
    .select('*')
    .order('created_at', { ascending: false })

  // Fetch all profiles for assignee display and selectors
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, updated_at')

  // Fetch active projects for selectors
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('status', 'Active')
    .order('name', { ascending: true })

  // Fetch full equipment rows — used both for the dashboard counts and for
  // rendering the embedded Equipment workspace when the user clicks the card.
  const { data: equipmentRowsRaw } = await supabase
    .from('equipment')
    .select('*')
    .order('name', { ascending: true })

  const equipmentRows: EquipmentRow[] = (equipmentRowsRaw ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    year: row.year,
    make: row.make,
    model: row.model,
    serial_number: row.serial_number,
    vin: row.vin,
    license_plate: row.license_plate,
    custom_fields: (row.custom_fields ?? []) as { label: string; value: string }[],
    status: row.status,
    photo_url: row.photo_url ?? null,
    created_at: row.created_at,
    created_by: row.created_by,
  }))

  const equipmentTotal = equipmentRows.length
  const equipmentActive = equipmentRows.filter((e) => e.status === 'active').length
  const equipmentOutOfService = equipmentRows.filter((e) => e.status === 'out_of_service').length

  // Fetch upcoming / due / overdue / in-progress scheduled services (everything
  // except completed) for the Equipment card preview. Joins the equipment table
  // so the card can show the equipment name without a second lookup. Ordered by
  // scheduled_date ASC — the oldest/most overdue surface first. This is seed
  // data for the client component; the client refetches on mount (and when the
  // user returns to the dashboard view) to stay in sync with the detail page.
  const { data: upcomingScheduledRaw } = await supabase
    .from('equipment_scheduled_services')
    .select('id, equipment_id, description, scheduled_date, status, equipment:equipment_id ( name )')
    .neq('status', 'completed')
    .order('scheduled_date', { ascending: true })
    .limit(50)

  const upcomingScheduled = (upcomingScheduledRaw ?? []).map((row) => {
    const eq = (row as { equipment?: { name?: string } | { name?: string }[] | null }).equipment
    const equipmentName = Array.isArray(eq) ? eq[0]?.name ?? null : eq?.name ?? null
    return {
      id: row.id as string,
      equipment_id: row.equipment_id as string,
      description: row.description as string,
      scheduled_date: row.scheduled_date as string,
      status: row.status as string,
      equipment_name: equipmentName,
    }
  })

  // Fetch employee count for the Employees dashboard card (only for admin/office_manager)
  let employeeCount = 0
  if (userRole === 'admin' || userRole === 'office_manager') {
    const { count } = await supabase
      .from('employee_profiles')
      .select('id', { count: 'exact', head: true })
    employeeCount = count ?? 0
  }

  return (
    <OfficeTasksPageClient
      userId={user.id}
      userRole={userRole}
      userDisplayName={userDisplayName}
      initialTasks={tasks ?? []}
      initialProfiles={profiles ?? []}
      initialProjects={projects ?? []}
      initialEquipment={equipmentRows}
      equipmentCounts={{ total: equipmentTotal, active: equipmentActive, outOfService: equipmentOutOfService }}
      upcomingScheduledServices={upcomingScheduled}
      employeeCount={employeeCount}
    />
  )
}
