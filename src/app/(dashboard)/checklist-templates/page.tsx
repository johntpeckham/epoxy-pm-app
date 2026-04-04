export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChecklistTemplatesClient from '@/components/checklist-templates/ChecklistTemplatesClient'

export default async function ChecklistTemplatesPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/my-work')
  }

  return <ChecklistTemplatesClient userId={session.user.id} />
}
