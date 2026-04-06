'use client'

import { useRef, useCallback } from 'react'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { XIcon, PrinterIcon, DownloadIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

const CATEGORY_LABEL: Record<string, string> = {
  vehicle: 'Vehicle',
  heavy_equipment: 'Heavy Equipment',
  trailer: 'Trailer',
  tool: 'Tool',
}

interface Props {
  equipment: {
    id: string
    name: string
    category: string
    year: string | null
    make: string | null
    model: string | null
  }
  onClose: () => void
}

export default function QrPreviewModal({ equipment, onClose }: Props) {
  const equipmentUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/equipment/${equipment.id}`
  const canvasRef = useRef<HTMLDivElement>(null)

  const yearMakeModel = [equipment.year, equipment.make, equipment.model]
    .filter(Boolean)
    .join(' / ')

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current?.querySelector('canvas')
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    const slug = equipment.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    link.download = `${slug}-qr.png`
    link.href = dataUrl
    link.click()
  }, [equipment.name])

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-lg font-bold text-gray-900">
              QR Code — {equipment.name}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-6">
            {/* Printable sticker area */}
            <div id="qr-sticker-printable" className="text-center space-y-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{equipment.name}</h3>
                {(equipment.category || yearMakeModel) && (
                  <p className="text-sm text-gray-500 mt-1">
                    {[CATEGORY_LABEL[equipment.category] ?? equipment.category, yearMakeModel]
                      .filter(Boolean)
                      .join(' — ')}
                  </p>
                )}
              </div>

              <div className="flex justify-center">
                <QRCodeSVG value={equipmentUrl} size={200} level="M" />
              </div>

              <p className="text-xs text-gray-400">Scan to view equipment record</p>

              <p className="text-sm font-semibold text-gray-700">Peckham Coatings</p>
            </div>

            {/* Hidden canvas for PNG download */}
            <div ref={canvasRef} className="hidden">
              <QRCodeCanvas value={equipmentUrl} size={400} level="M" />
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 flex-shrink-0"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <DownloadIcon className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
            >
              <PrinterIcon className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>
      </div>

      {/* Print-only styles: only print the sticker content */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #qr-sticker-printable,
          #qr-sticker-printable * {
            visibility: visible !important;
          }
          #qr-sticker-printable {
            position: absolute !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
          }
        }
      `}</style>
    </Portal>
  )
}
