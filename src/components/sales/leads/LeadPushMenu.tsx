'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDownIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import type { Lead } from './LeadsClient'
import NewAppointmentModal, {
  type AppointmentCompanyOption,
  type AppointmentContactOption,
  type AppointmentAssigneeOption,
} from '../NewAppointmentModal'

interface LeadMeasurementPdf {
  id: string
  lead_id: string
  file_name: string
  file_url: string
  storage_path: string
  created_at: string
}

interface LeadPushMenuProps {
  lead: Lead
  userId: string
  onPatch: (patch: Partial<Lead>) => void
  showToast: (message: string, href?: string | null) => void
}

export default function LeadPushMenu({
  lead,
  userId,
  onPatch,
  showToast,
}: LeadPushMenuProps) {
  const [open, setOpen] = useState(false)
  const [showJobWalkConfirm, setShowJobWalkConfirm] = useState(false)
  const [showEstimatingConfirm, setShowEstimatingConfirm] = useState(false)
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [appointmentCompanies, setAppointmentCompanies] = useState<
    AppointmentCompanyOption[]
  >([])
  const [appointmentContacts, setAppointmentContacts] = useState<
    AppointmentContactOption[]
  >([])
  const [appointmentAssignees, setAppointmentAssignees] = useState<
    AppointmentAssigneeOption[]
  >([])
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [open])

  async function loadAppointmentData() {
    const supabase = createClient()
    const [{ data: comps }, { data: conts }, { data: profs }] = await Promise.all([
      supabase
        .from('crm_companies')
        .select('id, name, city, state')
        .order('name', { ascending: true }),
      supabase
        .from('crm_contacts')
        .select('id, company_id, first_name, last_name, phone, email, is_primary')
        .order('last_name', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, display_name, role')
        .in('role', ['admin', 'office_manager', 'salesman'])
        .order('display_name', { ascending: true }),
    ])
    setAppointmentCompanies((comps ?? []) as AppointmentCompanyOption[])
    setAppointmentContacts((conts ?? []) as AppointmentContactOption[])
    setAppointmentAssignees(
      ((profs ?? []) as { id: string; display_name: string | null }[]).map((p) => ({
        id: p.id,
        display_name: p.display_name,
      }))
    )
  }

  async function handleClickPushAppointment() {
    setOpen(false)
    await loadAppointmentData()
    setShowAppointmentModal(true)
  }

  async function handleAppointmentSaved() {
    setShowAppointmentModal(false)
    // Find the appointment we just created by matching on company/address/created_by
    const supabase = createClient()
    const { data } = await supabase
      .from('crm_appointments')
      .select('id')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(1)
    const newApptId =
      ((data ?? []) as { id: string }[])[0]?.id ?? null
    if (newApptId) {
      await supabase
        .from('leads')
        .update({
          pushed_to: 'appointment',
          pushed_ref_id: newApptId,
        })
        .eq('id', lead.id)
      onPatch({ pushed_to: 'appointment', pushed_ref_id: newApptId })
    }
    showToast('Appointment created.', '/sales/appointments')
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
        >
          Push to…
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]">
            <button
              type="button"
              onClick={handleClickPushAppointment}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to appointment
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setShowJobWalkConfirm(true)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to job walk
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setShowEstimatingConfirm(true)
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to estimating
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                showToast('Coming soon')
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
            >
              Push to estimate
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                showToast('Coming soon')
              }}
              className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
            >
              Push to job
            </button>
          </div>
        )}
      </div>

      {showJobWalkConfirm && (
        <PushToJobWalkModal
          lead={lead}
          userId={userId}
          onClose={() => setShowJobWalkConfirm(false)}
          onPatch={onPatch}
          showToast={showToast}
        />
      )}

      {showEstimatingConfirm && (
        <PushToEstimatingModal
          lead={lead}
          userId={userId}
          onClose={() => setShowEstimatingConfirm(false)}
          onPatch={onPatch}
          showToast={showToast}
        />
      )}

      {showAppointmentModal && (
        <NewAppointmentModal
          userId={userId}
          companies={appointmentCompanies}
          contacts={appointmentContacts}
          assignees={appointmentAssignees}
          prefill={{
            companyId: lead.company_id ?? undefined,
          }}
          onClose={() => setShowAppointmentModal(false)}
          onSaved={handleAppointmentSaved}
        />
      )}
    </>
  )
}

interface PushToJobWalkModalProps {
  lead: Lead
  userId: string
  onClose: () => void
  onPatch: (patch: Partial<Lead>) => void
  showToast: (message: string, href?: string | null) => void
}

function PushToJobWalkModal({
  lead,
  userId,
  onClose,
  onPatch,
  showToast,
}: PushToJobWalkModalProps) {
  const [includeProjectDetails, setIncludeProjectDetails] = useState(true)
  const [includeMeasurements, setIncludeMeasurements] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const { data: newWalk, error: walkErr } = await supabase
      .from('job_walks')
      .insert({
        project_name: lead.project_name,
        customer_id: lead.customer_id,
        customer_name: lead.customer_name,
        customer_email: lead.customer_email,
        customer_phone: lead.customer_phone,
        address: lead.address,
        date: lead.date,
        status: 'in_progress',
        notes: includeProjectDetails ? lead.project_details : null,
        measurements: includeMeasurements ? lead.measurements : null,
        created_by: userId,
      })
      .select('id')
      .single()

    if (walkErr || !newWalk) {
      setSaving(false)
      setError(`Failed to create job walk: ${walkErr?.message ?? 'unknown error'}`)
      return
    }
    const walkId = (newWalk as { id: string }).id

    const { error: updErr } = await supabase
      .from('leads')
      .update({
        status: 'completed',
        pushed_to: 'job_walk',
        pushed_ref_id: walkId,
      })
      .eq('id', lead.id)

    setSaving(false)
    if (updErr) {
      setError(`Failed to update lead: ${updErr.message}`)
      return
    }
    onPatch({
      status: 'completed',
      pushed_to: 'job_walk',
      pushed_ref_id: walkId,
    })
    showToast('Job walk created.', `/job-walk?walk=${walkId}`)
    onClose()
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-bold text-gray-900">Push to job walk</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <p className="text-sm text-gray-600">
              This will create a new job walk with the lead&apos;s project name,
              customer info, address, and date.
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeProjectDetails}
                  onChange={(e) => setIncludeProjectDetails(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm text-gray-700">Include project details</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMeasurements}
                  onChange={(e) => setIncludeMeasurements(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm text-gray-700">Include measurements</span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create job walk'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

interface PushToEstimatingModalProps {
  lead: Lead
  userId: string
  onClose: () => void
  onPatch: (patch: Partial<Lead>) => void
  showToast: (message: string, href?: string | null) => void
}

function PushToEstimatingModal({
  lead,
  userId,
  onClose,
  onPatch,
  showToast,
}: PushToEstimatingModalProps) {
  const [includeProjectDetails, setIncludeProjectDetails] = useState(true)
  const [includeMeasurements, setIncludeMeasurements] = useState(true)
  const [includePdfs, setIncludePdfs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ensureCustomer(): Promise<string | null> {
    if (lead.customer_id) return lead.customer_id
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', userId)
      .eq('name', lead.customer_name ?? lead.project_name)
      .limit(1)
    if (existing && existing.length > 0) {
      return (existing[0] as { id: string }).id
    }
    const { data: created, error: custErr } = await supabase
      .from('customers')
      .insert({
        user_id: userId,
        name: lead.customer_name ?? lead.project_name ?? 'New customer',
        email: lead.customer_email,
        phone: lead.customer_phone,
        address: lead.address,
      })
      .select('id')
      .single()
    if (custErr || !created) {
      setError(`Failed to create customer: ${custErr?.message ?? 'unknown error'}`)
      return null
    }
    return (created as { id: string }).id
  }

  async function handleConfirm() {
    setSaving(true)
    setError(null)

    const customerId = await ensureCustomer()
    if (!customerId) {
      setSaving(false)
      return
    }

    const supabase = createClient()

    const measurementsText = includeMeasurements ? lead.measurements : null
    const detailsText = includeProjectDetails ? lead.project_details : null

    const { data: newProject, error: projErr } = await supabase
      .from('estimating_projects')
      .insert({
        customer_id: customerId,
        name: lead.project_name,
        description: detailsText,
        status: 'active',
        source: 'lead',
        source_ref_id: lead.id,
        measurements: measurementsText,
        created_by: userId,
      })
      .select('*')
      .single()

    if (projErr || !newProject) {
      setSaving(false)
      setError(`Failed to create project: ${projErr?.message ?? 'unknown error'}`)
      return
    }
    const projectId = (newProject as { id: string }).id

    if (includePdfs) {
      const { data: pdfs } = await supabase
        .from('lead_measurement_pdfs')
        .select('*')
        .eq('lead_id', lead.id)
      const pdfRows = (pdfs ?? []) as LeadMeasurementPdf[]
      if (pdfRows.length > 0) {
        const inserts = pdfRows.map((p) => ({
          project_id: projectId,
          file_name: p.file_name,
          file_url: p.file_url,
          storage_path: p.storage_path,
        }))
        await supabase.from('estimating_project_measurement_pdfs').insert(inserts)
      }
    }

    const { error: updErr } = await supabase
      .from('leads')
      .update({
        status: 'completed',
        pushed_to: 'estimating',
        pushed_ref_id: projectId,
      })
      .eq('id', lead.id)

    setSaving(false)
    if (updErr) {
      setError(`Failed to update lead: ${updErr.message}`)
      return
    }
    onPatch({
      status: 'completed',
      pushed_to: 'estimating',
      pushed_ref_id: projectId,
    })
    showToast(
      'Estimating project created.',
      `/sales/estimating?customer=${customerId}&project=${projectId}`
    )
    onClose()
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-base font-bold text-gray-900">Push to estimating</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <p className="text-sm text-gray-600">
              This will create a new estimating project for this customer
              {lead.customer_id ? '' : ' (a customer record will also be created)'}.
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeProjectDetails}
                  onChange={(e) => setIncludeProjectDetails(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm text-gray-700">Include project details</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMeasurements}
                  onChange={(e) => setIncludeMeasurements(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm text-gray-700">Include measurements</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePdfs}
                  onChange={(e) => setIncludePdfs(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm text-gray-700">Include measurement PDFs</span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
