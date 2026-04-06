export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import EquipmentPageClient from '@/components/equipment/EquipmentPageClient'

export interface EquipmentRow {
  id: string
  name: string
  category: string
  year: string | null
  make: string | null
  model: string | null
  serial_number: string | null
  vin: string | null
  license_plate: string | null
  custom_fields: { label: string; value: string }[]
  status: string
  created_at: string
  created_by: string | null
}

export default async function EquipmentPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
  const userRole = (profile?.role as string) ?? 'crew'

  const { data: equipmentRows } = await supabase
    .from('equipment')
    .select('*')
    .order('name', { ascending: true })

  const equipment: EquipmentRow[] = (equipmentRows ?? []).map((row) => ({
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
    created_at: row.created_at,
    created_by: row.created_by,
  }))

  return (
    <EquipmentPageClient
      initialEquipment={equipment}
      userId={session.user.id}
      userRole={userRole}
    />
  )
}
