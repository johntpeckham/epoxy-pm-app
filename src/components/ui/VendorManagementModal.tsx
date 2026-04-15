'use client'

import { Building2Icon, XIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import VendorsManager from '@/components/vendors/VendorsManager'

interface VendorManagementModalProps {
  open: boolean
  userId: string
  onClose: () => void
}

export default function VendorManagementModal({
  open,
  userId,
  onClose,
}: VendorManagementModalProps) {
  if (!open) return null

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:w-[800px] md:max-w-[90vw] h-full md:h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex-none flex items-center justify-between px-6 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <Building2Icon className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Vendor Management</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-hidden p-6">
            <VendorsManager userId={userId} />
          </div>
        </div>
      </div>
    </Portal>
  )
}
