'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  Loader2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  XIcon,
  PanelLeftIcon,
  Maximize2Icon,
  AlertCircleIcon,
} from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`

interface PdfViewerModalProps {
  url: string
  fileName?: string
  onClose: () => void
}

export default function PdfViewerModal({ url, fileName, onClose }: PdfViewerModalProps) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const mainContainerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const thumbnailRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  // Track scale in a ref for touch handlers (avoids stale closures)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 })

  // Detect mobile
  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // On desktop, default sidebar open
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(true)
    } else {
      setSidebarOpen(false)
    }
  }, [isMobile])

  // Measure main viewer width for fit-to-width rendering
  useEffect(() => {
    if (!mainContainerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      if (w > 0) setFitWidth(w)
    })
    ro.observe(mainContainerRef.current)
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

  // Scroll active thumbnail into view in the sidebar
  useEffect(() => {
    const btn = thumbnailRefs.current.get(currentPage)
    if (btn && sidebarOpen) {
      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentPage, sidebarOpen])

  // Prevent body scrolling when modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n)
    setLoading(false)
    setError(null)
  }

  function onDocumentLoadError() {
    setLoading(false)
    setError('Failed to load PDF. The file may be corrupted or unavailable.')
  }

  const goToPage = useCallback((page: number) => {
    setCurrentPage(page)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
      scrollRef.current.scrollLeft = 0
    }
  }, [])

  function resetZoom() {
    setScale(1)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
      scrollRef.current.scrollLeft = 0
    }
  }

  function zoomIn() {
    setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))
  }

  function zoomOut() {
    setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))
  }

  function toggleSidebar() {
    setSidebarOpen((o) => !o)
  }

  const pageWidth = fitWidth > 0 ? fitWidth * scale : undefined

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-900/95">
      {/* Header bar */}
      <div className="flex-none flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 min-h-[48px]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition flex-shrink-0"
            aria-label="Toggle page thumbnails"
            title="Pages"
          >
            <PanelLeftIcon className="w-5 h-5" />
          </button>
          {fileName && (
            <span className="text-sm text-gray-300 truncate hidden sm:block max-w-[200px]">
              {fileName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm text-gray-300 tabular-nums">
          {numPages > 0 && (
            <span>
              Page {currentPage} / {numPages}
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition flex-shrink-0"
          aria-label="Close viewer"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Main area: sidebar + viewer */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Thumbnail sidebar - overlay on mobile, inline on desktop */}
        {sidebarOpen && (
          <>
            {/* Mobile backdrop */}
            {isMobile && (
              <div
                className="absolute inset-0 bg-black/50 z-10"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <div
              className={`
                flex-none bg-gray-800 border-r border-gray-700 overflow-y-auto
                ${isMobile
                  ? 'absolute left-0 top-0 bottom-0 z-20 w-[140px] shadow-2xl animate-pdf-sidebar-slide-in'
                  : 'w-[160px]'
                }
              `}
            >
              <div className="p-2 space-y-2">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    ref={(el) => {
                      if (el) thumbnailRefs.current.set(pageNum, el)
                      else thumbnailRefs.current.delete(pageNum)
                    }}
                    onClick={() => {
                      goToPage(pageNum)
                      if (isMobile) setSidebarOpen(false)
                    }}
                    className={`
                      w-full rounded-lg overflow-hidden transition border-2 cursor-pointer
                      ${currentPage === pageNum
                        ? 'border-amber-500 shadow-lg shadow-amber-500/20'
                        : 'border-transparent hover:border-gray-500'
                      }
                    `}
                  >
                    <div className="bg-white">
                      <Document file={url} loading={null}>
                        <Page
                          pageNumber={pageNum}
                          width={isMobile ? 116 : 136}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          loading={
                            <div className="flex items-center justify-center h-[150px]">
                              <Loader2Icon className="w-4 h-4 text-gray-300 animate-spin" />
                            </div>
                          }
                        />
                      </Document>
                    </div>
                    <div className={`
                      text-xs py-1 text-center
                      ${currentPage === pageNum ? 'text-amber-400 font-medium' : 'text-gray-400'}
                    `}>
                      {pageNum}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Main PDF display area */}
        <div ref={mainContainerRef} className="flex-1 min-w-0 flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-auto bg-gray-800"
            style={{ touchAction: 'manipulation' }}
          >
            {loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2Icon className="w-10 h-10 text-amber-500 animate-spin" />
                <span className="text-sm text-gray-400">Loading PDF...</span>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
                <AlertCircleIcon className="w-10 h-10 text-red-400" />
                <span className="text-sm text-red-300 text-center">{error}</span>
                <button
                  onClick={onClose}
                  className="mt-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm hover:bg-gray-600 transition"
                >
                  Close
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
                  <div className="flex justify-center min-h-full">
                    <Page
                      pageNumber={currentPage}
                      width={pageWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      loading={
                        <div className="flex items-center justify-center py-20">
                          <Loader2Icon className="w-8 h-8 text-amber-500 animate-spin" />
                        </div>
                      }
                    />
                  </div>
                )}
              </Document>
            )}
          </div>
        </div>
      </div>

      {/* Bottom controls bar — zoom + page navigation */}
      {numPages > 0 && (
        <div className="flex-none flex items-center justify-between px-3 py-2 bg-gray-900 border-t border-gray-700 min-h-[48px]">
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={scale <= 0.5}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition"
              aria-label="Zoom out"
            >
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button
              onClick={resetZoom}
              className="px-2 py-1 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700 transition tabular-nums min-w-[48px] text-center"
              title="Fit to width"
            >
              <Maximize2Icon className="w-4 h-4 inline-block mr-1" />
              Fit
            </button>
            <button
              onClick={zoomIn}
              disabled={scale >= 4}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition"
              aria-label="Zoom in"
            >
              <ZoomInIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition"
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-xs text-gray-300 tabular-nums min-w-[50px] text-center">
              {currentPage} / {numPages}
            </span>
            <button
              onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition"
              aria-label="Next page"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
