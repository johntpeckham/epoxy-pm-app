'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PlusIcon, RulerIcon, SquareIcon, HashIcon, FileTextIcon, PencilLineIcon } from 'lucide-react'
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

// ─── Thumbnail card ───

function PageThumbnail({ page, onClick }: { page: TakeoffPage; onClick: () => void }) {
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
      style={{ width: 180 }}
    >
      <div className="w-full h-[220px] bg-gray-100 flex items-center justify-center overflow-hidden relative">
        {loading && <div className="absolute inset-0 bg-gray-100 animate-pulse" />}
        <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
      </div>
      <div className="w-full px-2 py-1.5 text-[11px] text-gray-500 font-medium text-center truncate border-t border-gray-100 group-hover:text-amber-600">
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

  const totalLinear = items
    .filter((i) => i.type === 'linear')
    .reduce((sum, i) => sum + i.measurements.reduce((s, m) => s + m.valueInFeet, 0), 0)

  const totalArea = items
    .filter((i) => i.type === 'area')
    .reduce((sum, i) => sum + i.measurements.reduce((s, m) => s + m.valueInFeet, 0), 0)

  const totalMeasurements = items.reduce((sum, i) => sum + i.measurements.length, 0)

  function fmtFtIn(ft: number): string {
    const f = Math.floor(ft)
    const i = Math.round((ft - f) * 12)
    if (i === 12) return `${f + 1}'-0"`
    return `${f}'-${i}"`
  }

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
    const pdfIndex = pages.length > 0 ? Math.max(...pages.map((p) => p.pdfIndex)) + 1 : 0

    const newPages: TakeoffPage[] = []
    for (let i = 0; i < doc.numPages; i++) {
      const pdfPage = await doc.getPage(i + 1)
      const viewport = pdfPage.getViewport({ scale: 0.3 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
      const thumbnailDataUrl = canvas.toDataURL('image/png')

      newPages.push({ pdfIndex, pageIndex: i, pdfName: file.name, thumbnailDataUrl, arrayBuffer })
    }

    onAddPages(newPages)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [pages, onAddPages])

  const cards = [
    { label: 'Linear', value: totalLinear > 0 ? fmtFtIn(totalLinear) : "0'-0\"", icon: <RulerIcon className="w-4 h-4 text-amber-400" /> },
    { label: 'Area', value: totalArea > 0 ? `${totalArea.toFixed(1)} sf` : '0.0 sf', icon: <SquareIcon className="w-4 h-4 text-amber-400" /> },
    { label: 'Items', value: String(items.length), icon: <HashIcon className="w-4 h-4 text-amber-400" /> },
    { label: 'Pages', value: String(pages.length), icon: <FileTextIcon className="w-4 h-4 text-amber-400" /> },
    { label: 'Measurements', value: String(totalMeasurements), icon: <PencilLineIcon className="w-4 h-4 text-amber-400" /> },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
      {/* Thumbnail grid */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">PDF Pages</h2>
        <span className="text-[11px] text-gray-400">{pages.length} page{pages.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        {pages.map((page) => (
          <PageThumbnail key={`${page.pdfIndex}-${page.pageIndex}`} page={page} onClick={() => onOpenPage(page)} />
        ))}

        {/* Add PDF card */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center bg-white rounded-lg border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50/50 transition-all cursor-pointer"
          style={{ width: 180, height: 252 }}
        >
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
            <PlusIcon className="w-5 h-5 text-gray-400" />
          </div>
          <span className="text-xs font-medium text-gray-400">Add PDF</span>
          <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-gray-900 rounded-lg px-3 py-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              {c.icon}
              <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{c.label}</span>
            </div>
            <span className="text-xl font-bold text-white leading-tight">{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
