export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EquipmentQrClient from '@/components/equipment/EquipmentQrClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EquipmentQrPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: equipment } = await supabase
    .from('equipment')
    .select('id, name, category, year, make, model')
    .eq('id', id)
    .single()

  if (!equipment) notFound()

  return (
    <EquipmentQrClient
      equipment={{
        id: equipment.id,
        name: equipment.name,
        category: equipment.category,
        year: equipment.year,
        make: equipment.make,
        model: equipment.model,
      }}
    />
  )
}
