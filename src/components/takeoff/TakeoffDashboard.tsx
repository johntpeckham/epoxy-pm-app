'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PaperclipIcon, RulerIcon, SquareIcon, HashIcon, FileTextIcon, PencilLineIcon } from 'lucide-react'
import type { TakeoffPage, TakeoffItem } from './types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

interface TakeoffDashboardProps {
  pages: TakeoffPage[]
  items: TakeoffItem[]
  pageScales: Record<string, number>
  onAddPages: (pages: TakeoffPage[]) => void
  onOpenPage: (page: TakeoffPage) => void
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ─── Thumbnail card ───

function PageThumbnail({
  page,
  onClick,
}: {
  page: TakeoffPage
  onClick: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (page.thumbnailDataUrl && canvasRef.current) {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        setLoading(false)
      }
      img.src = page.thumbnailDataUrl
      return
    }

    let cancelled = false
    async function render() {
      try {
        const doc = await pdfjsLib.getDocument({ data: page.arrayBuffer.slice(0) }).promise
        const pdfPage = await doc.getPage(page.pageIndex + 1)
        const viewport = pdfPage.getViewport({ scale: 0.3 })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
        if (!cancelled) setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    render()
    return () => { cancelled = true }
  }, [page])

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-amber-400 hover:shadow-md transition-all cursor-pointer"
      style={{ width: 200 }}
    >
      <div className="w-full h-[240px] bg-gray-100 flex items-center justify-center overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-gray-100 animate-pulse" />
        )}
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
        />
      </div>
      <div className="w-full px-3 py-2 text-xs text-gray-600 font-medium text-center truncate border-t border-gray-100 group-hover:text-amber-600">
        Page {page.pageIndex + 1}
      </div>
    </button>
  )
}

// ─── Dashboard ───

export default function TakeoffDashboard({
  pages,
  items,
  pageScales,
  onAddPages,
  onOpenPage,
}: TakeoffDashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Summary computations ───

  const totalLinear = items
    .filter((i) => i.type === 'linear')
    .reduce((sum, i) => sum + i.measurements.reduce((s, m) => s + m.valueInFeet, 0), 0)

  const totalArea = items
    .filter((i) => i.type === 'area')
    .reduce((sum, i) => sum + i.measurements.reduce((s, m) => s + m.valueInFeet, 0), 0)

  const totalItems = items.length

  const totalPdfPages = pages.length

  const totalMeasurements = items.reduce((sum, i) => sum + i.measurements.length, 0)

  function formatFeetInches(totalFeet: number): string {
    const feet = Math.floor(totalFeet)
    const inches = Math.round((totalFeet - feet) * 12)
    if (inches === 12) return `${feet + 1}'-0"`
    return `${feet}'-${inches}"`
  }

  // ─── PDF upload handler ───

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })

    const doc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
    const pdfIndex = pages.length > 0
      ? Math.max(...pages.map((p) => p.pdfIndex)) + 1
      : 0

    const newPages: TakeoffPage[] = []
    for (let i = 0; i < doc.numPages; i++) {
      // Render thumbnail
      const pdfPage = await doc.getPage(i + 1)
      const viewport = pdfPage.getViewport({ scale: 0.3 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
      const thumbnailDataUrl = canvas.toDataURL('image/png')

      newPages.push({
        pdfIndex,
        pageIndex: i,
        pdfName: file.name,
        thumbnailDataUrl,
        arrayBuffer,
      })
    }

    onAddPages(newPages)

    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [pages, onAddPages])

  // ─── Summary cards ───

  const summaryCards = [
    {
      label: 'Linear Total',
      value: totalLinear > 0 ? formatFeetInches(totalLinear) : '0\'-0"',
      icon: <RulerIcon className="w-5 h-5 text-amber-400" />,
    },
    {
      label: 'Area Total',
      value: totalArea > 0 ? `${totalArea.toFixed(1)} sq ft` : '0.0 sq ft',
      icon: <SquareIcon className="w-5 h-5 text-amber-400" />,
    },
    {
      label: 'Items',
      value: String(totalItems),
      icon: <HashIcon className="w-5 h-5 text-amber-400" />,
    },
    {
      label: 'PDF Pages',
      value: String(totalPdfPages),
      icon: <FileTextIcon className="w-5 h-5 text-amber-400" />,
    },
    {
      label: 'Measurements',
      value: String(totalMeasurements),
      icon: <PencilLineIcon className="w-5 h-5 text-amber-400" />,
    },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="bg-gray-900 rounded-xl p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              {card.icon}
              <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">
                {card.label}
              </span>
            </div>
            <span className="text-2xl font-bold text-white leading-tight">
              {card.value}
            </span>
          </div>
        ))}
      </div>

      {/* PDF Pages heading */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">PDF Pages</h2>
        <span className="text-xs text-gray-400">
          {pages.length} page{pages.length !== 1 ? 's' : ''} uploaded
        </span>
      </div>

      {/* Thumbnail grid */}
      <div className="flex flex-wrap gap-4">
        {pages.map((page, idx) => (
          <PageThumbnail
            key={`${page.pdfIndex}-${page.pageIndex}`}
            page={page}
            onClick={() => onOpenPage(page)}
          />
        ))}

        {/* Add PDF card */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center bg-white rounded-lg border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50 transition-all cursor-pointer"
          style={{ width: 200, height: 280 }}
        >
          <PaperclipIcon className="w-8 h-8 text-gray-400 mb-2" />
          <span className="text-sm font-medium text-gray-500">Add PDF</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
        </button>
      </div>
    </div>
  )
}
