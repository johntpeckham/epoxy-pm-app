'use client'

import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import CreationFormModal, {
  type CreationFormData,
  type CustomerOption,
  type LockedCustomer,
} from '@/components/shared/CreationFormModal'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'

export interface AppointmentCompanyOption {
  id: string
  name: string
  city: string | null
  state: string | null
}

export interface AppointmentContactOption {
  id: string
  company_id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  is_primary: boolean
}

export interface AppointmentAssigneeOption {
  id: string
  display_name: string | null
}

export type LockedCompany = LockedCustomer

interface NewAppointmentModalProps {
  userId: string
  isAdmin?: boolean
  prefill?: { companyId?: string; contactId?: string | null }
  companies: AppointmentCompanyOption[]
  contacts: AppointmentContactOption[]
  assignees: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  lockedCustomer?: LockedCompany | null
  onClose: () => void
  onSaved: (createdId: string) => void
  onCompanyCreated?: (company: AppointmentCompanyOption) => void
}

export default function NewAppointmentModal({
  userId,
  isAdmin = true,
  prefill,
  companies,
  contacts,
  assignees,
  categories = [],
  lockedCustomer = null,
  onClose,
  onSaved,
  onCompanyCreated,
}: NewAppointmentModalProps) {
  const customerOptions: CustomerOption[] = useMemo(
    () =>
      companies.map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: [c.city, c.state].filter(Boolean).join(', ') || null,
      })),
    [companies]
  )

  async function handleSubmit(data: CreationFormData): Promise<string | null> {
    const supabase = createClient()
    const finalCompanyId =
      data.customerId ?? (data.createdCustomer ? null : prefill?.companyId ?? null)

    let primaryContactId: string | null = null
    if (finalCompanyId) {
      const inMemoryPrimary = contacts.find(
        (c) => c.company_id === finalCompanyId && c.is_primary
      )
      if (inMemoryPrimary) {
        primaryContactId = inMemoryPrimary.id
      } else {
        const { data: pc, error: pcErr } = await supabase
          .from('contacts')
          .select('id')
          .eq('company_id', finalCompanyId)
          .eq('is_primary', true)
          .maybeSingle()
        if (pcErr) {
          console.error('[NewAppointmentModal] Primary contact id lookup failed:', {
            code: pcErr.code,
            message: pcErr.message,
            hint: pcErr.hint,
            details: pcErr.details,
          })
        } else if (pc) {
          primaryContactId = (pc as { id: string }).id
        }
      }
    }

    const iso = data.date ? new Date(`${data.date}T00:00:00`).toISOString() : null

    const { data: created, error: err } = await supabase
      .from('crm_appointments')
      .insert({
        company_id: finalCompanyId,
        contact_id: primaryContactId,
        date: iso,
        assigned_to: data.assignedTo,
        status: 'scheduled',
        project_name: data.projectName,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone,
        address: data.customerAddress,
        project_address: data.projectAddress,
        project_details: data.projectDetails,
        lead_source: data.leadSource,
        lead_category_id: data.leadCategoryId,
        created_by: userId,
      })
      .select('id')
      .single()
    if (err || !created) {
      console.error('[NewAppointmentModal] Insert failed:', {
        code: err?.code,
        message: err?.message,
        hint: err?.hint,
        details: err?.details,
      })
      return err?.message ?? 'Failed to create appointment.'
    }

    if (data.createdCustomer && onCompanyCreated) {
      onCompanyCreated({
        id: data.createdCustomer.id,
        name: data.createdCustomer.name,
        city: data.createdCustomer.city,
        state: data.createdCustomer.state,
      })
    }

    onSaved(created.id as string)
    return null
  }

  return (
    <CreationFormModal
      title="New Appointment"
      saveLabel="Save"
      projectDetailsPlaceholder="Scope, purpose of the meeting, etc."
      mode={lockedCustomer ? 'from_company' : 'standalone'}
      lockedCustomer={lockedCustomer}
      customers={customerOptions}
      userId={userId}
      isAdmin={isAdmin}
      assignees={assignees}
      categories={categories}
      autoFillProjectName
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  )
}
