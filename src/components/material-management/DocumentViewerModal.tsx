'use client'

import { useEffect, useState } from 'react'
import { Document, Page } from 'react-pdf'
import '@/lib/pdfWorker'
import { XIcon, DownloadIcon, FileTextIcon, Loader2Icon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

export type DocumentFileType = 'pdf' | 'image' | 'word' | 'unknown'

interface Props {
  isOpen: boolean
  onClose: () => void
  fileUrl: string
  fileName: string
  fileType: DocumentFileType
  onDownload: () => void
}

const PDF_PAGE_WIDTH = 800

export default function DocumentViewerModal({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  fileType,
  onDownload,
}: Props) {
  const [numPages, setNumPages] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [renderError, setRenderError] = useState<string | null>(null)

  // Escape-to-close
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [isOpen, onClose])

  // Reset loader / error state when the file changes so reopening with a
  // different doc doesn't carry the previous state.
  useEffect(() => {
    setNumPages(0)
    setLoading(true)
    setRenderError(null)
  }, [fileUrl])

  if (!isOpen) return null

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 modal-below-header"
        onClick={onClose}
      >
        <div
          className="w-full max-w-6xl h-full max-h-[90vh] bg-white dark:bg-[#242424] rounded-xl shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-[#3a3a3a] flex-shrink-0 gap-3">
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <FileTextIcon className="w-4 h-4 text-gray-400 dark:text-[#6b6b6b] flex-shrink-0" />
              <h2
                className="text-sm font-semibold text-gray-900 dark:text-white truncate"
                title={fileName}
              >
                {fileName}
              </h2>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={onDownload}
                title="Download"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-[#a0a0a0] bg-gray-100 dark:bg-[#2e2e2e] hover:bg-gray-200 dark:hover:bg-[#3a3a3a] rounded-lg transition-colors"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Download
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-md transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto bg-gray-50 dark:bg-[#1a1a1a]">
            {fileType === 'pdf' && (
              <div className="flex flex-col items-center py-4 px-2 gap-4">
                {renderError ? (
                  <div className="py-16 text-center max-w-md">
                    <p className="text-sm text-gray-600 dark:text-[#a0a0a0]">
                      Couldn&apos;t render this PDF in the browser.
                    </p>
                    <p className="text-xs text-gray-400 dark:text-[#6b6b6b] mt-1">
                      Try downloading it to view in another app.
                    </p>
                    <button
                      type="button"
                      onClick={onDownload}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
                    >
                      <DownloadIcon className="w-4 h-4" /> Download
                    </button>
                  </div>
                ) : (
                  <>
                    {loading && (
                      <div className="py-16 flex items-center gap-2 text-sm text-gray-500 dark:text-[#a0a0a0]">
                        <Loader2Icon className="w-4 h-4 animate-spin" />
                        Loading document...
                      </div>
                    )}
                    <Document
                      file={fileUrl}
                      onLoadSuccess={({ numPages: n }) => {
                        setNumPages(n)
                        setLoading(false)
                      }}
                      onLoadError={(err) => {
                        console.error('Failed to render PDF', {
                          name: err?.name,
                          message: err?.message,
                        })
                        setRenderError(err?.message ?? 'Failed to render PDF')
                        setLoading(false)
                      }}
                      loading={null}
                      error={null}
                    >
                      {Array.from({ length: numPages }, (_, i) => (
                        <Page
                          key={i + 1}
                          pageNumber={i + 1}
                          width={PDF_PAGE_WIDTH}
                          className="mb-4 shadow-md mx-auto"
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      ))}
                    </Document>
                  </>
                )}
              </div>
            )}

            {fileType === 'image' && (
              <div className="min-h-full flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl}
                  alt={fileName}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}

            {(fileType === 'word' || fileType === 'unknown') && (
              <div className="min-h-full flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-[#2e2e2e] flex items-center justify-center mb-4">
                  <FileTextIcon className="w-8 h-8 text-gray-400 dark:text-[#6b6b6b]" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  This document type can&apos;t be previewed in the browser.
                </p>
                <p className="text-xs text-gray-500 dark:text-[#a0a0a0] mt-1">
                  Click Download to view it in another app.
                </p>
                <button
                  type="button"
                  onClick={onDownload}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
                >
                  <DownloadIcon className="w-4 h-4" /> Download
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  )
}
