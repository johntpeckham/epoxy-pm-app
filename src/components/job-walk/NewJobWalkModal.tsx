'use client'

import { createClient } from '@/lib/supabase/client'
import CreationFormModal, {
  type CreationFormData,
  type CustomerOption,
  type LockedCustomer,
} from '@/components/shared/CreationFormModal'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { JobWalk } from './JobWalkClient'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'

interface NewJobWalkModalProps {
  userId: string
  customers: Customer[]
  assignees?: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  prefill?: { customer: Customer }
  lockedCustomer?: LockedCustomer | null
  onClose: () => void
  onCreated: (walk: JobWalk, newCustomer?: Customer | null) => void
}

function customerToOption(c: Customer): CustomerOption {
  const fullAddr = [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')
  return {
    id: c.id,
    name: c.name,
    subtitle: c.company,
    email: c.email,
    phone: c.phone,
    address: fullAddr || null,
  }
}

export default function NewJobWalkModal({
  userId,
  customers,
  assignees = [],
  categories = [],
  prefill,
  lockedCustomer = null,
  onClose,
  onCreated,
}: NewJobWalkModalProps) {
  const customerOptions = customers.map(customerToOption)

  // Treat prefill.customer like a locked customer (existing behavior pre-filled
  // the search field with the customer name and selection).
  const effectiveLocked: LockedCustomer | null =
    lockedCustomer ??
    (prefill?.customer
      ? {
          id: prefill.customer.id,
          name: prefill.customer.name,
          address:
            [
              prefill.customer.address,
              prefill.customer.city,
              prefill.customer.state,
              prefill.customer.zip,
            ]
              .filter(Boolean)
              .join(', ') || null,
          email: prefill.customer.email,
          phone: prefill.customer.phone,
        }
      : null)

  async function handleSubmit(data: CreationFormData): Promise<string | null> {
    const supabase = createClient()
    const { data: newWalk, error: walkErr } = await supabase
      .from('job_walks')
      .insert({
        project_name: data.projectName,
        company_id: data.customerId,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone,
        address: data.customerAddress,
        project_address: data.projectAddress,
        date: data.date || null,
        project_details: data.projectDetails,
        lead_source: data.leadSource,
        lead_category_id: data.leadCategoryId,
        status: 'upcoming',
        assigned_to: data.assignedTo,
        created_by: userId,
      })
      .select('*')
      .single()
    if (walkErr || !newWalk) {
      console.error('[NewJobWalkModal] Create job walk failed:', {
        code: walkErr?.code,
        message: walkErr?.message,
        hint: walkErr?.hint,
        details: walkErr?.details,
      })
      return `Failed to create job walk: ${walkErr?.message ?? 'unknown error'}`
    }
    onCreated(newWalk as JobWalk, data.createdCustomer)
    return null
  }

  return (
    <CreationFormModal
      title="New Job Walk"
      saveLabel="Create Job Walk"
      savingLabel="Creating…"
      projectDetailsPlaceholder="Scope, purpose of the visit, etc."
      mode={effectiveLocked ? 'from_company' : 'standalone'}
      lockedCustomer={effectiveLocked}
      customers={customerOptions}
      userId={userId}
      assignees={assignees}
      categories={categories}
      showUnassignedAssigneeOption={false}
      disableAssigneeWhenNotAdmin={false}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  )
}
