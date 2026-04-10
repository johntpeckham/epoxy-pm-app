'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2Icon, ArrowLeftIcon } from 'lucide-react'
import type { EquipmentRow } from '@/app/(dashboard)/equipment/page'
import type {
  MaintenanceLogRow,
  EquipmentDocumentRow,
  ScheduledServiceRow,
  ProfileOption,
} from '@/app/(dashboard)/equipment/[id]/page'
import EquipmentDetailClient from './EquipmentDetailClient'

interface Props {
  equipmentId: string
  userId: string
  userRole: string
  userDisplayName: string
  onBack: () => void
}

/**
 * Thin client-side wrapper that fetches an equipment row + its maintenance
 * logs and documents, then renders the existing EquipmentDetailClient. Used
 * by the Office page to embed the equipment detail view inline.
 */
export default function EquipmentDetailLoader({
  equipmentId,
  userId,
  userRole,
  userDisplayName,
  onBack,
}: Props) {
  const [equipment, setEquipment] = useState<EquipmentRow | null>(null)
  const [logs, setLogs] = useState<MaintenanceLogRow[]>([])
  const [docs, setDocs] = useState<EquipmentDocumentRow[]>([])
  const [scheduled, setScheduled] = useState<ScheduledServiceRow[]>([])
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: eq, error: eqErr } = await supabase
          .from('equipment')
          .select(
            'id, name, category, year, make, model, serial_number, vin, license_plate, custom_fields, status, created_at, created_by'
          )
          .eq('id', equipmentId)
          .single()
        if (eqErr) throw eqErr
        if (!eq) throw new Error('Equipment not found')

        const { data: logRows } = await supabase
          .from('maintenance_logs')
          .select(
            'id, equipment_id, service_date, service_type, mileage_or_hours, performed_by, notes, created_at, created_by'
          )
          .eq('equipment_id', equipmentId)
          .order('service_date', { ascending: false })

        const { data: docRows } = await supabase
          .from('equipment_documents')
          .select('id, equipment_id, label, file_url, uploaded_at, uploaded_by')
          .eq('equipment_id', equipmentId)
          .order('uploaded_at', { ascending: false })

        const { data: scheduledRows } = await supabase
          .from('equipment_scheduled_services')
          .select('id, equipment_id, description, scheduled_date, is_recurring, recurrence_interval, recurrence_unit, status, completed_at, completed_by, parent_service_id, task_id, created_by, created_at')
          .eq('equipment_id', equipmentId)
          .order('scheduled_date', { ascending: true })

        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, display_name')
          .order('display_name', { ascending: true })

        if (cancelled) return
        setEquipment({
          id: eq.id,
          name: eq.name,
          category: eq.category,
          year: eq.year,
          make: eq.make,
          model: eq.model,
          serial_number: eq.serial_number,
          vin: eq.vin,
          license_plate: eq.license_plate,
          custom_fields: (eq.custom_fields ?? []) as { label: string; value: string }[],
          status: eq.status,
          created_at: eq.created_at,
          created_by: eq.created_by,
        })
        setLogs((logRows ?? []) as MaintenanceLogRow[])
        setDocs((docRows ?? []) as EquipmentDocumentRow[])
        setScheduled((scheduledRows ?? []) as ScheduledServiceRow[])
        setProfiles((profileRows ?? []) as ProfileOption[])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load equipment')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [equipmentId])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Equipment
        </button>
        <div className="flex items-center justify-center py-16">
          <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
        </div>
      </div>
    )
  }

  if (error || !equipment) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Equipment
        </button>
        <p className="text-sm text-red-600">{error ?? 'Equipment not found'}</p>
      </div>
    )
  }

  return (
    <EquipmentDetailClient
      equipment={equipment}
      initialLogs={logs}
      initialDocs={docs}
      initialScheduled={scheduled}
      profiles={profiles}
      userId={userId}
      userRole={userRole}
      userDisplayName={userDisplayName}
      onBack={onBack}
    />
  )
}
