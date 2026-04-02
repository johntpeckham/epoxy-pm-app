'use client'

import { useEffect, useState, useCallback } from 'react'
import { XIcon, DownloadIcon, LoaderIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

export interface PdfPreviewData {
  blob: Blob
  filename: string
  title?: string
}

interface ReportPreviewModalProps {
  /** PDF data to preview, or null while generating */
  pdfData: PdfPreviewData | null
  /** Whether the PDF is still generating */
  loading?: boolean
  /** Error message if generation failed */
  error?: string | null
  /** Report title shown in header */
  title?: string
  onClose: () => void
}

export default function ReportPreviewModal({
  pdfData,
  loading = false,
  error = null,
  title = 'Report Preview',
  onClose,
}: ReportPreviewModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [isMobileSafari, setIsMobileSafari] = useState(false)

  useEffect(() => {
    // Detect iOS Safari which can't render PDFs in iframes
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua)
    setIsMobileSafari(isIOS && isSafari)
  }, [])

  useEffect(() => {
    if (pdfData?.blob) {
      const url = URL.createObjectURL(pdfData.blob)
      setObjectUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setObjectUrl(null)
  }, [pdfData])

  const handleDownload = useCallback(() => {
    if (!pdfData) return
    const url = URL.createObjectURL(pdfData.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = pdfData.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [pdfData])

  const handleOpenInNewTab = useCallback(() => {
    if (!objectUrl) return
    window.open(objectUrl, '_blank')
  }, [objectUrl])

  const displayTitle = pdfData?.title || title

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-black/60 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:mt-8 md:mx-auto w-full md:max-w-5xl h-full md:h-[calc(100vh-4rem)] bg-white md:rounded-t-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h2 className="text-lg font-semibold text-gray-900 truncate mr-4">
              {displayTitle}
            </h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              {pdfData && !loading && !error && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Download
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 bg-gray-100 flex items-center justify-center">
            {loading && (
              <div className="flex flex-col items-center gap-3">
                <LoaderIcon className="w-8 h-8 text-amber-500 animate-spin" />
                <p className="text-sm text-gray-500 font-medium">Generating report...</p>
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center gap-3 p-6 max-w-md text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <XIcon className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm font-medium text-gray-900">Failed to generate report</p>
                <p className="text-xs text-gray-500">{error}</p>
                <button
                  onClick={onClose}
                  className="mt-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
                >
                  Close
                </button>
              </div>
            )}

            {objectUrl && !loading && !error && (
              isMobileSafari ? (
                <div className="flex flex-col items-center gap-4 p-6 text-center">
                  <p className="text-sm text-gray-600">
                    PDF preview is not supported in this browser.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleOpenInNewTab}
                      className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition"
                    >
                      Open in New Tab
                    </button>
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </div>
              ) : (
                <iframe
                  src={objectUrl}
                  className="w-full h-full border-0"
                  title={displayTitle}
                />
              )
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}
