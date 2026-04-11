'use client'

import { useEffect, useRef, useState } from 'react'
import {
  XIcon,
  DownloadIcon,
  PrinterIcon,
  Loader2Icon,
} from 'lucide-react'

interface Props {
  /**
   * Generates the schedule PDF. Called once when the modal mounts. The
   * resulting blob is used both for the in-modal preview (via an iframe)
   * and for the Download / Print actions, so the user sees exactly what
   * will be saved or printed.
   */
  generatePdf: () => Promise<{ blob: Blob; filename: string }>
  onClose: () => void
}

export default function SchedulePreviewModal({ generatePdf, onClose }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [filename, setFilename] = useState<string>('schedule.pdf')
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Build the PDF once when the modal mounts. Revoke the object URL on
  // unmount so the blob can be garbage-collected.
  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    async function run() {
      try {
        const { blob, filename: fname } = await generatePdf()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        createdUrl = url
        setPdfBlob(blob)
        setFilename(fname)
        setPdfUrl(url)
      } catch (err) {
        console.error('Failed to generate schedule PDF:', err)
        if (!cancelled) setError('Failed to generate schedule preview.')
      }
    }
    void run()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
    // generatePdf intentionally excluded — we only want to build the PDF
    // once per modal mount, even if the parent passes a new callback on
    // re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleDownload() {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handlePrint() {
    if (!pdfUrl) return
    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
        return
      } catch {
        // Some browsers block cross-origin-ish iframe printing; fall back
        // to opening the blob in a new tab so the user can print from
        // there.
      }
    }
    window.open(pdfUrl, '_blank', 'noopener,noreferrer')
  }

  const ready = Boolean(pdfUrl && pdfBlob)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-[#1e1e1e] border border-[#3a3a3a] rounded-xl shadow-2xl flex flex-col w-full max-w-6xl"
        style={{ maxHeight: '95vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none flex items-center justify-between gap-3 px-5 py-3 border-b border-[#3a3a3a]">
          <h2 className="text-base font-semibold text-[#e5e5e5]">
            Schedule Preview
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!ready}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[#4a4a4a] bg-[#2a2a2a] text-[#c0c0c0] hover:bg-[#3a3a3a] hover:border-[#5a5a5a] transition disabled:opacity-50"
            >
              <PrinterIcon className="w-4 h-4" />
              Print
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!ready}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white shadow-sm transition disabled:opacity-50"
            >
              <DownloadIcon className="w-4 h-4" />
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-[#9a9a9a] hover:text-[#e5e5e5] hover:bg-[#2a2a2a] transition"
              aria-label="Close preview"
              title="Close"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PDF viewer */}
        <div
          className="flex-1 min-h-0 bg-[#0f0f0f] p-4"
          style={{ minHeight: '80vh' }}
        >
          {error ? (
            <div
              className="flex items-center justify-center h-full text-sm text-red-400"
              style={{ minHeight: '80vh' }}
            >
              {error}
            </div>
          ) : pdfUrl ? (
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              title="Schedule PDF Preview"
              className="w-full bg-white rounded"
              style={{ height: '80vh', border: 'none' }}
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 text-[#9a9a9a] text-sm"
              style={{ minHeight: '80vh' }}
            >
              <Loader2Icon className="w-6 h-6 animate-spin" />
              Generating preview…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
