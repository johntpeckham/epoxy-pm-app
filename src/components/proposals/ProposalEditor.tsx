'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeftIcon, PlusIcon, XIcon, GripVerticalIcon, ChevronDownIcon, CheckIcon, ReceiptIcon, FilePlusIcon, Trash2Icon, SendIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { softDeleteProposal, moveToTrash } from '@/lib/trashBin'
import { applyDefaultChecklist } from '@/lib/applyDefaultChecklist'
import type { Customer, Proposal, ProposalSettings, LineItem, ChangeOrder, MaterialSystemRow } from './types'
import { DEFAULT_TERMS } from './types'
import { exportProposalPdf } from './pdfExport'
import ChangeOrderModal from '../shared/ChangeOrderModal'
import ChangeOrdersList from '../shared/ChangeOrdersList'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useMaterialSystems } from '@/lib/useMaterialSystems'
import MaterialSystemPicker from '@/components/ui/MaterialSystemPicker'
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import SendProposalModal from '@/components/sales/estimating/SendProposalModal'
import type { EstimatingProject } from '@/components/sales/estimating/types'

interface ProposalEditorProps {
  proposal: Proposal
  customer: Customer
  settings: ProposalSettings | null
  userId: string
  onBack: () => void
  onUpdated: () => void
  onOpenSettings: () => void
  pendingChangeOrder?: boolean
  onChangeOrderHandled?: () => void
  onDeleted?: () => void
  backContext?: { url: string; label: string } | null
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function calcAmount(item: LineItem): number {
  if (!item.ft || item.ft === 0) return item.rate ?? 0
  return (item.ft ?? 0) * (item.rate ?? 0)
}

const STATUS_OPTIONS = ['Draft', 'Sent', 'Accepted', 'Declined', 'Invoiced'] as const

function formatShortDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function statusBadgeClasses(status: string): string {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap'
  if (status === 'Sent') return `${base} bg-amber-100 text-amber-700`
  if (status === 'Accepted') return `${base} bg-green-100 text-green-700`
  if (status === 'Declined') return `${base} bg-red-100 text-red-700`
  if (status === 'Invoiced') return `${base} bg-blue-100 text-blue-700`
  return `${base} bg-gray-100 text-gray-600`
}

export default function ProposalEditor({
  proposal: initialProposal,
  customer,
  settings,
  userId,
  onBack,
  onUpdated,
  onOpenSettings,
  pendingChangeOrder,
  onChangeOrderHandled,
  onDeleted,
  backContext,
}: ProposalEditorProps) {
  const searchParams = useSearchParams()
  const fromParam = searchParams?.get('from') ?? null
  const projectIdParam = searchParams?.get('project') ?? null
  // DB column kept as estimate_number until Phase 4.
  const [proposalNumber, setProposalNumber] = useState(initialProposal.estimate_number)
  const [date, setDate] = useState(initialProposal.date)
  const [projectName, setProjectName] = useState(initialProposal.project_name ?? '')
  const [description, setDescription] = useState(initialProposal.description ?? '')
  const [salesperson, setSalesperson] = useState(initialProposal.salesperson ?? '')
  const [lineItems, setLineItems] = useState<LineItem[]>(
    (initialProposal.line_items && initialProposal.line_items.length > 0)
      ? initialProposal.line_items
      : [{ id: genId(), description: '', ft: null, rate: null, amount: 0 }]
  )
  const [tax, setTax] = useState(initialProposal.tax ?? 0)
  const [terms, setTerms] = useState(initialProposal.terms ?? DEFAULT_TERMS)
  const [status, setStatus] = useState<Proposal['status']>(initialProposal.status)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [pushSuccess, setPushSuccess] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showConvertConfirm, setShowConvertConfirm] = useState(false)
  const [convertSuccess, setConvertSuccess] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [showChangeOrderModal, setShowChangeOrderModal] = useState(false)
  const [savingCO, setSavingCO] = useState(false)
  const [customerName, setCustomerName] = useState(customer.name)
  const [customerCompany, setCustomerCompany] = useState(customer.company ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [materialSystemRows, setMaterialSystemRows] = useState<MaterialSystemRow[]>(
    initialProposal.material_systems ?? []
  )
  const [showSendModal, setShowSendModal] = useState(false)
  const [project, setProject] = useState<EstimatingProject | null>(null)
  const [sentAt, setSentAt] = useState<string | null>(initialProposal.sent_at ?? null)
  const [acceptedAt, setAcceptedAt] = useState<string | null>(initialProposal.accepted_at ?? null)
  const [declinedAt, setDeclinedAt] = useState<string | null>(initialProposal.declined_at ?? null)
  const { systems: allMaterialSystems, addSystem: addMaterialSystem, updateSystem: updateMaterialSystem } = useMaterialSystems()

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const proposalIdRef = useRef(initialProposal.id)

  // Open change order modal when triggered from panel
  useEffect(() => {
    if (pendingChangeOrder) {
      setShowChangeOrderModal(true)
      onChangeOrderHandled?.()
    }
  }, [pendingChangeOrder, onChangeOrderHandled])

  // Load estimating project when opened from the estimating workflow
  useEffect(() => {
    if (fromParam !== 'estimating' || !projectIdParam) return
    let cancelled = false
    async function loadProject() {
      const supabase = createClient()
      const { data } = await supabase
        .from('estimating_projects')
        .select('*')
        .eq('id', projectIdParam)
        .maybeSingle()
      if (!cancelled && data) setProject(data as EstimatingProject)
    }
    loadProject()
    return () => {
      cancelled = true
    }
  }, [fromParam, projectIdParam])

  const companyName = settings?.company_name ?? 'Peckham Inc. DBA Peckham Coatings'
  const companyAddress = settings?.company_address ?? '1865 Herndon Ave K106, Clovis, CA 93611'
  const companyWebsite = settings?.company_website ?? 'www.PeckhamCoatings.com'

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
      .from('estimates')
      .update({
        estimate_number: proposalNumber,
        date,
        project_name: projectName,
        description,
        salesperson,
        line_items: items,
        material_systems: materialSystemRows,
        subtotal: sub,
        tax,
        total: tot,
        terms,
        status,
      })
      .eq('id', proposalIdRef.current)

    setSaveStatus('saved')
    onUpdated()
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [proposalNumber, date, projectName, description, salesperson, lineItems, materialSystemRows, tax, terms, status, onUpdated])

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

  async function handleStatusChange(newStatus: Proposal['status']) {
    setStatus(newStatus)
    setShowStatusMenu(false)
  }

  async function handlePushToJobs() {
    const supabase = createClient()
    const { data: newProject, error } = await supabase.from('projects').insert({
      name: projectName || `Proposal #${proposalNumber}`,
      client_name: customerName,
      address: [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', '),
      status: 'Active',
      estimate_number: String(proposalNumber),
    }).select('id').single()
    if (!error) {
      // Auto-apply default checklist template
      if (newProject) {
        await applyDefaultChecklist(supabase, newProject.id)
      }
      setPushSuccess(true)
      setTimeout(() => setPushSuccess(false), 3000)
    }
  }

  function handleExportPdf() {
    const items = lineItems.map((item) => ({ ...item, amount: calcAmount(item) }))
    const result = exportProposalPdf({
      proposalNumber,
      date,
      customerName,
      customerCompany,
      customerAddress: [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(', '),
      projectName,
      description,
      salesperson,
      lineItems: items,
      materialSystems: materialSystemRows,
      subtotal,
      tax,
      total,
      terms,
      companyName,
      companyAddress,
      companyWebsite,
      logoBase64: settings?.logo_base64 ?? null,
    })
    setPdfPreview({ ...result, title: 'Proposal' })
    setShowPreview(true)
  }

  // Fetch change orders on mount
  useEffect(() => {
    async function fetchChangeOrders() {
      const supabase = createClient()
      const { data } = await supabase
        .from('change_orders')
        .select('*')
        .eq('estimate_id', proposalIdRef.current)
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
        parent_type: 'estimate',
        parent_id: proposalIdRef.current,
        estimate_id: proposalIdRef.current,
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

  async function handleConvertToInvoice() {
    setConverting(true)
    setConvertError(null)
    const supabase = createClient()

    // Check if invoice already exists with same number
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_number', String(proposalNumber))
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      setConvertError('This proposal has already been converted to an invoice')
      setConverting(false)
      setShowConvertConfirm(false)
      setTimeout(() => setConvertError(null), 4000)
      return
    }

    const items = lineItems.map((item) => ({ ...item, amount: calcAmount(item) }))
    const sub = items.reduce((sum, item) => sum + item.amount, 0)
    const tot = sub + (tax || 0)

    const { error } = await supabase.from('invoices').insert({
      invoice_number: String(proposalNumber),
      company_id: customer.id,
      estimate_id: proposalIdRef.current,
      project_name: projectName || null,
      line_items: items,
      subtotal: sub,
      tax: tax || null,
      total: tot,
      status: 'Draft',
      issued_date: new Date().toISOString().split('T')[0],
      notes: null,
      terms,
      user_id: userId,
    })

    if (!error) {
      // Update proposal status to Invoiced
      setStatus('Invoiced')
      await supabase
        .from('estimates')
        .update({ status: 'Invoiced' })
        .eq('id', proposalIdRef.current)
      onUpdated()

      setShowConvertConfirm(false)
      setConvertSuccess(true)
      setTimeout(() => setConvertSuccess(false), 3000)
    }
    setConverting(false)
  }

  async function completePendingReminders() {
    if (!project) return
    const supabase = createClient()
    await supabase
      .from('estimating_reminders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .eq('status', 'pending')
  }

  async function handleMarkAccepted() {
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase
      .from('estimates')
      .update({ status: 'Accepted', accepted_at: now })
      .eq('id', proposalIdRef.current)
    setStatus('Accepted')
    setAcceptedAt(now)
    await completePendingReminders()
    onUpdated()
  }

  async function handleMarkDeclined() {
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase
      .from('estimates')
      .update({ status: 'Declined', declined_at: now })
      .eq('id', proposalIdRef.current)
    setStatus('Declined')
    setDeclinedAt(now)
    await completePendingReminders()
    onUpdated()
  }

  async function handleOpenSend() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await saveToDb()
    setShowSendModal(true)
  }

  async function handleDeleteProposal() {
    setIsDeleting(true)
    const supabase = createClient()
    const displayName = `Proposal #${proposalNumber}`
    await softDeleteProposal(supabase, proposalIdRef.current, displayName, userId, projectName || null)
    setIsDeleting(false)
    setShowDeleteConfirm(false)
    onDeleted?.()
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        {backContext ? (
          <Link
            href={backContext.url}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {backContext.label}
          </Link>
        ) : (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to {customer.name}
          </button>
        )}
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
              <ChevronDownIcon className="w-4 h-4" />
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
            <FilePlusIcon className="w-4 h-4" />
            Change Order
          </button>
          {/* Export PDF */}
          <button
            onClick={handleExportPdf}
            className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Export PDF
          </button>
          {/* Status badge */}
          <span className={statusBadgeClasses(status)}>
            {status === 'Sent' && sentAt
              ? `Sent \u2014 ${formatShortDate(sentAt)}`
              : status === 'Accepted' && acceptedAt
              ? `Accepted \u2014 ${formatShortDate(acceptedAt)}`
              : status === 'Declined' && declinedAt
              ? `Declined \u2014 ${formatShortDate(declinedAt)}`
              : status}
          </span>
          {/* Send proposal (drafts only, requires project context) */}
          {(status === 'Draft' || !status) && project && (
            <button
              onClick={handleOpenSend}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-400 transition-colors"
            >
              <SendIcon className="w-4 h-4" />
              Send
            </button>
          )}
          {/* Mark accepted / declined (sent only, requires project context) */}
          {status === 'Sent' && project && (
            <>
              <button
                onClick={handleMarkAccepted}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckIcon className="w-4 h-4" />
                Mark accepted
              </button>
              <button
                onClick={handleMarkDeclined}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors"
              >
                <XIcon className="w-4 h-4" />
                Mark declined
              </button>
            </>
          )}
          {/* Push to Jobs */}
          {status === 'Accepted' && (
            <button
              onClick={handlePushToJobs}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              Push to Jobs
            </button>
          )}
          {/* Convert to Invoice */}
          {status !== 'Invoiced' && (
            <button
              onClick={() => setShowConvertConfirm(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ReceiptIcon className="w-4 h-4" />
              Convert to Invoice
            </button>
          )}
          {/* Delete */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg hover:border-red-200 transition-colors"
            title="Delete proposal"
          >
            <Trash2Icon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Push success toast */}
      {pushSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
          <CheckIcon className="w-4 h-4" />
          Job created successfully
        </div>
      )}

      {/* Convert success toast */}
      {convertSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
          <CheckIcon className="w-4 h-4" />
          Proposal converted to invoice
        </div>
      )}

      {/* Convert error toast */}
      {convertError && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
          <XIcon className="w-4 h-4" />
          {convertError}
        </div>
      )}

      {/* Convert to Invoice confirmation dialog */}
      {showConvertConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Convert to Invoice</h3>
            <p className="text-sm text-gray-600 mb-6">Convert this proposal to an invoice?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConvertConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
                disabled={converting}
              >
                Cancel
              </button>
              <button
                onClick={handleConvertToInvoice}
                disabled={converting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {converting ? 'Converting...' : 'Convert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Order Modal */}
      {showChangeOrderModal && (
        <ChangeOrderModal
          onSave={handleAddChangeOrder}
          onClose={() => setShowChangeOrderModal(false)}
          saving={savingCO}
        />
      )}

      {/* Proposal form */}
      <div className="flex-1 p-6">
        <div id="proposal-content" className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 md:px-8 pt-8 pb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-bold text-gray-900">{companyName}</h1>
                <p className="text-sm text-gray-500">{companyAddress}</p>
                <p className="text-sm text-gray-500">{companyWebsite}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {settings?.logo_base64 ? (
                  <img
                    src={settings.logo_base64}
                    alt="Company logo"
                    className="max-h-[80px] max-w-[180px] object-contain"
                  />
                ) : (
                  <button
                    onClick={onOpenSettings}
                    className="border-2 border-dashed border-gray-300 rounded-lg px-6 py-4 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
                  >
                    Upload Logo
                  </button>
                )}
                <h2 className="text-3xl font-bold text-amber-500">Proposal</h2>
              </div>
            </div>
          </div>

          {/* Address + Proposal info */}
          <div className="px-4 md:px-8 py-4 flex justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Address</p>
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
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Proposal #</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={proposalNumber}
                  onChange={(e) => setProposalNumber(Number(e.target.value))}
                  className="w-24 text-right text-sm font-semibold text-amber-600 border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="text-sm text-gray-700 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Project info row */}
          <div className="px-4 md:px-8 py-3 bg-gray-50 border-y border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full text-sm text-gray-900 bg-transparent border-0 border-b border-amber-200 focus:border-amber-500 focus:ring-0 p-0 pb-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-sm text-gray-900 bg-transparent border-0 border-b border-amber-200 focus:border-amber-500 focus:ring-0 p-0 pb-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Sales Person</label>
                <input
                  type="text"
                  value={salesperson}
                  onChange={(e) => setSalesperson(e.target.value)}
                  className="w-full text-sm text-gray-900 bg-transparent border-0 border-b border-amber-200 focus:border-amber-500 focus:ring-0 p-0 pb-1"
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
                  <th className="text-left text-xs font-semibold text-amber-700 uppercase tracking-wide py-2">Project / Description</th>
                  <th className="text-right text-xs font-semibold text-amber-700 uppercase tracking-wide py-2 w-20">FT</th>
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
              <PlusIcon className="w-4 h-4" />
              Add Line Item
            </button>
          </div>

          {/* Material Systems */}
          <div className="px-4 md:px-8 py-4 border-t border-gray-200">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Material Systems</h3>
            <MaterialSystemPicker
              rows={materialSystemRows}
              onChange={setMaterialSystemRows}
              systems={allMaterialSystems}
              onAddNew={addMaterialSystem}
              onUpdateSystem={updateMaterialSystem}
            />
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
          <div className="px-4 md:px-8 py-4 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Terms and Conditions</p>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={12}
              className="w-full text-xs text-gray-600 leading-relaxed border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* Signature line */}
          <div className="px-4 md:px-8 py-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-4">If you accept these terms, please sign below.</p>
            <div className="flex gap-8">
              <div className="flex-1">
                <p className="text-sm text-gray-900">Accepted By _________________________</p>
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">Accepted Date _________________________</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Proposal"
          message="Are you sure you want to move this proposal to the trash bin? You can restore it within 30 days."
          onConfirm={handleDeleteProposal}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={isDeleting}
        />
      )}

      {showPreview && (
        <ReportPreviewModal
          pdfData={pdfPreview}
          title="Proposal"
          onClose={() => { setShowPreview(false); setPdfPreview(null) }}
        />
      )}

      {showSendModal && project && (
        <SendProposalModal
          proposal={{
            ...initialProposal,
            estimate_number: proposalNumber,
            project_name: projectName,
            line_items: lineItems.map((item) => ({ ...item, amount: calcAmount(item) })),
            subtotal,
            tax,
            total,
            status,
          }}
          customer={customer}
          project={project}
          userId={userId}
          onClose={() => setShowSendModal(false)}
          onSent={(patch) => {
            if (patch.status) setStatus(patch.status)
            if (patch.sent_at !== undefined) setSentAt(patch.sent_at ?? null)
            setShowSendModal(false)
            onUpdated()
          }}
        />
      )}
    </div>
  )
}
