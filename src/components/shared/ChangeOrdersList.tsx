'use client'

import { useState } from 'react'
import { ChevronDownIcon, CheckIcon, TrashIcon } from 'lucide-react'
import type { ChangeOrder } from '../estimates/types'

interface ChangeOrdersListProps {
  changeOrders: ChangeOrder[]
  originalTotal: number
  onUpdateStatus: (id: string, status: 'Pending' | 'Approved' | 'Rejected') => void
  onDelete: (id: string) => void
}

const CO_STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected'] as const

const CO_STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ChangeOrdersList({
  changeOrders,
  originalTotal,
  onUpdateStatus,
  onDelete,
}: ChangeOrdersListProps) {
  const [openStatusMenu, setOpenStatusMenu] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const approvedTotal = changeOrders
    .filter((co) => co.status === 'Approved')
    .reduce((sum, co) => sum + co.subtotal, 0)

  const revisedTotal = originalTotal + approvedTotal

  if (changeOrders.length === 0) return null

  return (
    <div className="px-8 py-4 border-t border-gray-200">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Change Orders</p>
      <div className="space-y-2 mb-4">
        {changeOrders.map((co) => (
          <div
            key={co.id}
            className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{co.change_order_number}</span>
                <span className="text-sm text-gray-600 truncate">{co.description}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-sm font-medium text-gray-900">
                ${formatCurrency(co.subtotal)}
              </span>
              {/* Status dropdown */}
              <div className="relative">
                <button
                  onClick={() => setOpenStatusMenu(openStatusMenu === co.id ? null : co.id)}
                  className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${CO_STATUS_COLORS[co.status]}`}
                >
                  {co.status}
                  <ChevronDownIcon className="w-3 h-3" />
                </button>
                {openStatusMenu === co.id && (
                  <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                    {CO_STATUS_OPTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          onUpdateStatus(co.id, s)
                          setOpenStatusMenu(null)
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                      >
                        {co.status === s && <CheckIcon className="w-3 h-3 text-amber-500" />}
                        <span className={co.status === s ? 'font-medium' : ''}>{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Delete */}
              {confirmDelete === co.id ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { onDelete(co.id); setConfirmDelete(null) }}
                    className="text-xs text-red-600 font-medium hover:text-red-700"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(co.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Revised total */}
      <div className="flex justify-end">
        <div className="w-72 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Original Total</span>
            <span className="text-gray-900">${formatCurrency(originalTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Approved Change Orders</span>
            <span className={approvedTotal >= 0 ? 'text-green-600' : 'text-red-600'}>
              {approvedTotal >= 0 ? '+' : ''}${formatCurrency(approvedTotal)}
            </span>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
            <span className="text-gray-900">Revised Total</span>
            <span className="text-gray-900">${formatCurrency(revisedTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
