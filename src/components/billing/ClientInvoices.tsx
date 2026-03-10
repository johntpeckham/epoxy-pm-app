'use client'

import { FileTextIcon } from 'lucide-react'
import type { Customer, Invoice } from './types'

interface ClientInvoicesProps {
  customer: Customer
  invoices: Invoice[]
  allInvoices: Invoice[]
  userId: string
  onInvoiceChanged: () => void
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

export default function ClientInvoices({
  customer,
  invoices,
}: ClientInvoicesProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">{customer.name}</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <FileTextIcon className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No invoices for this customer yet.</p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {invoices.map((inv) => {
              const daysOverdue = inv.status === 'Overdue' ? getDaysOverdue(inv.due_date) : null
              return (
                <div
                  key={inv.id}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-900">
                      {inv.invoice_number}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inv.status] ?? STATUS_COLORS.Draft}`}>
                      {inv.status}
                      {daysOverdue && (
                        <span className="text-red-500 font-normal">({daysOverdue}d)</span>
                      )}
                    </span>
                  </div>
                  {inv.project_name && (
                    <p className="text-sm text-gray-700 truncate">{inv.project_name}</p>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">{inv.issued_date}</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${formatCurrency(inv.total ?? 0)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
