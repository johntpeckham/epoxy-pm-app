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
import NewJobWalkModal from './NewJobWalkModal'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import type { Customer } from '@/components/proposals/types'
import type { JobWalk } from './JobWalkClient'

interface ConvertToJobWalkModalProps {
  userId: string
  assignees?: AppointmentAssigneeOption[]
  categories?: LeadCategory[]
  // CompanyDetailClient passes this (no-source mode). Source-mode loads
  // the company itself.
  lockedCustomer?: LockedCustomer | null
  // Lateral push from Lead or Appointment detail page. When present the
  // modal pre-fills every field from the source row, copies photos and
  // measurement PDFs into the job-walk buckets, and flips the source
  // status on save.
  source?: { type: 'lead' | 'appointment'; id: string }
  onClose: () => void
  // Fired in no-source mode (CompanyDetailClient). Receives the full
  // JobWalk row + any newly-created customer.
  onCreated?: (walk: JobWalk, newCustomer?: Customer | null) => void
  // Fired in source mode (push menus).
  onSourcePushed?: (targetWalkId: string) => void
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

export default function ConvertToJobWalkModal(
  props: ConvertToJobWalkModalProps
) {
  if (!props.source) {
    return (
      <NewJobWalkModal
        userId={props.userId}
        customers={[]}
        assignees={props.assignees}
        categories={props.categories}
        lockedCustomer={props.lockedCustomer ?? null}
        onClose={props.onClose}
        onCreated={(walk, newCustomer) => {
          props.onCreated?.(walk, newCustomer)
        }}
      />
    )
  }
  return <ConvertToJobWalkFromSource {...props} source={props.source} />
}

function ConvertToJobWalkFromSource({
  userId,
  assignees = [],
  categories = [],
  source,
  onClose,
  onSourcePushed,
}: ConvertToJobWalkModalProps & {
  source: { type: 'lead' | 'appointment'; id: string }
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
        console.error('[ConvertToJobWalkModal] Source load failed:', {
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
        console.error('[ConvertToJobWalkModal] Photo count load failed:', {
          code: photoCountRes.error.code,
          message: photoCountRes.error.message,
          hint: photoCountRes.error.hint,
          details: photoCountRes.error.details,
        })
      } else {
        setPhotoCount(photoCountRes.count ?? 0)
      }
      if (pdfCountRes.error) {
        console.error('[ConvertToJobWalkModal] PDF count load failed:', {
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
          console.error('[ConvertToJobWalkModal] Company load failed:', {
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

  // job_walks.date is a plain DATE column (YYYY-MM-DD), matching leads.
  // Appointment source is timestamptz → slice. Lead source is already
  // YYYY-MM-DD → pass through.
  const initialDate = useMemo(() => {
    const d = sourceRow?.date
    if (!d) return undefined
    if (source.type === 'appointment') {
      const parsed = new Date(d)
      if (Number.isNaN(parsed.getTime())) return undefined
      return parsed.toISOString().slice(0, 10)
    }
    return d.length >= 10 ? d.slice(0, 10) : d
  }, [sourceRow, source.type])

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

    // pushed_to write: both `leads` and `crm_appointments` source CHECK
    // constraints permit 'job_walk'. Always write here.
    const sourcePushedToValue = 'job_walk'

    const result = await convertSourceLateral({
      supabase,
      userId,
      sourceType: source.type,
      sourceId: source.id,
      targetType: 'job_walk',
      targetInsertPayload: {
        project_name: data.projectName.trim() || 'Untitled Job Walk',
        company_id: data.customerId,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone,
        address: data.customerAddress,
        project_address: data.projectAddress,
        date: data.date || null,
        project_details: data.projectDetails,
        measurements: sourceRow?.measurements ?? null,
        lead_source: data.leadSource,
        lead_category_id: data.leadCategoryId,
        assigned_to: data.assignedTo,
        created_by: userId,
        status: 'upcoming',
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
        This {sourceLabelLower} will be pushed to a new job walk.
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
      title="Push to job walk"
      saveLabel="Create job walk"
      savingLabel="Creating…"
      projectDetailsPlaceholder="Scope, purpose of the visit, etc."
      mode={lockedCustomer ? 'from_company' : 'standalone'}
      lockedCustomer={lockedCustomer}
      userId={userId}
      assignees={assignees}
      categories={categories}
      showUnassignedAssigneeOption={false}
      disableAssigneeWhenNotAdmin={false}
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
