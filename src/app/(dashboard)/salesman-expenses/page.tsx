export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SalesmanExpensesPageClient from '@/components/salesman-expenses/SalesmanExpensesPageClient'
import type { UserRole } from '@/types'

export default async function SalesmanExpensesPage() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return redirect('/login')
  const user = session.user

  // Fetch user role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role ?? 'crew') as UserRole

  // Only admin, office_manager, and salesman can access this page
  const allowedRoles: UserRole[] = ['admin', 'office_manager', 'salesman']
  if (!allowedRoles.includes(userRole)) {
    return redirect('/')
  }

  const isAdminOrOM = userRole === 'admin' || userRole === 'office_manager'

  // Fetch expenses — salesmen see only their own, admins/OMs see all
  let query = supabase
    .from('salesman_expenses')
    .select('*')
    .order('date', { ascending: false })

  if (!isAdminOrOM) {
    query = query.eq('user_id', user.id)
  }

  const { data: expenseRows } = await query

  // For admin/OM, fetch display names
  let expenses = (expenseRows ?? []) as Array<{
    id: string
    user_id: string
    description: string | null
    amount: number
    date: string
    receipt_url: string | null
    status: 'Unpaid' | 'Paid'
    notes: string | null
    created_at: string
    updated_at: string
    user_display_name?: string
  }>

  if (isAdminOrOM && expenses.length > 0) {
    const userIds = [...new Set(expenses.map((e) => e.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)

    const nameMap = new Map(
      (profiles ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? 'Unknown'])
    )

    expenses = expenses.map((e) => ({
      ...e,
      user_display_name: nameMap.get(e.user_id) ?? 'Unknown',
    }))
  }

  return (
    <SalesmanExpensesPageClient
      initialExpenses={expenses}
      userId={user.id}
      userRole={userRole}
    />
  )
}
