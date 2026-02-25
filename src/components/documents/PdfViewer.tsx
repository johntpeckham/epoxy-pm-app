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
} from 'lucide-react'

interface PdfViewerProps {
  url: string
  /** When true the viewer fills its parent with no max-width constraints and
   *  renders controls with a dark theme suited for fullscreen overlays. */
  fullscreen?: boolean
}

export default function PdfViewer({ url, fullscreen = false }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(0)
  const [loading, setLoading] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Refs for touch gesture state (avoids stale closures in native listeners)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 })

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

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n)
    setLoading(false)
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
    <div ref={containerRef} className="flex flex-col h-full w-full">
      {/* Scrollable PDF viewport — native scroll handles pan when zoomed */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto bg-gray-100"
      >
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2Icon className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        )}
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
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
      </div>

      {/* Controls bar — page navigation + zoom */}
      {numPages > 0 && (
        <div className={`flex-none flex items-center justify-between px-3 py-2 ${fullscreen ? 'bg-gray-900 border-t border-gray-700' : 'bg-white border-t border-gray-200'}`}>
          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className={`p-1.5 rounded-md disabled:opacity-30 transition ${fullscreen ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className={`text-xs tabular-nums min-w-[50px] text-center ${fullscreen ? 'text-gray-300' : 'text-gray-600'}`}>
              {currentPage} / {numPages}
            </span>
            <button
              onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              className={`p-1.5 rounded-md disabled:opacity-30 transition ${fullscreen ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
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
              className={`p-1.5 rounded-md disabled:opacity-30 transition ${fullscreen ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              aria-label="Zoom out"
            >
              <ZoomOutIcon className="w-4 h-4" />
            </button>
            <button
              onClick={resetZoom}
              className={`px-2 py-1 rounded-md text-xs font-medium transition tabular-nums min-w-[44px] text-center ${fullscreen ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Reset to fit width"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))}
              disabled={scale >= 4}
              className={`p-1.5 rounded-md disabled:opacity-30 transition ${fullscreen ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
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
