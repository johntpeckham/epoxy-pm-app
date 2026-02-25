'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Document, Page } from 'react-pdf'
import '@/lib/pdfWorker'
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
  RotateCcwIcon,
} from 'lucide-react'

interface PdfViewerModalProps {
  url: string
  fileName?: string
  onClose: () => void
}

export default function PdfViewerModal({ url, fileName, onClose }: PdfViewerModalProps) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [viewerWidth, setViewerWidth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const viewerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const thumbnailRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  // Refs for pinch-to-zoom (avoids stale closures in native listeners)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 })

  // ── Detect mobile ──
  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Default sidebar open on desktop, closed on mobile
  useEffect(() => {
    setSidebarOpen(!isMobile)
  }, [isMobile])

  // ── Measure viewer container width for fit-to-width ──
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      if (w > 0) setViewerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Pinch-to-zoom via native touch events (non-passive) ──
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function dist(touches: TouchList) {
      return Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY,
      )
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault()
        pinchRef.current = {
          active: true,
          startDist: dist(e.touches),
          startScale: scaleRef.current,
        }
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current.active) {
        e.preventDefault()
        const ratio = dist(e.touches) / pinchRef.current.startDist
        const next = Math.max(0.5, Math.min(4, pinchRef.current.startScale * ratio))
        setScale(+next.toFixed(2))
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

  // ── Keyboard navigation ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPage((p) => Math.max(1, p - 1))
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPage((p) => Math.min(numPages || p, p + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages, onClose])

  // Keep active thumbnail in view
  useEffect(() => {
    const btn = thumbnailRefs.current.get(currentPage)
    if (btn && sidebarOpen) {
      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentPage, sidebarOpen])

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Document callbacks ──
  function handleLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n)
    setLoading(false)
    setError(null)
  }

  function handleLoadError(err: Error) {
    console.error('PDF load error:', err)
    setLoading(false)
    setError(`Failed to load PDF: ${err.message}`)
  }

  // ── Navigation / zoom helpers ──
  const goToPage = useCallback((page: number) => {
    setCurrentPage(page)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
      scrollRef.current.scrollLeft = 0
    }
  }, [])

  function fitToWidth() {
    setScale(1)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
      scrollRef.current.scrollLeft = 0
    }
  }

  function handleRetry() {
    setError(null)
    setLoading(true)
    // Force re-mount of <Document> by toggling error→null
  }

  const pageWidth = viewerWidth > 0 ? viewerWidth * scale : undefined

  // ── Render ──
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-900">
      {/* ─── Top toolbar ─── */}
      <div className="flex-none flex items-center justify-between gap-2 px-2 md:px-4 py-2 bg-gray-900 border-b border-gray-700 min-h-[48px]">
        {/* Left: sidebar toggle + zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition"
            aria-label="Toggle page thumbnails"
            title="Pages"
          >
            <PanelLeftIcon className="w-5 h-5" />
          </button>

          <div className="hidden md:flex items-center gap-0.5 ml-1">
            <button
              onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
              disabled={scale <= 0.5}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition"
              aria-label="Zoom out"
            >
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button
              onClick={fitToWidth}
              className="px-2 py-1 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700 transition tabular-nums"
              title="Fit to width"
            >
              <Maximize2Icon className="w-4 h-4 inline-block mr-1" />
              Fit
            </button>
            <button
              onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))}
              disabled={scale >= 4}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition"
              aria-label="Zoom in"
            >
              <ZoomInIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: page indicator */}
        <div className="text-sm text-gray-300 tabular-nums whitespace-nowrap">
          {numPages > 0 && (
            <>
              {fileName && (
                <span className="hidden lg:inline text-gray-400 mr-3 truncate max-w-[200px]">
                  {fileName}
                </span>
              )}
              Page {currentPage} of {numPages}
            </>
          )}
        </div>

        {/* Right: close */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition"
          aria-label="Close viewer"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Body: sidebar + main viewer ─── */}
      <div className="flex-1 flex min-h-0 relative">

        {/* Thumbnail sidebar */}
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
              className={[
                'flex-none bg-gray-800 border-r border-gray-700 overflow-y-auto',
                isMobile
                  ? 'absolute left-0 top-0 bottom-0 z-20 w-[160px] shadow-2xl animate-pdf-sidebar-slide-in'
                  : 'w-[200px]',
              ].join(' ')}
            >
              <div className="p-2 space-y-2">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pg) => (
                  <button
                    key={pg}
                    ref={(el) => {
                      if (el) thumbnailRefs.current.set(pg, el)
                      else thumbnailRefs.current.delete(pg)
                    }}
                    onClick={() => {
                      goToPage(pg)
                      if (isMobile) setSidebarOpen(false)
                    }}
                    className={[
                      'w-full rounded-lg overflow-hidden transition border-2 cursor-pointer',
                      currentPage === pg
                        ? 'border-amber-500 shadow-lg shadow-amber-500/20'
                        : 'border-transparent hover:border-gray-500',
                    ].join(' ')}
                  >
                    <div className="bg-white">
                      <Document file={url} loading={null} error={null}>
                        <Page
                          pageNumber={pg}
                          width={isMobile ? 136 : 176}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          loading={
                            <div className="flex items-center justify-center h-[180px]">
                              <Loader2Icon className="w-4 h-4 text-gray-300 animate-spin" />
                            </div>
                          }
                        />
                      </Document>
                    </div>
                    <div
                      className={[
                        'text-xs py-1 text-center',
                        currentPage === pg ? 'text-amber-400 font-medium' : 'text-gray-400',
                      ].join(' ')}
                    >
                      {pg}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Main PDF area */}
        <div ref={viewerRef} className="flex-1 min-w-0 flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-auto bg-gray-800"
            style={{ touchAction: 'manipulation' }}
          >
            {/* Loading state */}
            {loading && !error && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2Icon className="w-10 h-10 text-amber-500 animate-spin" />
                <span className="text-sm text-gray-400">Loading PDF…</span>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
                <AlertCircleIcon className="w-10 h-10 text-red-400" />
                <span className="text-sm text-red-300 text-center max-w-md">{error}</span>
                <button
                  onClick={handleRetry}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm hover:bg-gray-600 transition"
                >
                  <RotateCcwIcon className="w-4 h-4" />
                  Retry
                </button>
              </div>
            )}

            {/* PDF Document */}
            {!error && (
              <Document
                file={url}
                onLoadSuccess={handleLoadSuccess}
                onLoadError={handleLoadError}
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

      {/* ─── Bottom bar: mobile zoom + page nav ─── */}
      {numPages > 0 && (
        <div className="flex-none flex items-center justify-between px-2 md:px-4 py-2 bg-gray-900 border-t border-gray-700 min-h-[48px]">
          {/* Zoom (always visible, primary controls on mobile) */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
              disabled={scale <= 0.5}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-30 transition"
              aria-label="Zoom out"
            >
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button
              onClick={fitToWidth}
              className="px-2 py-1 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-700 transition tabular-nums min-w-[48px] text-center"
              title="Fit to width"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))}
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
