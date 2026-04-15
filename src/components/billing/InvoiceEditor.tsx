'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeftIcon, PlusIcon, XIcon, GripVerticalIcon, ChevronDownIcon, CheckIcon, FilePlusIcon, Trash2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { softDeleteInvoice, moveToTrash } from '@/lib/trashBin'
import type { Customer, Invoice, LineItem, ChangeOrder } from './types'
import ChangeOrderModal from '../shared/ChangeOrderModal'
import ChangeOrdersList from '../shared/ChangeOrdersList'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface InvoiceEditorProps {
  invoice: Invoice
  customer: Customer
  userId: string
  onBack: () => void
  onUpdated: () => void
  pendingChangeOrder?: boolean
  onChangeOrderHandled?: () => void
  onDeleted?: () => void
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function calcAmount(item: LineItem): number {
  if (!item.ft || item.ft === 0) return item.rate ?? 0
  return (item.ft ?? 0) * (item.rate ?? 0)
}

const STATUS_OPTIONS = ['Draft', 'Sent', 'Paid'] as const

export default function InvoiceEditor({
  invoice: initialInvoice,
  customer,
  userId,
  onBack,
  onUpdated,
  pendingChangeOrder,
  onChangeOrderHandled,
  onDeleted,
}: InvoiceEditorProps) {
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoice.invoice_number)
  const [issuedDate, setIssuedDate] = useState(initialInvoice.issued_date)
  const [dueDate, setDueDate] = useState(initialInvoice.due_date ?? '')
  const [projectName, setProjectName] = useState(initialInvoice.project_name ?? '')
  const [notes, setNotes] = useState(initialInvoice.notes ?? '')
  const [lineItems, setLineItems] = useState<LineItem[]>(
    (initialInvoice.line_items && initialInvoice.line_items.length > 0)
      ? initialInvoice.line_items
      : [{ id: genId(), description: '', ft: null, rate: null, amount: 0 }]
  )
  const [tax, setTax] = useState(initialInvoice.tax ?? 0)
  const [terms, setTerms] = useState(initialInvoice.terms ?? '')
  const [status, setStatus] = useState<string>(initialInvoice.status)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [showChangeOrderModal, setShowChangeOrderModal] = useState(false)
  const [savingCO, setSavingCO] = useState(false)
  const [customerName, setCustomerName] = useState(customer.name)
  const [customerCompany, setCustomerCompany] = useState(customer.company ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const invoiceIdRef = useRef(initialInvoice.id)

  // Open change order modal when triggered from panel
  useEffect(() => {
    if (pendingChangeOrder) {
      setShowChangeOrderModal(true)
      onChangeOrderHandled?.()
    }
  }, [pendingChangeOrder, onChangeOrderHandled])

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + calcAmount(item), 0)
  const total = subtotal + (tax || 0)

  // Auto-save with debounce
  const saveToDb = useCallback(async () => {
    setSaveStatus('saving')
    const supabase = createClient()
    const items = lineItems.map((item) => ({ ...item, amount: calcAmount(item) }))
    const sub = items.reduce((sum, item) => sum + item.amount, 0)
    const tot = sub + (tax || 0)

    await supabase
      .from('invoices')
      .update({
        invoice_number: invoiceNumber,
        issued_date: issuedDate,
        due_date: dueDate || null,
        project_name: projectName || null,
        notes: notes || null,
        line_items: items,
        subtotal: sub,
        tax: tax || null,
        total: tot,
        terms: terms || null,
        status,
      })
      .eq('id', invoiceIdRef.current)

    setSaveStatus('saved')
    onUpdated()
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [invoiceNumber, issuedDate, dueDate, projectName, notes, lineItems, tax, terms, status, onUpdated])

  // Debounced auto-save
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveToDb()
    }, 2000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [saveToDb])

  function updateLineItem(id: string, updates: Partial<LineItem>) {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    )
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { id: genId(), description: '', ft: null, rate: null, amount: 0 },
    ])
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((item) => item.id !== id))
  }

  function moveLineItem(index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= lineItems.length) return
    const newItems = [...lineItems]
    const [moved] = newItems.splice(index, 1)
    newItems.splice(newIndex, 0, moved)
    setLineItems(newItems)
  }

  async function handleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await saveToDb()
  }

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus)
    setShowStatusMenu(false)
  }

  // Fetch change orders on mount
  useEffect(() => {
    async function fetchChangeOrders() {
      const supabase = createClient()
      const { data } = await supabase
        .from('change_orders')
        .select('*')
        .eq('parent_type', 'invoice')
        .eq('parent_id', invoiceIdRef.current)
        .order('created_at', { ascending: true })
      if (data) setChangeOrders(data)
    }
    fetchChangeOrders()
  }, [])

  async function handleAddChangeOrder(coData: { description: string; lineItems: LineItem[]; notes: string }) {
    setSavingCO(true)
    const supabase = createClient()
    const coNumber = `CO-${changeOrders.length + 1}`
    const sub = coData.lineItems.reduce((sum, item) => sum + item.amount, 0)

    const { data } = await supabase
      .from('change_orders')
      .insert({
        parent_type: 'invoice',
        parent_id: invoiceIdRef.current,
        change_order_number: coNumber,
        description: coData.description,
        line_items: coData.lineItems,
        subtotal: sub,
        status: 'Pending',
        notes: coData.notes || null,
        user_id: userId,
      })
      .select()
      .single()

    if (data) {
      setChangeOrders((prev) => [...prev, data])
      setShowChangeOrderModal(false)
    }
    setSavingCO(false)
  }

  async function handleUpdateCOStatus(id: string, newStatus: 'Pending' | 'Approved' | 'Rejected') {
    const supabase = createClient()
    await supabase.from('change_orders').update({ status: newStatus }).eq('id', id)
    setChangeOrders((prev) => prev.map((co) => co.id === id ? { ...co, status: newStatus } : co))
  }

  async function handleDeleteCO(id: string) {
    const supabase = createClient()
    const co = changeOrders.find((c) => c.id === id)
    if (co) {
      await moveToTrash(supabase, 'change_order', id, co.change_order_number || `Change Order`, userId, co as unknown as Record<string, unknown>, projectName || null)
    }
    setChangeOrders((prev) => prev.filter((co) => co.id !== id))
  }

  async function handleDeleteInvoice() {
    setIsDeleting(true)
    const supabase = createClient()
    const displayName = `Invoice ${invoiceNumber}`
    await softDeleteInvoice(supabase, invoiceIdRef.current, displayName, userId, projectName || null)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    onDeleted?.()
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to {customer.name}
        </button>
        <div className="flex items-center gap-2">
          {/* Save status */}
          <span className="text-xs text-gray-400">
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Saved \u2713'}
          </span>
          {/* Save button */}
          <button
            onClick={handleSave}
            className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            Save
          </button>
          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              {status}
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
            {showStatusMenu && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                  >
                    {status === s && <CheckIcon className="w-3 h-3 text-amber-500" />}
                    <span className={status === s ? 'font-medium' : ''}>{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Change Order */}
          <button
            onClick={() => setShowChangeOrderModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FilePlusIcon className="w-3.5 h-3.5" />
            Change Order
          </button>
          {/* Delete */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg hover:border-red-200 transition-colors"
            title="Delete invoice"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Change Order Modal */}
      {showChangeOrderModal && (
        <ChangeOrderModal
          onSave={handleAddChangeOrder}
          onClose={() => setShowChangeOrderModal(false)}
          saving={savingCO}
        />
      )}

      {/* Invoice form */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 md:px-8 pt-8 pb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-bold text-gray-900">Peckham Inc. DBA Peckham Coatings</h1>
                <p className="text-sm text-gray-500">1865 Herndon Ave K106, Clovis, CA 93611</p>
                <p className="text-sm text-gray-500">www.PeckhamCoatings.com</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <h2 className="text-3xl font-bold text-amber-500">Invoice</h2>
              </div>
            </div>
          </div>

          {/* Address + Invoice info */}
          <div className="px-4 md:px-8 py-4 flex justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="block text-sm font-medium text-gray-900 border-0 border-b border-transparent hover:border-gray-300 focus:border-amber-500 focus:ring-0 p-0 pb-0.5 w-64 bg-transparent"
              />
              <input
                type="text"
                value={customerCompany}
                onChange={(e) => setCustomerCompany(e.target.value)}
                className="block text-sm text-gray-600 border-0 border-b border-transparent hover:border-gray-300 focus:border-amber-500 focus:ring-0 p-0 pb-0.5 w-64 bg-transparent mt-0.5"
                placeholder="Company"
              />
            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Invoice #</span>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-28 text-right text-sm font-semibold text-amber-600 border border-amber-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Issued</span>
                <input
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                  className="text-sm text-gray-700 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Due</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="text-sm text-gray-700 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Project info row */}
          <div className="px-4 md:px-8 py-3 bg-gray-50 border-y border-gray-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full text-sm text-gray-900 bg-transparent border-0 border-b border-amber-200 focus:border-amber-500 focus:ring-0 p-0 pb-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-sm text-gray-900 bg-transparent border-0 border-b border-amber-200 focus:border-amber-500 focus:ring-0 p-0 pb-1"
                  placeholder="Payment notes..."
                />
              </div>
            </div>
          </div>

          {/* Line items table */}
          <div className="px-4 md:px-8 py-4">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-amber-500">
                  <th className="w-8"></th>
                  <th className="text-left text-xs font-semibold text-amber-700 uppercase tracking-wide py-2">Description</th>
                  <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wide py-2 w-20">QTY</th>
                  <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wide py-2 w-24">Rate</th>
                  <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wide py-2 w-28">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-gray-100 group">
                    <td className="py-2">
                      <div className="flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveLineItem(index, -1)}
                          className="text-gray-400 hover:text-gray-600 text-xs leading-none"
                          disabled={index === 0}
                        >
                          &#9650;
                        </button>
                        <GripVerticalIcon className="w-3 h-3 text-gray-300" />
                        <button
                          onClick={() => moveLineItem(index, 1)}
                          className="text-gray-400 hover:text-gray-600 text-xs leading-none"
                          disabled={index === lineItems.length - 1}
                        >
                          &#9660;
                        </button>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <textarea
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                        rows={2}
                        className="w-full text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        placeholder="Description..."
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={item.ft ?? ''}
                        onChange={(e) => updateLineItem(item.id, { ft: e.target.value ? Number(e.target.value) : null })}
                        className="w-full text-right text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={item.rate ?? ''}
                        onChange={(e) => updateLineItem(item.id, { rate: e.target.value ? Number(e.target.value) : null })}
                        className="w-full text-right text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="py-2 text-right text-sm font-medium text-gray-900 px-2">
                      ${calcAmount(item).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => removeLineItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={addLineItem}
              className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 mt-2 transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Line Item
            </button>
          </div>

          {/* Totals */}
          <div className="px-4 md:px-8 py-4 border-t border-gray-200">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Tax</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={tax || ''}
                      onChange={(e) => setTax(e.target.value ? Number(e.target.value) : 0)}
                      className="w-24 text-right text-sm text-gray-900 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20 focus:border-amber-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Change Orders */}
          <ChangeOrdersList
            changeOrders={changeOrders}
            originalTotal={total}
            onUpdateStatus={handleUpdateCOStatus}
            onDelete={handleDeleteCO}
          />

          {/* Terms */}
          {(terms || true) && (
            <div className="px-4 md:px-8 py-4 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Terms and Conditions</p>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={6}
                className="w-full text-xs text-gray-600 leading-relaxed border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="Payment terms..."
              />
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Invoice"
          message="Are you sure you want to move this invoice to the trash bin? You can restore it within 30 days."
          onConfirm={handleDeleteInvoice}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}
    </div>
  )
}
