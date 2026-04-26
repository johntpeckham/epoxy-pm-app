export const dynamic = 'force-dynamic'

import { requirePermission } from '@/lib/requirePermission'
import ContactsPageClient from '@/components/office-contacts/ContactsPageClient'
import type { Customer } from '@/components/proposals/types'

export default async function ContactsPage() {
  const { supabase, user } = await requirePermission('office', 'view')

  const { data: customers } = await supabase
    .from('companies')
    .select('*')
    .eq('archived', false)
    .order('name', { ascending: true })

  return (
    <ContactsPageClient
      userId={user.id}
      initialContacts={(customers ?? []) as Customer[]}
    />
  )
}
