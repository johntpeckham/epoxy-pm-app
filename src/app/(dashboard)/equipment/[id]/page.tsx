export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EquipmentDetailClient from '@/components/equipment/EquipmentDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export interface MaintenanceLogRow {
  id: string
  equipment_id: string
  service_date: string
  service_type: string
  mileage_or_hours: string | null
  performed_by: string
  notes: string | null
  created_at: string
  created_by: string | null
}

export default async function EquipmentDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', session.user.id)
    .single()
  const userRole = (profile?.role as string) ?? 'crew'
  const displayName = (profile?.display_name as string) ?? ''

  const { data: equipment } = await supabase
    .from('equipment')
    .select('id, name, category, year, make, model, serial_number, vin, license_plate, custom_fields, status, created_at, created_by')
    .eq('id', id)
    .single()

  if (!equipment) notFound()

  const { data: logs } = await supabase
    .from('maintenance_logs')
    .select('id, equipment_id, service_date, service_type, mileage_or_hours, performed_by, notes, created_at, created_by')
    .eq('equipment_id', id)
    .order('service_date', { ascending: false })

  return (
    <EquipmentDetailClient
      equipment={{
        id: equipment.id,
        name: equipment.name,
        category: equipment.category,
        year: equipment.year,
        make: equipment.make,
        model: equipment.model,
        serial_number: equipment.serial_number,
        vin: equipment.vin,
        license_plate: equipment.license_plate,
        custom_fields: (equipment.custom_fields ?? []) as { label: string; value: string }[],
        status: equipment.status,
        created_at: equipment.created_at,
        created_by: equipment.created_by,
      }}
      initialLogs={(logs ?? []) as MaintenanceLogRow[]}
      userId={session.user.id}
      userRole={userRole}
      userDisplayName={displayName}
    />
  )
}
