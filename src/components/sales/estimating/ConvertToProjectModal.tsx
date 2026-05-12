'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangleIcon, Loader2Icon, PencilIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase/client'
import { peekNextProjectNumber } from '@/lib/nextProjectNumber'
import {
  convertSourceToProject,
  type ConversionSourceType,
} from '@/lib/projectConversion'
import CreationFormModal, {
  type CreationFormData,
  type LockedCustomer,
} from '@/components/shared/CreationFormModal'
import type { Customer } from '@/components/proposals/types'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'
import type { EstimatingProject } from './types'
import ProjectAddressFields, {
  EMPTY_ADDRESS,
  type AddressValues,
} from './ProjectAddressFields'

interface ConvertToProjectModalProps {
  userId: string
  sourceType: ConversionSourceType
  sourceId: string
  customers: Customer[]
  onClose: () => void
  onConverted: (project: EstimatingProject) => void
}

// ─── Minimal source-row shape ────────────────────────────────────────
// We read the unified field set added across migrations 20260429 /
// 20260423 / 20260426 / 20260544 / 20260546. project_name (not name) is
// the source-side column; we map it into the project's `name` field.

interface SourceRowShape {
  id: string
  project_name: string | null
  company_id: string | null
  customer_email: string | null
  customer_phone: string | null
  project_address: string | null
  project_details: string | null
  measurements: string | null
  lead_source: string | null
  lead_category_id: string | null
  converted_to_project_id: string | null
}

const SOURCE_TABLE: Record<ConversionSourceType, string> = {
  lead: 'leads',
  appointment: 'crm_appointments',
  job_walk: 'job_walks',
}

const PHOTO_TABLE: Record<ConversionSourceType, { table: string; fk: string }> = {
  lead: { table: 'lead_photos', fk: 'lead_id' },
  appointment: { table: 'appointment_photos', fk: 'appointment_id' },
  job_walk: { table: 'job_walk_photos', fk: 'job_walk_id' },
}

const PDF_TABLE: Record<ConversionSourceType, { table: string; fk: string }> = {
  lead: { table: 'lead_measurement_pdfs', fk: 'lead_id' },
  appointment: { table: 'appointment_measurement_pdfs', fk: 'appointment_id' },
  job_walk: { table: 'job_walk_measurement_pdfs', fk: 'job_walk_id' },
}

const SOURCE_LABEL: Record<ConversionSourceType, string> = {
  lead: 'Lead',
  appointment: 'Appointment',
  job_walk: 'Job Walk',
}

// Compose the company's structured address columns into a single-line
// shape — still used by the locked-customer payload and the customers
// dropdown subtitle.
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

// Parse the source row's single-text project_address into the four
// structured fields the project table stores. Source format is
// historically "Street, City, ST Zip" (3 commas of trailing whitespace-
// split state+zip) but we handle 1-, 2-, 3-, and 4-part inputs.
// Malformed / no-comma input lands the whole string in `street` so the
// user can manually re-split city/state/zip themselves.
function parseSingleLineAddress(
  text: string | null | undefined
): AddressValues {
  if (!text || !text.trim()) return EMPTY_ADDRESS
  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 4) {
    return { street: parts[0], city: parts[1], state: parts[2], zip: parts[3] }
  }
  if (parts.length === 3) {
    const last = parts[2].split(/\s+/).filter(Boolean)
    const state = last[0] ?? ''
    const zip = last.slice(1).join(' ')
    return { street: parts[0], city: parts[1], state, zip }
  }
  if (parts.length === 2) {
    return { street: parts[0], city: parts[1], state: '', zip: '' }
  }
  return { street: parts[0] ?? text.trim(), city: '', state: '', zip: '' }
}

export default function ConvertToProjectModal({
  userId,
  sourceType,
  sourceId,
  customers,
  onClose,
  onConverted,
}: ConvertToProjectModalProps) {
  const supabase = useMemo(() => createClient(), [])

  // Loading / pre-flight state. The modal renders a spinner while these
  // settle; the form only mounts once everything's in hand so we never
  // briefly show an empty form before the pre-fill snaps in.
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [alreadyConverted, setAlreadyConverted] = useState(false)

  const [sourceRow, setSourceRow] = useState<SourceRowShape | null>(null)
  const [company, setCompany] = useState<Customer | null>(null)
  const [photoCount, setPhotoCount] = useState(0)
  const [pdfCount, setPdfCount] = useState(0)
  const [categories, setCategories] = useState<LeadCategory[]>([])

  // Project number — same peek/edit-override pattern as NewProjectModal.
  const [autoProjectNumber, setAutoProjectNumber] = useState<string | null>(null)
  const [projectNumber, setProjectNumber] = useState('')
  const [editingNumber, setEditingNumber] = useState(false)
  const [loadingNumber, setLoadingNumber] = useState(true)

  // Structured project address state — wrapper-owned, rendered in
  // extraSections. Auto-filled from the company's structured columns
  // when the company loads.
  const [projectAddress, setProjectAddress] = useState<AddressValues>(EMPTY_ADDRESS)
  const [sameAsCustomer, setSameAsCustomer] = useState(false)

  // Submission state. The CreationFormModal owns the saving spinner
  // (it toggles its own `saving` while awaiting onSubmit) — we only
  // need to track the error string for our inline banner.
  const [saveError, setSaveError] = useState<string | null>(null)

  // ─── Pre-flight load (source row + company + counts + categories) ──
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [
        sourceRes,
        photoCountRes,
        pdfCountRes,
        categoriesRes,
      ] = await Promise.all([
        supabase
          .from(SOURCE_TABLE[sourceType])
          .select(
            'id, project_name, company_id, customer_email, customer_phone, project_address, project_details, measurements, lead_source, lead_category_id, converted_to_project_id'
          )
          .eq('id', sourceId)
          .maybeSingle(),
        supabase
          .from(PHOTO_TABLE[sourceType].table)
          .select('id', { count: 'exact', head: true })
          .eq(PHOTO_TABLE[sourceType].fk, sourceId),
        supabase
          .from(PDF_TABLE[sourceType].table)
          .select('id', { count: 'exact', head: true })
          .eq(PDF_TABLE[sourceType].fk, sourceId),
        supabase
          .from('lead_categories')
          .select('*')
          .order('name', { ascending: true }),
      ])

      if (cancelled) return

      if (sourceRes.error || !sourceRes.data) {
        console.error('[ConvertToProjectModal] Source load failed:', {
          code: sourceRes.error?.code,
          message: sourceRes.error?.message,
          hint: sourceRes.error?.hint,
          details: sourceRes.error?.details,
        })
        setLoadError(
          sourceRes.error?.message ?? 'Source row not found.'
        )
        setLoading(false)
        return
      }

      const row = sourceRes.data as SourceRowShape
      setSourceRow(row)
      // Auto-fill the structured project address from the source's
      // single-text project_address column. Empty source → empty fields
      // (no company fallback — Customer Address handles that separately).
      setProjectAddress(parseSingleLineAddress(row.project_address))

      if (row.converted_to_project_id) {
        // The source detail page should prevent us from getting here in
        // most cases (Prompt 6 wires the earlier check), but if a stale
        // tab re-opens the modal after another tab converted, surface
        // the situation cleanly instead of double-creating.
        setAlreadyConverted(true)
        setLoading(false)
        return
      }

      // Photo / PDF counts — supabase returns count even when data is
      // empty (head:true). Null falls back to zero.
      if (photoCountRes.error) {
        console.error('[ConvertToProjectModal] Photo count load failed:', {
          code: photoCountRes.error.code,
          message: photoCountRes.error.message,
          hint: photoCountRes.error.hint,
          details: photoCountRes.error.details,
        })
      } else {
        setPhotoCount(photoCountRes.count ?? 0)
      }
      if (pdfCountRes.error) {
        console.error('[ConvertToProjectModal] PDF count load failed:', {
          code: pdfCountRes.error.code,
          message: pdfCountRes.error.message,
          hint: pdfCountRes.error.hint,
          details: pdfCountRes.error.details,
        })
      } else {
        setPdfCount(pdfCountRes.count ?? 0)
      }
      if (categoriesRes.error) {
        console.error('[ConvertToProjectModal] Categories load failed:', {
          code: categoriesRes.error.code,
          message: categoriesRes.error.message,
          hint: categoriesRes.error.hint,
          details: categoriesRes.error.details,
        })
      } else {
        setCategories((categoriesRes.data ?? []) as LeadCategory[])
      }

      // Resolve the company for the locked-customer block + the "Same
      // as customer address" checkbox. We no longer seed projectAddress
      // here — the source's project_address is the authoritative initial
      // value (set above).
      if (row.company_id) {
        const inMemory = customers.find((c) => c.id === row.company_id)
        if (inMemory) {
          setCompany(inMemory)
        } else {
          const { data: companyRow, error: companyErr } = await supabase
            .from('companies')
            .select('*')
            .eq('id', row.company_id)
            .maybeSingle()
          if (cancelled) return
          if (companyErr) {
            console.error('[ConvertToProjectModal] Company load failed:', {
              code: companyErr.code,
              message: companyErr.message,
              hint: companyErr.hint,
              details: companyErr.details,
            })
          } else if (companyRow) {
            setCompany(companyRow as Customer)
          }
        }
      }

      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [supabase, sourceType, sourceId, customers])

  // ─── Project number peek (independent of source load) ──────────────
  useEffect(() => {
    let cancelled = false
    peekNextProjectNumber(supabase, userId)
      .then((n) => {
        if (cancelled) return
        setAutoProjectNumber(n)
        setProjectNumber(n)
        setLoadingNumber(false)
      })
      .catch((err) => {
        console.error('[ConvertToProjectModal] Peek project number failed:', err)
        if (cancelled) return
        setAutoProjectNumber('1000')
        setProjectNumber('1000')
        setLoadingNumber(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  const isOverridden =
    autoProjectNumber !== null && projectNumber.trim() !== autoProjectNumber

  function cancelEditNumber() {
    if (autoProjectNumber !== null) setProjectNumber(autoProjectNumber)
    setEditingNumber(false)
  }

  // "Same as customer address" — copy the company's structured columns
  // directly into the four fields. Mirrors NewProjectModal. On uncheck,
  // leave fields where they are.
  const customerStructuredAddress: AddressValues = useMemo(
    () => ({
      street: company?.address ?? '',
      city: company?.city ?? '',
      state: company?.state ?? '',
      zip: company?.zip ?? '',
    }),
    [company]
  )

  // Keep project fields synced to the company while the checkbox is on.
  useEffect(() => {
    if (sameAsCustomer) {
      setProjectAddress(customerStructuredAddress)
    }
  }, [sameAsCustomer, customerStructuredAddress])

  function handleSameAsCustomerChange(checked: boolean) {
    if (checked) {
      setProjectAddress(customerStructuredAddress)
    }
    setSameAsCustomer(checked)
  }

  // Locked-customer payload for CreationFormModal. Building from the
  // source's snapshot for email/phone preserves whatever the user
  // captured at the source-creation moment (which may differ from the
  // live primary contact); address comes from the company's structured
  // columns since the source doesn't store a single-text customer
  // address.
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
    if (!projectNumber.trim()) return 'Project number cannot be empty.'

    setSaveError(null)

    const result = await convertSourceToProject({
      supabase,
      userId,
      sourceType,
      sourceId,
      projectFields: {
        name: data.projectName.trim(),
        company_id: data.customerId,
        email: data.customerEmail,
        phone: data.customerPhone,
        project_address_street: projectAddress.street.trim() || null,
        project_address_city: projectAddress.city.trim() || null,
        project_address_state: projectAddress.state.trim() || null,
        project_address_zip: projectAddress.zip.trim() || null,
        description: data.projectDetails,
        lead_source: data.leadSource,
        lead_category_id: data.leadCategoryId,
        // measurements text — pulled from the source row, not from the
        // shared modal (which doesn't surface measurements for the
        // Project entity). The user doesn't see this textarea on the
        // conversion form; the value travels verbatim.
        measurements: sourceRow?.measurements ?? null,
        // null tells the conversion util to call assignNextProjectNumber.
        // Non-null short-circuits to the typed override without
        // touching the sequence.
        project_number: isOverridden ? projectNumber.trim() : null,
      },
    })

    if (!result.success) {
      // Show inline; do NOT close the modal so the user can retry.
      setSaveError(result.error.message)
      // Returning a string here would let CreationFormModal show its own
      // error banner too — we render our own via saveError, so return
      // null and rely on saveError + the modal's own re-enabled state.
      return null
    }

    onConverted(result.project)
    onClose()
    return null
  }

  // ─── Render branches ───────────────────────────────────────────────

  // Loading: simple centered spinner inside the modal frame so the user
  // sees the modal open immediately. Avoids the "blank flash" between
  // open and ready.
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

  if (alreadyConverted) {
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
              Already converted
            </h3>
            <p className="text-sm text-gray-700">
              This {SOURCE_LABEL[sourceType].toLowerCase()} has already been
              converted to a project. Open that project from the source's
              detail page to view it.
            </p>
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

  // Render the form. lockedCustomer is required for from_company mode.
  // If the source has no company_id at all, fall back to standalone mode
  // so the user can pick one — but that's an edge case (every modern
  // create-source flow assigns a company).
  const sourceLabelLower = SOURCE_LABEL[sourceType].toLowerCase()
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
        This {sourceLabelLower} will be converted to a new project.
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
      title="Convert to project"
      saveLabel="Create project"
      savingLabel="Creating…"
      projectDetailsPlaceholder="Optional project notes…"
      mode={lockedCustomer ? 'from_company' : 'standalone'}
      lockedCustomer={lockedCustomer}
      customers={customers.map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: c.company,
        email: c.email,
        phone: c.phone,
        address:
          joinAddress({
            address: c.address,
            city: c.city,
            state: c.state,
            zip: c.zip,
          }) || null,
      }))}
      userId={userId}
      isAdmin={true}
      assignees={[]}
      categories={categories}
      hideProjectAddressField={true}
      hideDateField={true}
      hideAssignedToField={true}
      customerAddressReadOnly={true}
      // Inline new-customer creation isn't allowed during a conversion —
      // the source already linked a company, and changing customer
      // mid-conversion would silently invalidate the file-copy plan.
      hideAddNewCustomerButton={true}
      initialValues={{
        projectName: sourceRow?.project_name ?? '',
        projectDetails: sourceRow?.project_details ?? '',
        leadSource: sourceRow?.lead_source ?? '',
        leadCategoryId: sourceRow?.lead_category_id ?? '',
      }}
      slotAtTop={summaryBanner}
      slotAfterCustomer={
        <ProjectNumberField
          loading={loadingNumber}
          autoNumber={autoProjectNumber}
          value={projectNumber}
          onChange={setProjectNumber}
          editing={editingNumber}
          onEditToggle={setEditingNumber}
          onCancel={cancelEditNumber}
          isOverridden={isOverridden}
        />
      }
      extraSections={
        <ProjectAddressFields
          hideCustomerAddress
          customerAddress={customerStructuredAddress}
          projectAddress={projectAddress}
          sameAsCustomer={sameAsCustomer}
          onProjectAddressChange={setProjectAddress}
          onSameAsCustomerChange={handleSameAsCustomerChange}
        />
      }
      onSubmit={handleSubmit}
      onClose={onClose}
    />
  )
}

// ─── Co-located project-number field ───────────────────────────────────
// Identical visual + behavior to the one in NewProjectModal.tsx. Lifted
// here so the conversion modal doesn't import a non-exported component
// from its sibling.

interface ProjectNumberFieldProps {
  loading: boolean
  autoNumber: string | null
  value: string
  onChange: (next: string) => void
  editing: boolean
  onEditToggle: (next: boolean) => void
  onCancel: () => void
  isOverridden: boolean
}

function ProjectNumberField({
  loading,
  autoNumber,
  value,
  onChange,
  editing,
  onEditToggle,
  onCancel,
  isOverridden,
}: ProjectNumberFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Project number
      </label>
      {editing ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              autoFocus
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
              placeholder="e.g. 1006-P"
            />
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
          </div>
          {isOverridden && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                This is a one-time override. Your next project will return
                to the regular sequence. To change your sequence
                permanently, ask your admin to update it in Sales
                Management.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2Icon className="w-4 h-4 animate-spin" />
                <span>Loading…</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-900 truncate">
                  #{autoNumber}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Auto-assigned
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => onEditToggle(true)}
            disabled={loading}
            title="Edit project number"
            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition disabled:opacity-50"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
