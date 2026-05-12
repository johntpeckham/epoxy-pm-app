'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase/client'
import {
  convertSourceLateral,
  type LateralSourceType,
} from '@/lib/lateralConversion'
import CreationFormModal, {
  type CreationFormData,
  type LockedCustomer,
} from '@/components/shared/CreationFormModal'
import NewAppointmentModal, {
  type AppointmentCompanyOption,
  type AppointmentContactOption,
  type AppointmentAssigneeOption,
  type LockedCompany,
} from './NewAppointmentModal'
import type { LeadCategory } from './leads/LeadsClient'
import type { Customer } from '@/components/proposals/types'

interface ConvertToAppointmentModalProps {
  userId: string
  isAdmin?: boolean
  contacts: AppointmentContactOption[]
  assignees: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  // CompanyDetailClient passes this (no-source mode). Source-mode loads
  // the company itself.
  lockedCustomer?: LockedCompany | null
  // Lateral push from Lead or Job Walk detail page. When present the
  // modal pre-fills every field from the source row, copies photos and
  // measurement PDFs into the appointment buckets, and flips the source
  // status on save.
  source?: { type: 'lead' | 'job_walk'; id: string }
  onClose: () => void
  // Fired in no-source mode (CompanyDetailClient).
  onSaved?: (createdId: string) => void
  // Fired in source mode (push menus).
  onSourcePushed?: (targetAppointmentId: string) => void
  onCompanyCreated?: (company: AppointmentCompanyOption) => void
}

const SOURCE_LABEL: Record<LateralSourceType, string> = {
  lead: 'Lead',
  appointment: 'Appointment',
  job_walk: 'Job Walk',
}

const SOURCE_TABLE: Record<LateralSourceType, string> = {
  lead: 'leads',
  appointment: 'crm_appointments',
  job_walk: 'job_walks',
}

const PHOTO_TABLE: Record<LateralSourceType, { table: string; fk: string }> = {
  lead: { table: 'lead_photos', fk: 'lead_id' },
  appointment: { table: 'appointment_photos', fk: 'appointment_id' },
  job_walk: { table: 'job_walk_photos', fk: 'job_walk_id' },
}

const PDF_TABLE: Record<LateralSourceType, { table: string; fk: string }> = {
  lead: { table: 'lead_measurement_pdfs', fk: 'lead_id' },
  appointment: { table: 'appointment_measurement_pdfs', fk: 'appointment_id' },
  job_walk: { table: 'job_walk_measurement_pdfs', fk: 'job_walk_id' },
}

interface SourceRowShape {
  id: string
  project_name: string | null
  company_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  address: string | null
  project_address: string | null
  date: string | null
  project_details: string | null
  measurements: string | null
  lead_source: string | null
  lead_category_id: string | null
  assigned_to: string | null
}

function joinAddress(parts: {
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}): string {
  return [parts.address, parts.city, parts.state, parts.zip]
    .map((p) => p?.trim() || '')
    .filter(Boolean)
    .join(', ')
}

export default function ConvertToAppointmentModal(
  props: ConvertToAppointmentModalProps
) {
  if (!props.source) {
    return (
      <NewAppointmentModal
        userId={props.userId}
        isAdmin={props.isAdmin}
        companies={[]}
        contacts={props.contacts}
        assignees={props.assignees}
        categories={props.categories}
        lockedCustomer={props.lockedCustomer ?? null}
        onClose={props.onClose}
        onSaved={(id) => props.onSaved?.(id)}
        onCompanyCreated={props.onCompanyCreated}
      />
    )
  }
  return <ConvertToAppointmentFromSource {...props} source={props.source} />
}

function ConvertToAppointmentFromSource({
  userId,
  isAdmin = true,
  contacts,
  assignees,
  categories = [],
  source,
  onClose,
  onSourcePushed,
}: ConvertToAppointmentModalProps & {
  source: { type: 'lead' | 'job_walk'; id: string }
}) {
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sourceRow, setSourceRow] = useState<SourceRowShape | null>(null)
  const [company, setCompany] = useState<Customer | null>(null)
  const [photoCount, setPhotoCount] = useState(0)
  const [pdfCount, setPdfCount] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [srcRes, photoCountRes, pdfCountRes] = await Promise.all([
        supabase
          .from(SOURCE_TABLE[source.type])
          .select(
            'id, project_name, company_id, customer_name, customer_email, customer_phone, address, project_address, date, project_details, measurements, lead_source, lead_category_id, assigned_to'
          )
          .eq('id', source.id)
          .maybeSingle(),
        supabase
          .from(PHOTO_TABLE[source.type].table)
          .select('id', { count: 'exact', head: true })
          .eq(PHOTO_TABLE[source.type].fk, source.id),
        supabase
          .from(PDF_TABLE[source.type].table)
          .select('id', { count: 'exact', head: true })
          .eq(PDF_TABLE[source.type].fk, source.id),
      ])
      if (cancelled) return

      if (srcRes.error || !srcRes.data) {
        console.error('[ConvertToAppointmentModal] Source load failed:', {
          code: srcRes.error?.code,
          message: srcRes.error?.message,
          hint: srcRes.error?.hint,
          details: srcRes.error?.details,
        })
        setLoadError(srcRes.error?.message ?? 'Source row not found.')
        setLoading(false)
        return
      }

      const row = srcRes.data as SourceRowShape
      setSourceRow(row)

      if (photoCountRes.error) {
        console.error('[ConvertToAppointmentModal] Photo count load failed:', {
          code: photoCountRes.error.code,
          message: photoCountRes.error.message,
          hint: photoCountRes.error.hint,
          details: photoCountRes.error.details,
        })
      } else {
        setPhotoCount(photoCountRes.count ?? 0)
      }
      if (pdfCountRes.error) {
        console.error('[ConvertToAppointmentModal] PDF count load failed:', {
          code: pdfCountRes.error.code,
          message: pdfCountRes.error.message,
          hint: pdfCountRes.error.hint,
          details: pdfCountRes.error.details,
        })
      } else {
        setPdfCount(pdfCountRes.count ?? 0)
      }

      if (row.company_id) {
        const { data: companyRow, error: companyErr } = await supabase
          .from('companies')
          .select('*')
          .eq('id', row.company_id)
          .maybeSingle()
        if (cancelled) return
        if (companyErr) {
          console.error('[ConvertToAppointmentModal] Company load failed:', {
            code: companyErr.code,
            message: companyErr.message,
            hint: companyErr.hint,
            details: companyErr.details,
          })
        } else if (companyRow) {
          setCompany(companyRow as Customer)
        }
      }

      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [supabase, source.type, source.id])

  // Lead/JobWalk date is YYYY-MM-DD on the source — keep as-is for the
  // date input. Insertion converts to ISO at T00:00:00 to match the
  // crm_appointments.date timestamptz column shape that the existing
  // NewAppointmentModal flow uses.
  const initialDate = useMemo(() => {
    const d = sourceRow?.date
    if (!d) return undefined
    return d.length >= 10 ? d.slice(0, 10) : d
  }, [sourceRow])

  const lockedCustomer: LockedCustomer | null = useMemo(() => {
    if (!company) return null
    return {
      id: company.id,
      name: company.name,
      address: joinAddress({
        address: company.address,
        city: company.city,
        state: company.state,
        zip: company.zip,
      }) || null,
      email: sourceRow?.customer_email ?? company.email ?? null,
      phone: sourceRow?.customer_phone ?? company.phone ?? null,
    }
  }, [company, sourceRow])

  async function handleSubmit(data: CreationFormData): Promise<string | null> {
    if (!data.customerId) return 'Customer is required.'
    if (!data.projectName.trim()) return 'Project name cannot be empty.'

    setSaveError(null)

    // Find a primary contact for the appointment's contact_id column.
    // Mirrors NewAppointmentModal.handleSubmit. Non-fatal if missing.
    let primaryContactId: string | null = null
    const inMemoryPrimary = contacts.find(
      (c) => c.company_id === data.customerId && c.is_primary
    )
    if (inMemoryPrimary) {
      primaryContactId = inMemoryPrimary.id
    } else {
      const { data: pc, error: pcErr } = await supabase
        .from('contacts')
        .select('id')
        .eq('company_id', data.customerId)
        .eq('is_primary', true)
        .maybeSingle()
      if (pcErr) {
        console.error(
          '[ConvertToAppointmentModal] Primary contact lookup failed:',
          {
            code: pcErr.code,
            message: pcErr.message,
            hint: pcErr.hint,
            details: pcErr.details,
          }
        )
      } else if (pc) {
        primaryContactId = (pc as { id: string }).id
      }
    }

    const iso = data.date
      ? new Date(`${data.date}T00:00:00`).toISOString()
      : null

    // pushed_to write: only the `lead` source table's CHECK constraint
    // permits 'appointment'. job_walks.pushed_to does not, so skip there.
    const sourcePushedToValue = source.type === 'lead' ? 'appointment' : null

    const result = await convertSourceLateral({
      supabase,
      userId,
      sourceType: source.type,
      sourceId: source.id,
      targetType: 'appointment',
      targetInsertPayload: {
        company_id: data.customerId,
        contact_id: primaryContactId,
        date: iso,
        assigned_to: data.assignedTo,
        status: 'scheduled',
        project_name: data.projectName.trim() || 'Untitled Appointment',
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone,
        address: data.customerAddress,
        project_address: data.projectAddress,
        project_details: data.projectDetails,
        measurements: sourceRow?.measurements ?? null,
        lead_source: data.leadSource,
        lead_category_id: data.leadCategoryId,
        created_by: userId,
      },
      sourcePushedToValue,
    })

    if (!result.success) {
      setSaveError(result.error.message)
      return null
    }

    onSourcePushed?.(result.targetId)
    onClose()
    return null
  }

  if (loading) {
    return (
      <Portal>
        <div
          className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
          onClick={onClose}
        >
          <div
            className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col items-center justify-center py-16"
            onClick={(e) => e.stopPropagation()}
          >
            <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
            <p className="mt-3 text-sm text-gray-500">Loading source…</p>
          </div>
        </div>
      </Portal>
    )
  }

  if (loadError) {
    return (
      <Portal>
        <div
          className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
          onClick={onClose}
        >
          <div
            className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col p-6 gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">
              Could not load source
            </h3>
            <p className="text-sm text-gray-700">{loadError}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Portal>
    )
  }

  const sourceLabelLower = SOURCE_LABEL[source.type].toLowerCase()
  const fileCountsLine =
    photoCount === 0 && pdfCount === 0
      ? null
      : [
          photoCount === 0
            ? null
            : `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`,
          pdfCount === 0
            ? null
            : `${pdfCount} measurement ${pdfCount === 1 ? 'PDF' : 'PDFs'}`,
        ]
          .filter(Boolean)
          .join(' and ')

  const summaryBanner = (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
      <p>
        This {sourceLabelLower} will be pushed to a new appointment.
        {fileCountsLine ? ` ${fileCountsLine} will be copied.` : ''}
      </p>
      {saveError && (
        <p className="mt-2 text-xs text-red-700 flex items-start gap-1.5">
          <AlertTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </p>
      )}
    </div>
  )

  return (
    <CreationFormModal
      title="Push to appointment"
      saveLabel="Create appointment"
      savingLabel="Creating…"
      projectDetailsPlaceholder="Scope, purpose of the meeting, etc."
      mode={lockedCustomer ? 'from_company' : 'standalone'}
      lockedCustomer={lockedCustomer}
      userId={userId}
      isAdmin={isAdmin}
      assignees={assignees}
      categories={categories}
      hideAddNewCustomerButton={true}
      customerAddressReadOnly={true}
      initialValues={{
        projectName: sourceRow?.project_name ?? '',
        projectDetails: sourceRow?.project_details ?? '',
        leadSource: sourceRow?.lead_source ?? '',
        leadCategoryId: sourceRow?.lead_category_id ?? '',
        projectAddress: sourceRow?.project_address ?? '',
        date: initialDate,
        assignedTo: sourceRow?.assigned_to ?? userId,
      }}
      slotAtTop={summaryBanner}
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  )
}
