'use client'

import { useState } from 'react'
import { FileTextIcon, PlusIcon, FilePlusIcon, Trash2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { softDeleteInvoice } from '@/lib/trashBin'
import type { Customer, Invoice, LineItem } from './types'
import ChangeOrderModal from '../shared/ChangeOrderModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface ClientInvoicesProps {
  customer: Customer
  invoices: Invoice[]
  allInvoices: Invoice[]
  userId: string
  onInvoiceChanged: () => void
  onSelectInvoice: (id: string) => void
  onNewInvoice?: () => void
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
  userId,
  onInvoiceChanged,
  onSelectInvoice,
  onNewInvoice,
}: ClientInvoicesProps) {
  const [showChangeOrderModal, setShowChangeOrderModal] = useState(false)
  const [savingCO, setSavingCO] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total ?? 0), 0)
  const totalPaid = invoices.filter((inv) => inv.status === 'Paid').reduce((sum, inv) => sum + (inv.total ?? 0), 0)
  const totalOutstanding = invoices.filter((inv) => inv.status !== 'Paid' && inv.status !== 'Draft').reduce((sum, inv) => sum + (inv.total ?? 0), 0)

  const latestInvoice = invoices[0] ?? null

  async function handleDeleteInvoice() {
    if (!deleteTarget) return
    setIsDeleting(true)
    const supabase = createClient()
    const target = invoices.find((inv) => inv.id === deleteTarget)
    const displayName = target ? `Invoice ${target.invoice_number}` : 'Invoice'
    await softDeleteInvoice(supabase, deleteTarget, displayName, userId, target?.project_name || null)
    setIsDeleting(false)
    setDeleteTarget(null)
    onInvoiceChanged()
  }

  async function handleAddChangeOrder(coData: { description: string; lineItems: LineItem[]; notes: string }) {
    if (!latestInvoice) return
    setSavingCO(true)
    const supabase = createClient()
    const { count } = await supabase
      .from('change_orders')
      .select('*', { count: 'exact', head: true })
      .eq('invoice_id', latestInvoice.id)
    const coNumber = `CO-${(count ?? 0) + 1}`
    const sub = coData.lineItems.reduce((s, item) => {
      const amt = (!item.ft || item.ft === 0) ? (item.rate ?? 0) : (item.ft ?? 0) * (item.rate ?? 0)
      return s + amt
    }, 0)
    await supabase.from('change_orders').insert({
      parent_type: 'invoice',
      parent_id: latestInvoice.id,
      invoice_id: latestInvoice.id,
      change_order_number: coNumber,
      description: coData.description,
      line_items: coData.lineItems,
      subtotal: sub,
      status: 'Pending',
      notes: coData.notes || null,
      user_id: userId,
    })
    setSavingCO(false)
    setShowChangeOrderModal(false)
    onInvoiceChanged()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">{customer.name}</h2>
          <div className="flex items-center gap-2">
            {onNewInvoice && (
              <button
                onClick={onNewInvoice}
                className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                New Invoice
              </button>
            )}
            <button
              onClick={() => setShowChangeOrderModal(true)}
              disabled={!latestInvoice}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FilePlusIcon className="w-4 h-4" />
              New Change Order
            </button>
          </div>
        </div>
        {/* Summary bar */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Total Invoiced</span>
            <span className="text-xs font-semibold text-gray-900">${formatCurrency(totalInvoiced)}</span>
          </div>
          <div className="w-px h-3 bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Paid</span>
            <span className="text-xs font-semibold text-green-600">${formatCurrency(totalPaid)}</span>
          </div>
          <div className="w-px h-3 bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Outstanding</span>
            <span className="text-xs font-semibold text-amber-600">${formatCurrency(totalOutstanding)}</span>
          </div>
        </div>
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
                  onClick={() => onSelectInvoice(inv.id)}
                  className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer relative group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-900">
                      {inv.invoice_number}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inv.status] ?? STATUS_COLORS.Draft}`}>
                        {inv.status}
                        {daysOverdue && (
                          <span className="text-red-500 font-normal">({daysOverdue}d)</span>
                        )}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(inv.id) }}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                        title="Delete invoice"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
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
      {showChangeOrderModal && (
        <ChangeOrderModal
          onSave={handleAddChangeOrder}
          onClose={() => setShowChangeOrderModal(false)}
          saving={savingCO}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Invoice"
          message="Are you sure you want to move this invoice to the trash bin? You can restore it within 30 days."
          onConfirm={handleDeleteInvoice}
          onCancel={() => setDeleteTarget(null)}
          loading={isDeleting}
        />
      )}
    </div>
  )
}
