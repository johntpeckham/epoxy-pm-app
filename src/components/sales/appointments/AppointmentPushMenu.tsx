'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppointmentRow } from './AppointmentDetailClient'

interface AppointmentPushMenuProps {
  appointment: AppointmentRow
  userId: string
  onPatch: (patch: Partial<AppointmentRow>) => void
  showToast: (message: string, href?: string | null) => void
}

export default function AppointmentPushMenu({
  appointment,
  userId,
  onPatch,
  showToast,
}: AppointmentPushMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
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

  async function pushToJobWalk() {
    setOpen(false)
    if (busy) return
    setBusy(true)
    const supabase = createClient()

    const dateOnly = appointment.date ? new Date(appointment.date).toISOString().slice(0, 10) : null
    const { data: created, error: createErr } = await supabase
      .from('job_walks')
      .insert({
        project_name: appointment.project_name || appointment.title || 'Untitled Job Walk',
        company_id: appointment.company_id,
        customer_name: appointment.customer_name,
        customer_email: appointment.customer_email,
        customer_phone: appointment.customer_phone,
        address: appointment.address,
        date: dateOnly,
        project_details: appointment.project_details,
        measurements: appointment.measurements,
        lead_source: appointment.lead_source,
        lead_category_id: appointment.lead_category_id,
        assigned_to: appointment.assigned_to,
        created_by: userId,
        status: 'upcoming',
      })
      .select('id')
      .single()

    if (createErr || !created) {
      console.error('[AppointmentPushMenu] Push to job walk failed:', {
        code: createErr?.code,
        message: createErr?.message,
        hint: createErr?.hint,
        details: createErr?.details,
      })
      showToast(`Push failed: ${createErr?.message ?? 'unknown error'}`)
      setBusy(false)
      return
    }

    const { error: updateErr } = await supabase
      .from('crm_appointments')
      .update({ pushed_to: 'job_walk', pushed_ref_id: created.id })
      .eq('id', appointment.id)

    if (updateErr) {
      console.error('[AppointmentPushMenu] Update appointment after push failed:', updateErr)
    } else {
      onPatch({ pushed_to: 'job_walk', pushed_ref_id: created.id })
    }

    showToast('Pushed to job walk', `/job-walk/${created.id}`)
    setBusy(false)
  }

  async function pushToLead() {
    setOpen(false)
    if (busy) return
    setBusy(true)
    const supabase = createClient()

    // Drop the time-of-day component — leads.date is a plain DATE column,
    // not timestamptz. Matches pushToJobWalk's same trim.
    const dateOnly = appointment.date
      ? new Date(appointment.date).toISOString().slice(0, 10)
      : null

    const { data: created, error: createErr } = await supabase
      .from('leads')
      .insert({
        project_name:
          appointment.project_name || appointment.title || 'Untitled Lead',
        company_id: appointment.company_id,
        customer_name: appointment.customer_name,
        customer_email: appointment.customer_email,
        customer_phone: appointment.customer_phone,
        address: appointment.address,
        project_address: appointment.project_address,
        date: dateOnly,
        project_details: appointment.project_details,
        measurements: appointment.measurements,
        lead_source: appointment.lead_source,
        lead_category_id: appointment.lead_category_id,
        assigned_to: appointment.assigned_to,
        created_by: userId,
        status: 'new',
      })
      .select('id')
      .single()

    if (createErr || !created) {
      console.error('[AppointmentPushMenu] Push to lead failed:', {
        code: createErr?.code,
        message: createErr?.message,
        hint: createErr?.hint,
        details: createErr?.details,
      })
      showToast(`Push failed: ${createErr?.message ?? 'unknown error'}`)
      setBusy(false)
      return
    }

    // Per the prompt's decision A: skip writing source's pushed_to /
    // pushed_ref_id for new lateral directions. crm_appointments.pushed_to
    // CHECK doesn't permit 'lead' — writing it would fail. The target
    // row's existence is the only back-reference we leave behind for now.

    showToast('Pushed to lead', `/sales/leads/${created.id}`)
    setBusy(false)
  }

  return (
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
        <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]">
          <button
            type="button"
            onClick={pushToLead}
            className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Push to lead
          </button>
          <button
            type="button"
            onClick={pushToJobWalk}
            className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Push to job walk
          </button>
        </div>
      )}
    </div>
  )
}
