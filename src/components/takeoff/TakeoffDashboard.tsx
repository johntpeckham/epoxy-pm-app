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
  projectName: string
  pages: TakeoffPage[]
  items: TakeoffItem[]
  pageScales: Record<string, number>
  onAddPages: (pages: TakeoffPage[]) => void
  onOpenPage: (page: TakeoffPage) => void
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

    if (!page.arrayBuffer) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function render() {
      try {
        const doc = await pdfjsLib.getDocument({ data: page.arrayBuffer!.slice(0) }).promise
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

// ─── Base64 helper ───

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ─── Formatting helpers ───

function fmtFtIn(ft: number): string {
  const f = Math.floor(ft)
  const i = Math.round((ft - f) * 12)
  if (i === 12) return `${f + 1}'-0"`
  return `${f}'-${i}"`
}

function fmtArea(sf: number): string {
  return sf >= 1000 ? `${sf.toLocaleString('en-US', { maximumFractionDigits: 0 })} sq ft` : `${sf.toFixed(1)} sq ft`
}

// ─── Dashboard ───

export default function TakeoffDashboard({
  projectName,
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

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })

    const pdfBase64 = arrayBufferToBase64(arrayBuffer)

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

      newPages.push({ pdfIndex, pageIndex: i, pdfName: file.name, thumbnailDataUrl, arrayBuffer, pdfBase64 })
    }

    onAddPages(newPages)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [pages, onAddPages])

  const cards = [
    { label: 'Items', value: String(items.length), icon: <HashIcon className="w-4 h-4 text-amber-500" /> },
    { label: 'Measurements', value: String(totalMeasurements), icon: <PencilLineIcon className="w-4 h-4 text-amber-500" /> },
    { label: 'Pages', value: String(pages.length), icon: <FileTextIcon className="w-4 h-4 text-amber-500" /> },
    { label: 'Linear Total', value: totalLinear > 0 ? fmtFtIn(totalLinear) : "0'-0\"", icon: <RulerIcon className="w-4 h-4 text-amber-500" /> },
    { label: 'Area Total', value: totalArea > 0 ? fmtArea(totalArea) : '0 sq ft', icon: <SquareIcon className="w-4 h-4 text-amber-500" /> },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
      {/* Section 0 — Page header */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900 leading-tight">Project Takeoffs</h1>
        <p className="text-sm text-gray-500 mt-0.5">{projectName}</p>
      </div>

      {/* Section 1 — Measurement Items Summary */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-5">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Measurements</h2>
          <span className="text-[11px] font-medium text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4">
            <RulerIcon className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400 text-center">No measurements yet — open a page to start measuring</p>
          </div>
        ) : (
          <div>
            {/* Item rows */}
            {items.map((item, idx) => {
              const itemTotal = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)
              const isLast = idx === items.length - 1
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-2.5 ${!isLast ? 'border-b border-gray-50' : ''}`}
                >
                  {/* Color dot */}
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  {/* Name */}
                  <span className="text-sm font-semibold text-gray-900 flex-1 truncate">{item.name}</span>
                  {/* Type badge */}
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                    item.type === 'linear'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {item.type === 'linear' ? 'Linear' : 'Area'}
                  </span>
                  {/* Measurement count */}
                  <span className="text-xs text-gray-400 flex-shrink-0 w-28 text-right">
                    {item.measurements.length} measurement{item.measurements.length !== 1 ? 's' : ''}
                  </span>
                  {/* Total value */}
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0 w-28 text-right">
                    {item.type === 'linear' ? fmtFtIn(itemTotal) : fmtArea(itemTotal)}
                  </span>
                </div>
              )
            })}

            {/* Grand totals */}
            <div className="border-t border-gray-200 bg-gray-50/50">
              {totalLinear > 0 && (
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-2">
                    <RulerIcon className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Linear</span>
                  </div>
                  <span className="text-sm font-bold text-amber-600">{fmtFtIn(totalLinear)}</span>
                </div>
              )}
              {totalArea > 0 && (
                <div className={`flex items-center justify-between px-4 py-2 ${totalLinear > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className="flex items-center gap-2">
                    <SquareIcon className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Area</span>
                  </div>
                  <span className="text-sm font-bold text-amber-600">{fmtArea(totalArea)}</span>
                </div>
              )}
              {totalLinear === 0 && totalArea === 0 && (
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs text-gray-400">No completed measurements</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Section 2 — Stat widget row */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              {c.icon}
              <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{c.label}</span>
            </div>
            <span className="text-xl font-bold text-gray-900 leading-tight">{c.value}</span>
          </div>
        ))}
      </div>

      {/* Section 3 — PDF Pages grid */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan Pages</h2>
          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {pages.length}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {pages.map((page) => (
          <PageThumbnail
            key={`${page.pdfIndex}-${page.pageIndex}`}
            page={page}
            onClick={() => onOpenPage(page)}
          />
        ))}

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
    </div>
  )
}
