'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import type { JobWalk } from './JobWalkClient'
import NewAppointmentModal, {
  type AppointmentCompanyOption,
  type AppointmentContactOption,
  type AppointmentAssigneeOption,
} from '@/components/sales/NewAppointmentModal'

interface JobWalkPushMenuProps {
  walk: JobWalk
  userId: string
  // onPatch kept for API compatibility with the prior signature. Not
  // used by the new lateral pushes (decision A skips writing
  // job_walks.pushed_to since 'lead'/'appointment' aren't in its CHECK
  // constraint), but the detail page still passes it.
  onPatch: (patch: Partial<JobWalk>) => void
}

export default function JobWalkPushMenu({
  walk,
  userId,
  onPatch,
}: JobWalkPushMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; href?: string | null } | null>(null)
  // Appointment-modal state — mirrors LeadPushMenu's pattern. Lazily
  // loaded on first click so we don't pay the company/contact/profile
  // fetch cost unless the user actually opens the modal.
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

  function showToast(message: string, href?: string | null) {
    setToast({ message, href: href ?? null })
    setTimeout(() => setToast(null), 3500)
  }

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

  function handleAppointmentSaved(newApptId: string) {
    setShowAppointmentModal(false)
    // Per decision A: skip writing job_walks.pushed_to ('appointment' isn't
    // in the CHECK constraint). The toast carries the link so the user can
    // navigate to the new appointment if they want.
    showToast('Appointment created.', `/sales/appointments/${newApptId}`)
  }

  async function pushToLead() {
    setOpen(false)
    if (busy) return
    setBusy(true)
    const supabase = createClient()

    const { data: created, error: createErr } = await supabase
      .from('leads')
      .insert({
        project_name: walk.project_name,
        company_id: walk.company_id,
        customer_name: walk.customer_name,
        customer_email: walk.customer_email,
        customer_phone: walk.customer_phone,
        address: walk.address,
        project_address: walk.project_address,
        // walk.date is a plain DATE; leads.date is also DATE — copy verbatim.
        date: walk.date,
        project_details: walk.project_details,
        measurements: walk.measurements,
        lead_source: walk.lead_source,
        lead_category_id: walk.lead_category_id,
        assigned_to: walk.assigned_to,
        created_by: userId,
        status: 'new',
      })
      .select('id')
      .single()

    if (createErr || !created) {
      console.error('[JobWalkPushMenu] Push to lead failed:', {
        code: createErr?.code,
        message: createErr?.message,
        hint: createErr?.hint,
        details: createErr?.details,
      })
      showToast(`Push failed: ${createErr?.message ?? 'unknown error'}`)
      setBusy(false)
      return
    }

    // Per decision A: skip writing job_walks.pushed_to ('lead' isn't in
    // its CHECK constraint).

    showToast('Pushed to lead', `/sales/leads/${created.id}`)
    setBusy(false)
  }

  return (
    <>
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-60 rounded-lg transition-colors"
        >
          Push to…
          <ChevronDownIcon className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]">
            <button
              type="button"
              onClick={pushToLead}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to lead
            </button>
            <button
              type="button"
              onClick={handleClickPushAppointment}
              className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Push to appointment
            </button>
          </div>
        )}
      </div>

      {showAppointmentModal && (
        <NewAppointmentModal
          userId={userId}
          companies={appointmentCompanies}
          contacts={appointmentContacts}
          assignees={appointmentAssignees}
          prefill={{
            companyId: walk.company_id ?? undefined,
          }}
          onClose={() => setShowAppointmentModal(false)}
          onSaved={handleAppointmentSaved}
        />
      )}

      {toast && (
        <Portal>
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg"
            role="status"
          >
            {toast.message}
            {toast.href && (
              <a
                href={toast.href}
                className="ml-3 text-amber-300 hover:text-amber-200 underline"
              >
                View
              </a>
            )}
          </div>
        </Portal>
      )}
    </>
  )
}
