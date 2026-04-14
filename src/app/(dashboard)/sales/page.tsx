export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { UserRole } from '@/types'
import { UsersIcon, PhoneIcon, CalendarIcon } from 'lucide-react'

export default async function SalesPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role ?? 'crew') as UserRole

  if (
    userRole !== 'admin' &&
    userRole !== 'office_manager' &&
    userRole !== 'salesman'
  ) {
    return redirect('/my-work')
  }

  // CRM counts
  const [{ count: companyCountRaw }, { count: contactCountRaw }] = await Promise.all([
    supabase.from('crm_companies').select('id', { count: 'exact', head: true }),
    supabase.from('crm_contacts').select('id', { count: 'exact', head: true }),
  ])
  const companyCount = companyCountRaw ?? 0
  const contactCount = contactCountRaw ?? 0

  // Upcoming appointments count (scheduled in the future)
  const nowIso = new Date().toISOString()
  const { count: upcomingApptCountRaw } = await supabase
    .from('crm_appointments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .gte('date', nowIso)
  const upcomingApptCount = upcomingApptCountRaw ?? 0

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
      <p className="text-sm text-gray-500 mb-4">CRM, dialer, and appointments.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* ── CRM Card (spans 2 columns) ── */}
        <Link
          href="/sales/crm"
          className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300 hover:bg-gray-50 cursor-pointer block"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-500">
              <UsersIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">CRM</h3>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {companyCount} {companyCount === 1 ? 'company' : 'companies'} · {contactCount} {contactCount === 1 ? 'contact' : 'contacts'}
          </p>
        </Link>

        {/* ── Dialer Card (spans 2 columns) ── */}
        <Link
          href="/sales/dialer"
          className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300 hover:bg-gray-50 cursor-pointer block"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-500">
              <PhoneIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">Dialer</h3>
          </div>
          <p className="text-xs text-gray-500 mt-2">Start a call session</p>
        </Link>

        {/* ── Appointments Card (spans 2 columns) ── */}
        <Link
          href="/sales/appointments"
          className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300 hover:bg-gray-50 cursor-pointer block"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-500">
              <CalendarIcon className="w-5 h-5" />
            </span>
            <h3 className="text-sm font-semibold text-gray-900 flex-1">Appointments</h3>
          </div>
          <p className="text-xs text-gray-500 mt-2">{upcomingApptCount} upcoming</p>
        </Link>
      </div>
    </div>
  )
}
