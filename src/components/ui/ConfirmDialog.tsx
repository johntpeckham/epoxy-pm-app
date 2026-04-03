'use client'

import { AlertTriangleIcon, InfoIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
  variant?: 'destructive' | 'default'
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  variant = 'destructive',
}: ConfirmDialogProps) {
  const isDestructive = variant === 'destructive'
  const resolvedLabel = confirmLabel ?? (isDestructive ? 'Delete' : 'Confirm')
  const loadingLabel = isDestructive ? 'Deleting…' : 'Updating…'

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onCancel}>
      <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isDestructive ? 'bg-red-100' : 'bg-amber-100'
            }`}>
              {isDestructive
                ? <AlertTriangleIcon className="w-5 h-5 text-red-600" />
                : <InfoIcon className="w-5 h-5 text-amber-600" />
              }
            </div>
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex-none flex gap-3 justify-end p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50 ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-500 hover:bg-amber-400'
            }`}
          >
            {loading ? loadingLabel : resolvedLabel}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
