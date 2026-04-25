'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AutoSaveIndicator from '@/components/ui/AutoSaveIndicator'
import type {
  Customer,
  Estimate,
  EstimateSettings,
  LineItem,
} from '@/components/estimates/types'
import type { EstimatingProject } from './types'

interface EstimateEditorClientProps {
  mode: 'new' | 'edit'
  estimate: Estimate
  customer: Customer
  project: EstimatingProject | null
  settings: EstimateSettings | null
  userId: string
  canEdit: boolean
}

function statusBadgeClasses(status: string): string {
  const base =
    'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap'
  if (status === 'Sent') return `${base} bg-amber-100 text-amber-700`
  if (status === 'Accepted') return `${base} bg-green-100 text-green-700`
  if (status === 'Declined') return `${base} bg-red-100 text-red-700`
  if (status === 'Invoiced') return `${base} bg-blue-100 text-blue-700`
  return `${base} bg-gray-100 text-gray-600`
}

// Linear-feet pricing: when FT is empty/0 the row is a flat-fee item and the
// rate IS the amount; otherwise amount = ft * rate. Matches the legacy editor.
function calcAmount(item: LineItem): number {
  if (!item.ft || item.ft === 0) return item.rate ?? 0
  return (item.ft ?? 0) * (item.rate ?? 0)
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default function EstimateEditorClient({
  mode,
  estimate: initialEstimate,
  customer,
  project,
  settings,
  userId,
  canEdit,
}: EstimateEditorClientProps) {
  const router = useRouter()
  const [estimate, setEstimate] = useState<Estimate>(initialEstimate)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  // Skip the very first effect run after server hydration so we don't fire a
  // no-op auto-save the moment the editor mounts.
  const firstAutoSaveRunRef = useRef(true)

  const lineItems = estimate.line_items ?? []
  const subtotal = lineItems.reduce((sum, item) => sum + calcAmount(item), 0)
  const taxAmount = estimate.tax ?? 0
  const total = subtotal + taxAmount

  // True when there is at least one line item with a description AND a
  // non-zero amount. Soft guard before insert in `new` mode.
  const hasValidLineItem = lineItems.some(
    (item) => item.description.trim().length > 0 && calcAmount(item) > 0
  )

  function setLineItems(next: LineItem[]) {
    setEstimate((prev) => ({ ...prev, line_items: next }))
  }

  function addLineItem() {
    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        description: '',
        ft: null,
        rate: null,
        amount: 0,
      },
    ])
  }

  function updateLineItem(id: string, patch: Partial<LineItem>) {
    setLineItems(
      lineItems.map((item) => {
        if (item.id !== id) return item
        const merged = { ...item, ...patch }
        return { ...merged, amount: calcAmount(merged) }
      })
    )
  }

  function removeLineItem(id: string) {
    setLineItems(lineItems.filter((item) => item.id !== id))
  }

  function parseNumberInput(raw: string): number | null {
    if (raw === '') return null
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : null
  }

  async function handleSaveNew() {
    if (mode !== 'new' || !canEdit || isSaving) return
    setSaveError(null)

    if (!hasValidLineItem) {
      setSaveError('Add at least one line item before saving.')
      return
    }

    setIsSaving(true)
    const supabase = createClient()

    // Normalize line items: ensure each row's stored amount matches calcAmount.
    const normalizedItems = lineItems.map((item) => ({
      ...item,
      amount: calcAmount(item),
    }))

    const payload = {
      estimate_number: estimate.estimate_number,
      company_id: customer.id,
      date: estimate.date,
      project_name: estimate.project_name ?? '',
      description: estimate.description ?? '',
      salesperson: estimate.salesperson ?? '',
      line_items: normalizedItems,
      subtotal,
      tax: taxAmount,
      total,
      terms: estimate.terms ?? '',
      notes: estimate.notes ?? '',
      status: 'Draft' as const,
      user_id: userId,
    }

    const { data, error } = await supabase
      .from('estimates')
      .insert(payload)
      .select('id')
      .single()

    if (error || !data) {
      console.error('[EstimateEditorClient] insert failed:', error)
      setSaveError(error?.message || 'Failed to save estimate. Please try again.')
      setIsSaving(false)
      return
    }

    // Increment next_estimate_number ONLY when the saved number was drawn from
    // settings. If the project's project_number already supplied the numeric
    // portion (server page logic), leave settings alone — otherwise we'd
    // double-increment when an estimate is created off a numbered project.
    if (settings) {
      const projectDerivedNumber = (() => {
        if (!project?.project_number) return null
        const m = project.project_number.match(/(\d+)/)
        return m ? parseInt(m[1], 10) : null
      })()
      const fromSettings =
        projectDerivedNumber == null ||
        projectDerivedNumber !== estimate.estimate_number
      if (fromSettings) {
        await supabase
          .from('estimate_settings')
          .update({ next_estimate_number: estimate.estimate_number + 1 })
          .eq('id', settings.id)
      }
    }

    const projectQs = project ? `?project=${project.id}` : ''
    router.replace(`/sales/estimating/estimates/${data.id}${projectQs}`)
  }

  // Debounced auto-save for edit mode. Skips first render after hydration,
  // skips when read-only, debounces ~1000ms (matches LeadProjectDetailsCard).
  // Per-keystroke setEstimate calls are fine — the SAVE call is debounced via
  // refs so we never hit Supabase on every keystroke.
  useEffect(() => {
    if (mode !== 'edit') return
    if (!canEdit) return
    if (firstAutoSaveRunRef.current) {
      firstAutoSaveRunRef.current = false
      return
    }
    if (!estimate.id) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedIndicatorTimerRef.current)
      clearTimeout(savedIndicatorTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving')
      const supabase = createClient()
      const items = (estimate.line_items ?? []).map((item) => ({
        ...item,
        amount: calcAmount(item),
      }))
      const sub = items.reduce((sum, item) => sum + item.amount, 0)
      const tax = estimate.tax ?? 0
      const tot = sub + tax
      const { error } = await supabase
        .from('estimates')
        .update({
          date: estimate.date,
          project_name: estimate.project_name ?? '',
          description: estimate.description ?? '',
          salesperson: estimate.salesperson ?? '',
          line_items: items,
          subtotal: sub,
          tax,
          total: tot,
          terms: estimate.terms ?? '',
          notes: estimate.notes ?? '',
          status: estimate.status,
        })
        .eq('id', estimate.id)
      if (error) {
        console.error('[EstimateEditorClient] auto-save failed:', error)
        setSaveState('error')
      } else {
        setSaveState('saved')
        savedIndicatorTimerRef.current = setTimeout(
          () => setSaveState('idle'),
          1500
        )
      }
    }, 1000)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [mode, canEdit, estimate])

  // Final cleanup on unmount — clear any in-flight saved-indicator timer too.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (savedIndicatorTimerRef.current)
        clearTimeout(savedIndicatorTimerRef.current)
    }
  }, [])

  const backHref = project
    ? `/sales/estimating?project=${project.id}`
    : '/sales/estimating'
  const backLabel = project ? `Back to ${project.name || 'project'}` : 'Back to Estimating'

  const title =
    mode === 'new' && !estimate.estimate_number
      ? 'New Estimate'
      : `Estimate #${estimate.estimate_number}`

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between gap-4">
        <Link
          href={backHref}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {backLabel}
        </Link>

        <div className="flex-1 min-w-0 flex flex-col items-center text-center">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-900 truncate">
              {title}
            </h1>
            <span className={statusBadgeClasses(estimate.status || 'Draft')}>
              {estimate.status || 'Draft'}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate">{customer.name}</p>
        </div>

        {/* Action slot — Send / Export PDF added in follow-up prompts. */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {mode === 'edit' && canEdit && (
            <AutoSaveIndicator isSaving={saveState === 'saving'} />
          )}
          {mode === 'edit' && canEdit && saveState === 'error' && (
            <span className="text-xs text-red-600">Save failed</span>
          )}
          {mode === 'new' && canEdit && (
            <>
              {saveError && (
                <span className="text-xs text-red-600 max-w-[220px] truncate">
                  {saveError}
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveNew}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                ) : (
                  <SaveIcon className="w-4 h-4" />
                )}
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Line items section */}
          <div className="px-4 md:px-8 py-5">
            <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">
              Line Items
            </h2>
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-amber-500">
                  <th className="text-left text-[11px] font-semibold text-amber-700 uppercase tracking-wide py-2 pr-2">
                    Description
                  </th>
                  <th className="text-right text-[11px] font-semibold text-amber-700 uppercase tracking-wide py-2 px-2 w-20">
                    FT
                  </th>
                  <th className="text-right text-[11px] font-semibold text-amber-700 uppercase tracking-wide py-2 px-2 w-24">
                    Rate
                  </th>
                  <th className="text-right text-[11px] font-semibold text-amber-700 uppercase tracking-wide py-2 px-2 w-28">
                    Amount
                  </th>
                  {canEdit && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEdit ? 5 : 4}
                      className="py-6 text-center text-xs text-gray-400"
                    >
                      No line items yet.
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 group">
                      <td className="py-2 pr-2">
                        <textarea
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(item.id, {
                              description: e.target.value,
                            })
                          }
                          disabled={!canEdit}
                          rows={2}
                          placeholder="Description..."
                          className="w-full text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/20 disabled:bg-transparent disabled:text-gray-700 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={item.ft ?? ''}
                          onChange={(e) =>
                            updateLineItem(item.id, {
                              ft: parseNumberInput(e.target.value),
                            })
                          }
                          disabled={!canEdit}
                          placeholder="0"
                          className="w-full text-right text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20 disabled:bg-transparent disabled:text-gray-700 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={item.rate ?? ''}
                          onChange={(e) =>
                            updateLineItem(item.id, {
                              rate: parseNumberInput(e.target.value),
                            })
                          }
                          disabled={!canEdit}
                          placeholder="0.00"
                          className="w-full text-right text-sm text-gray-800 border border-transparent hover:border-gray-200 focus:border-amber-500 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20 disabled:bg-transparent disabled:text-gray-700 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="py-2 px-2 text-right text-sm font-medium text-gray-900 tabular-nums">
                        {formatMoney(calcAmount(item))}
                      </td>
                      {canEdit && (
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => removeLineItem(item.id)}
                            title="Remove line item"
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                          >
                            <Trash2Icon className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {canEdit && (
              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add line item
              </button>
            )}

            {/* Totals */}
            <div className="flex justify-end mt-4 pt-3 border-t border-gray-100">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900 tabular-nums">
                    {formatMoney(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Tax</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={estimate.tax ?? ''}
                      onChange={(e) => {
                        const n = parseNumberInput(e.target.value)
                        setEstimate((prev) => ({ ...prev, tax: n ?? 0 }))
                      }}
                      disabled={!canEdit}
                      placeholder="0.00"
                      className="w-24 text-right text-sm text-gray-900 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20 focus:border-amber-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900 tabular-nums">
                    {formatMoney(total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Salesperson */}
          <div className="px-4 md:px-8 py-4 border-t border-gray-200">
            <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              Salesperson
            </label>
            <input
              type="text"
              value={estimate.salesperson ?? ''}
              onChange={(e) =>
                setEstimate((prev) => ({
                  ...prev,
                  salesperson: e.target.value,
                }))
              }
              disabled={!canEdit}
              placeholder="Salesperson name"
              className="w-full max-w-sm text-sm text-gray-900 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/20 focus:border-amber-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed"
            />
          </div>

          {/* Terms */}
          <div className="px-4 md:px-8 py-4 border-t border-gray-200">
            <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Terms
            </label>
            <textarea
              value={estimate.terms ?? ''}
              onChange={(e) =>
                setEstimate((prev) => ({ ...prev, terms: e.target.value }))
              }
              disabled={!canEdit}
              rows={10}
              placeholder="Terms and conditions"
              className="w-full text-xs text-gray-700 leading-relaxed border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/20 focus:border-amber-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed"
            />
          </div>

          {/* Notes */}
          <div className="px-4 md:px-8 py-4 border-t border-gray-200">
            <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Notes
            </label>
            <textarea
              value={estimate.notes ?? ''}
              onChange={(e) =>
                setEstimate((prev) => ({ ...prev, notes: e.target.value }))
              }
              disabled={!canEdit}
              rows={4}
              placeholder="Internal notes"
              className="w-full text-sm text-gray-700 leading-relaxed border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/20 focus:border-amber-500 disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
