'use client'

import { createClient } from '@/lib/supabase/client'
import CreationFormModal, {
  type CreationFormData,
  type CustomerOption,
  type LockedCustomer,
} from '@/components/shared/CreationFormModal'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '../NewAppointmentModal'
import type { Lead, LeadCategory } from './LeadsClient'

export type { LockedCustomer }

interface AddLeadModalProps {
  userId: string
  isAdmin?: boolean
  customers: Customer[]
  categories: LeadCategory[]
  assignees?: AppointmentAssigneeOption[]
  lockedCustomer?: LockedCustomer | null
  onClose: () => void
  onCreated: (lead: Lead, newCustomer?: Customer | null) => void
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

export default function AddLeadModal({
  userId,
  isAdmin = true,
  customers,
  categories,
  assignees = [],
  lockedCustomer = null,
  onClose,
  onCreated,
}: AddLeadModalProps) {
  const customerOptions = customers.map(customerToOption)

  async function handleSubmit(data: CreationFormData): Promise<string | null> {
    const supabase = createClient()
    const { data: newLead, error: leadErr } = await supabase
      .from('leads')
      .insert({
        project_name: data.projectName,
        company_id: data.customerId,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone,
        address: data.customerAddress,
        project_address: data.projectAddress,
        date: data.date || null,
        lead_source: data.leadSource,
        lead_category_id: data.leadCategoryId,
        project_details: data.projectDetails,
        status: 'new',
        assigned_to: data.assignedTo,
        created_by: userId,
      })
      .select('*')
      .single()
    if (leadErr || !newLead) {
      console.error('[AddLeadModal] Create lead failed:', {
        code: leadErr?.code,
        message: leadErr?.message,
        hint: leadErr?.hint,
        details: leadErr?.details,
      })
      return `Failed to create lead: ${leadErr?.message ?? 'unknown error'}`
    }
    onCreated(newLead as Lead, data.createdCustomer)
    return null
  }

  return (
    <CreationFormModal
      title="Add Lead"
      saveLabel="Create Lead"
      projectDetailsPlaceholder="Scope, purpose of the project, etc."
      mode={lockedCustomer ? 'from_company' : 'standalone'}
      lockedCustomer={lockedCustomer}
      customers={customerOptions}
      userId={userId}
      isAdmin={isAdmin}
      assignees={assignees}
      categories={categories}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  )
}
