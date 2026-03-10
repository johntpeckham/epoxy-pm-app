'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MonitorIcon } from 'lucide-react'
import type { Customer, Invoice } from './types'
import BillingClientsPanel from './BillingClientsPanel'
import BillingDashboard from './BillingDashboard'
import ClientInvoices from './ClientInvoices'

interface BillingLayoutClientProps {
  initialCustomers: Customer[]
  initialInvoices: Invoice[]
  userId: string
}

export default function BillingLayoutClient({
  initialCustomers,
  initialInvoices,
  userId,
}: BillingLayoutClientProps) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices)
  const [selectedView, setSelectedView] = useState<'dashboard' | string>('dashboard')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const selectedCustomer = selectedView !== 'dashboard'
    ? customers.find((c) => c.id === selectedView) ?? null
    : null

  const customerInvoices = selectedCustomer
    ? invoices.filter((inv) => inv.client_id === selectedCustomer.id)
    : []

  async function refreshCustomers() {
    const supabase = createClient()
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true })
    if (data) setCustomers(data)
  }

  async function refreshInvoices() {
    const supabase = createClient()
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('issued_date', { ascending: false })
    if (data) setInvoices(data)
  }

  if (isMobile) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MonitorIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Desktop Only Feature</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Billing is designed for desktop use. Please open this page on a desktop or laptop for the best experience.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden w-full max-w-full">
      <BillingClientsPanel
        customers={customers}
        selectedView={selectedView}
        userId={userId}
        onSelectView={setSelectedView}
        onCustomerAdded={refreshCustomers}
      />
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-gray-50 flex flex-col">
        {selectedView === 'dashboard' ? (
          <BillingDashboard
            invoices={invoices}
            customers={customers}
          />
        ) : selectedCustomer ? (
          <ClientInvoices
            customer={selectedCustomer}
            invoices={customerInvoices}
            allInvoices={invoices}
            userId={userId}
            onInvoiceChanged={refreshInvoices}
          />
        ) : (
          <BillingDashboard
            invoices={invoices}
            customers={customers}
          />
        )}
      </div>
    </div>
  )
}
