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
  photo_url: string | null
  created_at: string
  created_by: string | null
}

export interface EquipmentDocumentRow {
  id: string
  equipment_id: string
  label: string
  file_url: string
  uploaded_at: string
  uploaded_by: string | null
}

export interface ScheduledServiceRow {
  id: string
  equipment_id: string
  description: string
  scheduled_date: string
  is_recurring: boolean
  recurrence_interval: number | null
  recurrence_unit: 'weeks' | 'months' | null
  status: 'upcoming' | 'in_progress' | 'due' | 'overdue' | 'completed'
  completed_at: string | null
  completed_by: string | null
  parent_service_id: string | null
  task_id: string | null
  created_by: string | null
  created_at: string
}

export interface ProfileOption {
  id: string
  display_name: string | null
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
    .select('id, name, category, year, make, model, serial_number, vin, license_plate, custom_fields, status, photo_url, created_at, created_by')
    .eq('id', id)
    .single()

  if (!equipment) notFound()

  const { data: logs } = await supabase
    .from('maintenance_logs')
    .select('id, equipment_id, service_date, service_type, mileage_or_hours, performed_by, notes, photo_url, created_at, created_by')
    .eq('equipment_id', id)
    .order('service_date', { ascending: false })

  const { data: docs } = await supabase
    .from('equipment_documents')
    .select('id, equipment_id, label, file_url, uploaded_at, uploaded_by')
    .eq('equipment_id', id)
    .order('uploaded_at', { ascending: false })

  const { data: scheduled } = await supabase
    .from('equipment_scheduled_services')
    .select('id, equipment_id, description, scheduled_date, is_recurring, recurrence_interval, recurrence_unit, status, completed_at, completed_by, parent_service_id, task_id, created_by, created_at')
    .eq('equipment_id', id)
    .order('scheduled_date', { ascending: true })

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, display_name')
    .order('display_name', { ascending: true })

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
        photo_url: (equipment as { photo_url?: string | null }).photo_url ?? null,
        created_at: equipment.created_at,
        created_by: equipment.created_by,
      }}
      initialLogs={(logs ?? []) as MaintenanceLogRow[]}
      initialDocs={(docs ?? []) as EquipmentDocumentRow[]}
      initialScheduled={(scheduled ?? []) as ScheduledServiceRow[]}
      profiles={(profileRows ?? []) as ProfileOption[]}
      userId={session.user.id}
      userRole={userRole}
      userDisplayName={displayName}
    />
  )
}
