'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, PlusIcon, Trash2Icon } from 'lucide-react'
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
  // settings and userId reserved for follow-up prompts (save logic, send modal)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  settings: _settings,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId: _userId,
  canEdit,
}: EstimateEditorClientProps) {
  const [estimate, setEstimate] = useState<Estimate>(initialEstimate)

  const lineItems = estimate.line_items ?? []
  const subtotal = lineItems.reduce((sum, item) => sum + calcAmount(item), 0)

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

        {/* Action slot — Save / Send / Export PDF buttons added in follow-up prompts. */}
        <div className="flex items-center gap-2 flex-shrink-0" />
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

            <div className="flex justify-end mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {formatMoney(subtotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
