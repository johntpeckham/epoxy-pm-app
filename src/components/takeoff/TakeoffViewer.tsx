'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import TakeoffToolbar from './TakeoffToolbar'
import TakeoffSidebar from './TakeoffSidebar'
import type {
  ToolMode,
  Point,
  Measurement,
  TakeoffItem,
  MeasurementType,
  Markup,
  TakeoffPage,
} from './types'
import { ArrowLeftIcon } from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const ITEM_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
]

let nextColorIdx = 0
function getNextColor(): string {
  const c = ITEM_COLORS[nextColorIdx % ITEM_COLORS.length]
  nextColorIdx++
  return c
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

function fmtFtIn(ft: number): string {
  const f = Math.floor(ft)
  const i = Math.round((ft - f) * 12)
  if (i === 12) return `${f + 1}'-0"`
  return `${f}'-${i}"`
}

function polyArea(pts: Point[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a) / 2
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function center(pts: Point[]): Point {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  }
}

interface TakeoffViewerProps {
  page: TakeoffPage
  pageScale: number | undefined
  items: TakeoffItem[]
  markups: Markup[]
  isFullscreen: boolean
  onBack: () => void
  onPageScaleChange: (pixelsPerFoot: number) => void
  onItemsChange: (items: TakeoffItem[]) => void
  onMarkupsChange: (markups: Markup[]) => void
  onToggleFullscreen: () => void
}

export default function TakeoffViewer({
  page,
  pageScale,
  items,
  markups,
  isFullscreen,
  onBack,
  onPageScaleChange,
  onItemsChange,
  onMarkupsChange,
  onToggleFullscreen,
}: TakeoffViewerProps) {
  const pageKey = `${page.pdfIndex}-${page.pageIndex}`
  const scaleCalibrated = pageScale !== undefined

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<PDFPageProxy | null>(null)

  // Base scale = fit-to-window. zoom=1 means "fit". zoom=2 means 2x fit size.
  const [baseScale, setBaseScale] = useState(1)
  const [zoom, setZoom] = useState(1)

  const [activeTool, setActiveTool] = useState<ToolMode>('pan')
  const [scalePoints, setScalePoints] = useState<Point[]>([])
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [scaleInput, setScaleInput] = useState('')
  const [scaleUnit, setScaleUnit] = useState<'feet' | 'inches'>('feet')

  const [activeItemId, setActiveItemId] = useState<string | null>(null)

  const [tempPoints, setTempPoints] = useState<Point[]>([])
  const [mousePos, setMousePos] = useState<Point | null>(null)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [markupTextInput, setMarkupTextInput] = useState<{ pos: Point; visible: boolean }>({ pos: { x: 0, y: 0 }, visible: false })
  const [markupTextValue, setMarkupTextValue] = useState('')

  const [warning, setWarning] = useState<string | null>(null)

  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState<Point | null>(null)
  const [panStartOffset, setPanStartOffset] = useState<Point>({ x: 0, y: 0 })

  // ─── Compute fit-to-window base scale then render ───

  const renderPage = useCallback(async () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !page.arrayBuffer) return

    try {
      const doc = await pdfjsLib.getDocument({ data: page.arrayBuffer.slice(0) }).promise
      const pdfPage = await doc.getPage(page.pageIndex + 1)
      pageRef.current = pdfPage

      // Get raw page size at scale=1
      const rawVp = pdfPage.getViewport({ scale: 1 })
      const cw = container.clientWidth
      const ch = container.clientHeight

      // Fit-to-window scale (95% of container)
      const fitScale = Math.min(cw / rawVp.width, ch / rawVp.height) * 0.95
      setBaseScale(fitScale)

      const renderScale = fitScale * zoom
      const viewport = pdfPage.getViewport({ scale: renderScale })
      canvas.width = viewport.width
      canvas.height = viewport.height

      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise

      if (overlayCanvasRef.current) {
        overlayCanvasRef.current.width = viewport.width
        overlayCanvasRef.current.height = viewport.height
      }
    } catch {
      // PDF render failed
    }
  }, [page.arrayBuffer, page.pageIndex, zoom])

  useEffect(() => {
    renderPage()
  }, [renderPage])

  // Reset pan when zoom changes back to fit
  useEffect(() => {
    if (zoom <= 1) {
      setPanOffset({ x: 0, y: 0 })
    }
  }, [zoom])

  // ─── Redraw overlay ───

  const redrawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const item of items) {
      const isActive = item.id === activeItemId
      const color = isActive ? item.color : '#6b7280'
      const alpha = isActive ? 1 : 0.5

      for (const m of item.measurements) {
        if (m.pageKey !== pageKey) continue
        ctx.globalAlpha = alpha

        if (m.type === 'linear' && m.points.length === 2) {
          drawLine(ctx, m.points[0], m.points[1], color, m.label)
        } else if (m.type === 'area' && m.points.length >= 3) {
          drawPolygon(ctx, m.points, color, m.label)
        } else if (m.type === 'area' && m.points.length === 2) {
          const [a, b] = m.points
          drawPolygon(ctx, [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], color, m.label)
        }
      }
    }
    ctx.globalAlpha = 1

    for (const mk of markups) {
      if (mk.pageKey !== pageKey) continue
      if (mk.type === 'rect' && mk.points.length === 2) {
        const [a, b] = mk.points
        ctx.strokeStyle = mk.color
        ctx.lineWidth = 2
        ctx.setLineDash([6, 3])
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
        ctx.setLineDash([])
      } else if (mk.type === 'arrow' && mk.points.length === 2) {
        drawArrow(ctx, mk.points[0], mk.points[1], mk.color)
      } else if (mk.type === 'text' && mk.points.length === 1) {
        drawTextLabel(ctx, mk.points[0], mk.text || '', mk.color)
      }
    }

    // In-progress shapes
    if (tempPoints.length > 0) {
      const activeItem = items.find((i) => i.id === activeItemId)
      const color = activeItem?.color || '#3b82f6'

      if (activeTool === 'set-scale') {
        for (const p of tempPoints) {
          ctx.fillStyle = '#f59e0b'
          ctx.beginPath()
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
          ctx.fill()
        }
        if (tempPoints.length === 1 && mousePos) {
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(tempPoints[0].x, tempPoints[0].y)
          ctx.lineTo(mousePos.x, mousePos.y)
          ctx.stroke()
          ctx.setLineDash([])
        }
      } else if (activeTool === 'linear' && tempPoints.length === 1 && mousePos) {
        drawLine(ctx, tempPoints[0], mousePos, color, '')
      } else if (activeTool === 'area-polygon' && tempPoints.length >= 1) {
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(tempPoints[0].x, tempPoints[0].y)
        for (let i = 1; i < tempPoints.length; i++) ctx.lineTo(tempPoints[i].x, tempPoints[i].y)
        if (mousePos) ctx.lineTo(mousePos.x, mousePos.y)
        ctx.stroke()
        for (const p of tempPoints) {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // Drag previews
    if (dragStart && mousePos && isDragging) {
      if (activeTool === 'area-rect') {
        const activeItem = items.find((i) => i.id === activeItemId)
        const color = activeItem?.color || '#3b82f6'
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.fillStyle = color + '20'
        const x = Math.min(dragStart.x, mousePos.x)
        const y = Math.min(dragStart.y, mousePos.y)
        ctx.fillRect(x, y, Math.abs(mousePos.x - dragStart.x), Math.abs(mousePos.y - dragStart.y))
        ctx.strokeRect(x, y, Math.abs(mousePos.x - dragStart.x), Math.abs(mousePos.y - dragStart.y))
      } else if (activeTool === 'markup-rect') {
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 3])
        const x = Math.min(dragStart.x, mousePos.x)
        const y = Math.min(dragStart.y, mousePos.y)
        ctx.strokeRect(x, y, Math.abs(mousePos.x - dragStart.x), Math.abs(mousePos.y - dragStart.y))
        ctx.setLineDash([])
      } else if (activeTool === 'markup-arrow') {
        drawArrow(ctx, dragStart, mousePos, '#f59e0b')
      }
    }
  }, [items, activeItemId, markups, pageKey, tempPoints, mousePos, activeTool, dragStart, isDragging])

  useEffect(() => {
    redrawOverlay()
  }, [redrawOverlay])

  // ─── Drawing helpers ───

  function drawLine(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, label: string) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.fillStyle = color
    for (const p of [a, b]) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    if (label) drawLabel(ctx, mid(a, b), label)
  }

  function drawPolygon(ctx: CanvasRenderingContext2D, pts: Point[], color: string, label: string) {
    ctx.fillStyle = color + '20'
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    if (label) drawLabel(ctx, center(pts), label)
  }

  function drawLabel(ctx: CanvasRenderingContext2D, pos: Point, label: string) {
    ctx.font = 'bold 12px sans-serif'
    const m = ctx.measureText(label)
    const pad = 4
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(pos.x - (m.width + pad * 2) / 2, pos.y - 9, m.width + pad * 2, 18)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, pos.x, pos.y)
  }

  function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - 12 * Math.cos(angle - Math.PI / 6), to.y - 12 * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(to.x - 12 * Math.cos(angle + Math.PI / 6), to.y - 12 * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  }

  function drawTextLabel(ctx: CanvasRenderingContext2D, pos: Point, text: string, color: string) {
    ctx.font = 'bold 14px sans-serif'
    const m = ctx.measureText(text)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(pos.x - 2, pos.y - 16, m.width + 12, 22)
    ctx.fillStyle = color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, pos.x + 4, pos.y - 5)
  }

  // ─── Canvas coordinates ───

  function getCanvasPoint(e: React.MouseEvent): Point {
    const rect = overlayCanvasRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (overlayCanvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top) * (overlayCanvasRef.current!.height / rect.height),
    }
  }

  // ─── Prereqs ───

  function checkPrereqs(): boolean {
    if (!scaleCalibrated) {
      setWarning('Set page scale before measuring.')
      setTimeout(() => setWarning(null), 3000)
      return false
    }
    if (!activeItemId) {
      setWarning('Select or create a measurement item first.')
      setTimeout(() => setWarning(null), 3000)
      return false
    }
    const item = items.find((i) => i.id === activeItemId)
    if (!item) return false
    if (activeTool === 'linear' && item.type !== 'linear') {
      setWarning('Active item is area type. Select a linear item.')
      setTimeout(() => setWarning(null), 3000)
      return false
    }
    if ((activeTool === 'area-rect' || activeTool === 'area-polygon') && item.type !== 'area') {
      setWarning('Active item is linear type. Select an area item.')
      setTimeout(() => setWarning(null), 3000)
      return false
    }
    return true
  }

  // ─── Mouse handlers ───

  function handleMouseDown(e: React.MouseEvent) {
    const pt = getCanvasPoint(e)
    if (activeTool === 'pan') {
      setPanStart({ x: e.clientX, y: e.clientY })
      setPanStartOffset({ ...panOffset })
      return
    }
    if (activeTool === 'area-rect' || activeTool === 'markup-rect' || activeTool === 'markup-arrow') {
      if (activeTool === 'area-rect' && !checkPrereqs()) return
      setDragStart(pt)
      setIsDragging(true)
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    setMousePos(getCanvasPoint(e))
    if (activeTool === 'pan' && panStart) {
      setPanOffset({
        x: panStartOffset.x + e.clientX - panStart.x,
        y: panStartOffset.y + e.clientY - panStart.y,
      })
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (activeTool === 'pan' && panStart) { setPanStart(null); return }
    const pt = getCanvasPoint(e)

    if (isDragging && dragStart) {
      setIsDragging(false)
      if (activeTool === 'area-rect') {
        const ppf = pageScale!
        const area = (Math.abs(pt.x - dragStart.x) / ppf) * (Math.abs(pt.y - dragStart.y) / ppf)
        if (area < 0.01) { setDragStart(null); return }
        addMeasurement({ id: genId(), type: 'area', points: [dragStart, pt], valueInFeet: area, label: `${area.toFixed(1)} sq ft`, pageKey })
      } else if (activeTool === 'markup-rect') {
        onMarkupsChange([...markups, { id: genId(), type: 'rect', points: [dragStart, pt], color: '#f59e0b', pageKey }])
      } else if (activeTool === 'markup-arrow') {
        onMarkupsChange([...markups, { id: genId(), type: 'arrow', points: [dragStart, pt], color: '#f59e0b', pageKey }])
      }
      setDragStart(null)
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (activeTool === 'pan' || isDragging) return
    const pt = getCanvasPoint(e)

    if (activeTool === 'set-scale') {
      const newPts = [...scalePoints, pt]
      setScalePoints(newPts)
      setTempPoints(newPts)
      if (newPts.length === 2) setShowScaleModal(true)
      return
    }
    if (activeTool === 'linear') {
      if (!checkPrereqs()) return
      const newPts = [...tempPoints, pt]
      setTempPoints(newPts)
      if (newPts.length === 2) {
        const d = dist(newPts[0], newPts[1]) / pageScale!
        addMeasurement({ id: genId(), type: 'linear', points: newPts, valueInFeet: d, label: fmtFtIn(d), pageKey })
        setTempPoints([])
      }
      return
    }
    if (activeTool === 'area-polygon') {
      if (!checkPrereqs()) return
      setTempPoints((p) => [...p, pt])
      return
    }
    if (activeTool === 'markup-text') {
      setMarkupTextInput({ pos: pt, visible: true })
      setMarkupTextValue('')
    }
  }

  function handleDoubleClick() {
    if (activeTool === 'area-polygon' && tempPoints.length >= 3) {
      const ppf = pageScale!
      const area = polyArea(tempPoints) / (ppf * ppf)
      addMeasurement({ id: genId(), type: 'area', points: [...tempPoints], valueInFeet: area, label: `${area.toFixed(1)} sq ft`, pageKey })
      setTempPoints([])
    }
  }

  // ─── Scale modal ───

  function handleScaleSubmit() {
    if (!scaleInput || isNaN(Number(scaleInput))) return
    const realFt = scaleUnit === 'inches' ? Number(scaleInput) / 12 : Number(scaleInput)
    onPageScaleChange(dist(scalePoints[0], scalePoints[1]) / realFt)
    setShowScaleModal(false)
    setScalePoints([])
    setTempPoints([])
    setScaleInput('')
    setActiveTool('pan')
  }

  function addMeasurement(m: Measurement) {
    onItemsChange(items.map((it) => it.id === activeItemId ? { ...it, measurements: [...it.measurements, m] } : it))
  }

  // ─── Item management (delegated from sidebar) ───

  function handleAddItem(name: string, type: MeasurementType) {
    const newItem: TakeoffItem = { id: genId(), name, type, measurements: [], color: getNextColor() }
    onItemsChange([...items, newItem])
    setActiveItemId(newItem.id)
  }

  function handleDeleteItem(id: string) {
    onItemsChange(items.filter((i) => i.id !== id))
    if (activeItemId === id) setActiveItemId(null)
  }

  function handleRenameItem(id: string, name: string) {
    onItemsChange(items.map((i) => (i.id === id ? { ...i, name } : i)))
  }

  function handleDeleteMeasurement(itemId: string, mId: string) {
    onItemsChange(items.map((it) => it.id === itemId ? { ...it, measurements: it.measurements.filter((m) => m.id !== mId) } : it))
  }

  function handleMarkupTextSubmit() {
    if (!markupTextValue.trim()) { setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false }); return }
    onMarkupsChange([...markups, { id: genId(), type: 'text', points: [markupTextInput.pos], text: markupTextValue.trim(), color: '#f59e0b', pageKey }])
    setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false })
    setMarkupTextValue('')
  }

  function handleToolChange(tool: ToolMode) {
    setActiveTool(tool)
    setTempPoints([])
    setScalePoints([])
    setDragStart(null)
    setIsDragging(false)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setTempPoints([])
        setScalePoints([])
        setDragStart(null)
        setIsDragging(false)
        if (showScaleModal) setShowScaleModal(false)
        if (markupTextInput.visible) setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showScaleModal, markupTextInput.visible])

  const cursor = activeTool === 'pan' ? (panStart ? 'grabbing' : 'grab') : activeTool === 'markup-text' ? 'text' : 'crosshair'

  // Whether canvas exceeds container (scrollable)
  const canOverflow = zoom > 1

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Back + Toolbar */}
      <div className="flex items-center bg-gray-900 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white text-xs font-medium transition-colors border-r border-gray-700"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Dashboard
        </button>
        <div className="flex-1 min-w-0">
          <TakeoffToolbar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            currentPage={page.pageIndex}
            totalPages={1}
            onPrevPage={() => {}}
            onNextPage={() => {}}
            zoom={zoom}
            onZoomIn={() => setZoom((z) => Math.min(z + 0.25, 5))}
            onZoomOut={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
            pageScale={scaleCalibrated ? { pageIndex: page.pageIndex, pixelsPerFoot: pageScale!, calibrated: true } : undefined}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            hidePagination
          />
        </div>
      </div>

      {warning && (
        <div className="bg-amber-500/90 text-white text-xs px-3 py-1.5 text-center font-medium flex-shrink-0">
          {warning}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className={`flex-1 relative bg-gray-200 ${canOverflow ? 'overflow-auto' : 'overflow-hidden'}`}
        >
          <div
            className={`relative ${canOverflow ? 'inline-block' : 'flex items-center justify-center w-full h-full'}`}
            style={{
              transform: canOverflow ? `translate(${panOffset.x}px, ${panOffset.y}px)` : undefined,
              cursor,
            }}
          >
            <div className="relative inline-block">
              <canvas ref={canvasRef} className="block" />
              <canvas
                ref={overlayCanvasRef}
                className="absolute top-0 left-0 block"
                style={{ cursor }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
              />
            </div>
          </div>

          {markupTextInput.visible && (
            <div
              className="absolute z-10"
              style={{
                left: markupTextInput.pos.x / (overlayCanvasRef.current ? overlayCanvasRef.current.width / overlayCanvasRef.current.getBoundingClientRect().width : 1) + panOffset.x,
                top: markupTextInput.pos.y / (overlayCanvasRef.current ? overlayCanvasRef.current.height / overlayCanvasRef.current.getBoundingClientRect().height : 1) + panOffset.y,
              }}
            >
              <input
                type="text"
                value={markupTextValue}
                onChange={(e) => setMarkupTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleMarkupTextSubmit()
                  if (e.key === 'Escape') setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false })
                }}
                placeholder="Enter text..."
                className="px-2 py-1 bg-white border border-gray-400 rounded text-sm shadow-lg focus:outline-none focus:border-amber-500"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <TakeoffSidebar
          items={items}
          activeItemId={activeItemId}
          onSelectItem={setActiveItemId}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
          onRenameItem={handleRenameItem}
          onDeleteMeasurement={handleDeleteMeasurement}
        />
      </div>

      {/* Scale modal */}
      {showScaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Set Scale</h3>
            <p className="text-sm text-gray-500 mb-4">Enter the real-world distance between the two points.</p>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                value={scaleInput}
                onChange={(e) => setScaleInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScaleSubmit()}
                placeholder="Distance..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <select
                value={scaleUnit}
                onChange={(e) => setScaleUnit(e.target.value as 'feet' | 'inches')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="feet">feet</option>
                <option value="inches">inches</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowScaleModal(false); setScalePoints([]); setTempPoints([]) }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleScaleSubmit}
                className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition-colors"
              >
                Set Scale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
