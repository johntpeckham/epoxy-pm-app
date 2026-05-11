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
        .from('companies')
        .select('id, name, city, state')
        .order('name', { ascending: true }),
      supabase
        .from('contacts')
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

  async function handleAppointmentSaved(newApptId: string) {
    setShowAppointmentModal(false)
    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('leads')
      .update({
        status: 'appointment_set',
        pushed_to: 'appointment',
        pushed_ref_id: newApptId,
      })
      .eq('id', lead.id)
    if (updateErr) {
      console.error('[LeadPushMenu] Lead update after appointment-create failed:', {
        code: updateErr.code,
        message: updateErr.message,
        hint: updateErr.hint,
        details: updateErr.details,
      })
    }
    onPatch({ status: 'appointment_set', pushed_to: 'appointment', pushed_ref_id: newApptId })
    showToast('Appointment created.', `/sales/appointments/${newApptId}`)
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
          <ChevronDownIcon className="w-4 h-4" />
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
        company_id: lead.company_id,
        customer_name: lead.customer_name,
        customer_email: lead.customer_email,
        customer_phone: lead.customer_phone,
        address: lead.address,
        date: lead.date,
        status: 'upcoming',
        notes: includeProjectDetails ? lead.project_details : null,
        measurements: includeMeasurements ? lead.measurements : null,
        assigned_to: lead.assigned_to ?? userId,
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
        status: 'appointment_set',
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
      status: 'appointment_set',
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
            <h3 className="text-lg font-semibold text-gray-900">Push to job walk</h3>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
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
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500/20 focus:border-amber-500"
                />
                <span className="text-sm text-gray-700">Include project details</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMeasurements}
                  onChange={(e) => setIncludeMeasurements(e.target.checked)}
                  className="w-4 h-4 text-amber-500 border-gray-300 rounded focus:ring-amber-500/20 focus:border-amber-500"
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
