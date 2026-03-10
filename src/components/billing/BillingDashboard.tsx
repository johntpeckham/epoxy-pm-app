'use client'

import { useState, useMemo } from 'react'
import { FileTextIcon } from 'lucide-react'
import type { Invoice, Customer, TimeFilter } from './types'

interface BillingDashboardProps {
  invoices: Invoice[]
  customers: Customer[]
  onSelectInvoice?: (customerId: string, invoiceId: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Sent: 'bg-blue-100 text-blue-700',
  Paid: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
}

function getDaysOverdue(dueDate: string | null): number | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : null
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function BillingDashboard({ invoices, customers, onSelectInvoice }: BillingDashboardProps) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')

  const filteredInvoices = useMemo(() => {
    if (timeFilter === 'all') return invoices
    const now = new Date()
    const days = timeFilter === '365' ? 365 : 30
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    return invoices.filter((inv) => new Date(inv.issued_date) >= cutoff)
  }, [invoices, timeFilter])

  const customerMap = useMemo(() => {
    const map: Record<string, Customer> = {}
    customers.forEach((c) => { map[c.id] = c })
    return map
  }, [customers])

  const totalUnpaid = useMemo(() => {
    return filteredInvoices
      .filter((inv) => inv.status === 'Sent' || inv.status === 'Overdue' || inv.status === 'Draft')
      .reduce((sum, inv) => sum + (inv.total ?? 0), 0)
  }, [filteredInvoices])

  const overdueAmount = useMemo(() => {
    return filteredInvoices
      .filter((inv) => inv.status === 'Overdue')
      .reduce((sum, inv) => sum + (inv.total ?? 0), 0)
  }, [filteredInvoices])

  const notDueYetAmount = totalUnpaid - overdueAmount

  const totalPaid = useMemo(() => {
    return filteredInvoices
      .filter((inv) => inv.status === 'Paid')
      .reduce((sum, inv) => sum + (inv.total ?? 0), 0)
  }, [filteredInvoices])

  const grandTotal = totalUnpaid + totalPaid
  const unpaidPercent = grandTotal > 0 ? (totalUnpaid / grandTotal) * 100 : 0
  const paidPercent = grandTotal > 0 ? (totalPaid / grandTotal) * 100 : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">Invoice Dashboard</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {([['all', 'All Time'], ['365', 'Last 365 Days'], ['30', 'Last 30 Days']] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTimeFilter(value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                timeFilter === value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Total Unpaid */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-500 mb-1">Total Unpaid</p>
            <p className="text-2xl font-bold text-gray-900 mb-3">${formatCurrency(totalUnpaid)}</p>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div
                className="bg-red-400 h-2 rounded-full transition-all"
                style={{ width: `${unpaidPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Overdue: ${formatCurrency(overdueAmount)}</span>
              <span>Not due yet: ${formatCurrency(notDueYetAmount)}</span>
            </div>
          </div>

          {/* Total Paid */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-sm font-medium text-gray-500 mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-gray-900 mb-3">${formatCurrency(totalPaid)}</p>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
              <div
                className="bg-green-400 h-2 rounded-full transition-all"
                style={{ width: `${paidPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Deposited: ${formatCurrency(totalPaid)}</span>
              <span>Not deposited: $0.00</span>
            </div>
          </div>
        </div>

        {/* Invoice list */}
        {filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileTextIcon className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No invoices yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Date</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Invoice #</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Client / Project</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Amount</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const customer = customerMap[inv.client_id]
                  const daysOverdue = inv.status === 'Overdue' ? getDaysOverdue(inv.due_date) : null
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-gray-50 hover:bg-blue-50 transition-colors cursor-pointer"
                      onClick={() => onSelectInvoice?.(inv.client_id, inv.id)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-600">{inv.issued_date}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.invoice_number}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{customer?.name ?? 'Unknown'}</p>
                        {inv.project_name && (
                          <p className="text-xs text-gray-500">{inv.project_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                        ${formatCurrency(inv.total ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inv.status] ?? STATUS_COLORS.Draft}`}>
                          {inv.status}
                          {daysOverdue && (
                            <span className="text-red-500 font-normal">({daysOverdue}d)</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
