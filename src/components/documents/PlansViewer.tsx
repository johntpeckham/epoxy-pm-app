'use client'

import { useState, useRef, useEffect } from 'react'
import { Document, Page } from 'react-pdf'
import '@/lib/pdfWorker'
import {
  Loader2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  XIcon,
} from 'lucide-react'

interface PlansViewerProps {
  url: string
  fileName?: string
  onClose: () => void
}

export default function PlansViewer({ url, fileName, onClose }: PlansViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Refs for touch gesture state (avoids stale closures in native listeners)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 })

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Measure container width for fit-to-width rendering
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      if (w > 0) setFitWidth(w)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Native touch listeners (non-passive) for pinch-to-zoom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function getTouchDist(touches: TouchList) {
      return Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY
      )
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault()
        pinchRef.current = {
          active: true,
          startDist: getTouchDist(e.touches),
          startScale: scaleRef.current,
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current.active) {
        e.preventDefault()
        const dist = getTouchDist(e.touches)
        const ratio = dist / pinchRef.current.startDist
        const newScale = Math.max(0.5, Math.min(4, pinchRef.current.startScale * ratio))
        setScale(+newScale.toFixed(2))
      }
    }

    function onTouchEnd() {
      pinchRef.current.active = false
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // Keyboard navigation: arrows for pages, Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        setCurrentPage((p) => Math.max(1, p - 1))
      } else if (e.key === 'ArrowRight') {
        setCurrentPage((p) => Math.min(numPages || p, p + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages, onClose])

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n)
    setLoading(false)
  }

  function onDocumentLoadError(err: Error) {
    console.error('PlansViewer PDF load error:', err)
    setLoading(false)
    setError(true)
  }

  function goToPage(page: number) {
    setCurrentPage(page)
    setScale(1)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
      scrollRef.current.scrollLeft = 0
    }
  }

  function resetZoom() {
    setScale(1)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
      scrollRef.current.scrollLeft = 0
    }
  }

  const pageWidth = fitWidth > 0 ? fitWidth * scale : undefined

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-900">
      {/* Top bar */}
      <div className="flex-none flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 min-h-[48px]">
        <div className="min-w-0 flex-1 mr-3">
          {fileName && (
            <p className="text-sm text-gray-300 truncate">{fileName}</p>
          )}
        </div>

        {numPages > 0 && (
          <span className="text-sm text-gray-400 tabular-nums whitespace-nowrap mr-3">
            Page {currentPage} of {numPages}
          </span>
        )}

        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition flex-shrink-0"
          aria-label="Close"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* PDF viewport — identical rendering approach to the working PdfViewer */}
      <div ref={containerRef} className="flex-1 min-h-0 flex flex-col">
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-auto bg-gray-100"
          style={{ touchAction: 'manipulation' }}
        >
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2Icon className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <p className="text-sm text-gray-500 mb-4">Failed to load PDF.</p>
              <button
                onClick={() => { setError(false); setLoading(true) }}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition"
              >
                Retry
              </button>
            </div>
          )}

          {!error && (
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
            >
              {pageWidth !== undefined && (
                <Page
                  pageNumber={currentPage}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              )}
            </Document>
          )}
        </div>
      </div>

      {/* Bottom controls — page navigation + zoom */}
      {numPages > 0 && (
        <div className="flex-none flex items-center justify-between px-3 py-2 bg-white border-t border-gray-200">
          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-xs text-gray-600 tabular-nums min-w-[50px] text-center">
              {currentPage} / {numPages}
            </span>
            <button
              onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
              aria-label="Next page"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
              disabled={scale <= 0.5}
              className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
              aria-label="Zoom out"
            >
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button
              onClick={resetZoom}
              className="px-2 py-1 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 transition tabular-nums min-w-[44px] text-center"
              title="Fit to width"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))}
              disabled={scale >= 4}
              className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
              aria-label="Zoom in"
            >
              <ZoomInIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
