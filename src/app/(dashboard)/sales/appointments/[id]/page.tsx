export const dynamic = 'force-dynamic'

import { CalendarCheckIcon } from 'lucide-react'
import Link from 'next/link'
import { requirePermission } from '@/lib/requirePermission'
import AppointmentDetailClient, {
  type AppointmentRow,
} from '@/components/sales/appointments/AppointmentDetailClient'
import type { Customer } from '@/components/proposals/types'
import type { AppointmentAssigneeOption } from '@/components/sales/NewAppointmentModal'
import type { LeadCategory } from '@/components/sales/leads/LeadsClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AppointmentDetailPage({ params }: PageProps) {
  const { supabase, user, permissions } = await requirePermission('appointments', 'view')
  const { id } = await params

  const { data: appt, error: apptErr } = await supabase
    .from('crm_appointments')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (apptErr) {
    console.error('[APPOINTMENT DETAIL FETCH ERROR]', {
      code: apptErr.code,
      message: apptErr.message,
      hint: apptErr.hint,
      details: apptErr.details,
    })
  }

  if (!appt) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CalendarCheckIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Appointment not found</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            This appointment doesn&apos;t exist or has been deleted.
          </p>
          <Link
            href="/sales/appointments"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition"
          >
            Back to Appointments
          </Link>
        </div>
      </div>
    )
  }

  const [{ data: custData, error: custErr }, { data: profData, error: profErr }, { data: catData, error: catErr }] =
    await Promise.all([
      supabase
        .from('companies')
        .select('*')
        .eq('archived', false)
        .order('name', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, display_name, role')
        .in('role', ['admin', 'office_manager', 'salesman'])
        .order('display_name', { ascending: true }),
      supabase
        .from('lead_categories')
        .select('*')
        .order('name', { ascending: true }),
    ])

  if (custErr) {
    console.error('[APPOINTMENT DETAIL CUSTOMERS ERROR]', {
      code: custErr.code,
      message: custErr.message,
      hint: custErr.hint,
      details: custErr.details,
    })
  }
  if (profErr) {
    console.error('[APPOINTMENT DETAIL PROFILES ERROR]', {
      code: profErr.code,
      message: profErr.message,
      hint: profErr.hint,
      details: profErr.details,
    })
  }
  if (catErr) {
    console.error('[APPOINTMENT DETAIL CATEGORIES ERROR]', {
      code: catErr.code,
      message: catErr.message,
      hint: catErr.hint,
      details: catErr.details,
    })
  }

  const customers = (custData ?? []) as Customer[]
  const assignees: AppointmentAssigneeOption[] = (
    (profData ?? []) as { id: string; display_name: string | null; role: string }[]
  ).map((p) => ({ id: p.id, display_name: p.display_name }))
  const categories = (catData ?? []) as LeadCategory[]

  return (
    <AppointmentDetailClient
      initialAppointment={appt as AppointmentRow}
      customers={customers}
      assignees={assignees}
      initialCategories={categories}
      userId={user.id}
      isAdmin={permissions.isAdmin}
    />
  )
}
