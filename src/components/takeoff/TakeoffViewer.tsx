'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import TakeoffToolbar from './TakeoffToolbar'
import TakeoffSidebar from './TakeoffSidebar'
import type {
  ToolMode,
  Point,
  Measurement,
  TakeoffItem,
  PageScale,
  MeasurementType,
  Markup,
} from './types'
import { UploadCloudIcon } from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// Color palette for items
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

function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

function formatFeetInches(totalFeet: number): string {
  const feet = Math.floor(totalFeet)
  const inches = Math.round((totalFeet - feet) * 12)
  if (inches === 12) return `${feet + 1}'-0"`
  return `${feet}'-${inches}"`
}

function polygonArea(pts: Point[]): number {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i].x * pts[j].y
    area -= pts[j].x * pts[i].y
  }
  return Math.abs(area) / 2
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function centroid(pts: Point[]): Point {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return { x: cx, y: cy }
}

export default function TakeoffViewer() {
  // PDF state
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(1)
  const pageRef = useRef<PDFPageProxy | null>(null)

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Tool state
  const [activeTool, setActiveTool] = useState<ToolMode>('pan')
  const [scalePoints, setScalePoints] = useState<Point[]>([])
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [scaleInput, setScaleInput] = useState('')
  const [scaleUnit, setScaleUnit] = useState<'feet' | 'inches'>('feet')

  // Measurement state
  const [items, setItems] = useState<TakeoffItem[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [pageScales, setPageScales] = useState<PageScale[]>([])
  const [markups, setMarkups] = useState<Markup[]>([])

  // Drawing-in-progress state
  const [tempPoints, setTempPoints] = useState<Point[]>([])
  const [mousePos, setMousePos] = useState<Point | null>(null)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [markupTextInput, setMarkupTextInput] = useState<{ pos: Point; visible: boolean }>({ pos: { x: 0, y: 0 }, visible: false })
  const [markupTextValue, setMarkupTextValue] = useState('')

  // Warning banner
  const [warning, setWarning] = useState<string | null>(null)

  // Pan state
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 })
  const [panStart, setPanStart] = useState<Point | null>(null)
  const [panStartOffset, setPanStartOffset] = useState<Point>({ x: 0, y: 0 })

  const currentPageScale = pageScales.find((s) => s.pageIndex === currentPage)

  // ─── PDF Loading ───

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const arrayBuffer = await file.arrayBuffer()
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    setPdfDoc(doc)
    setTotalPages(doc.numPages)
    setCurrentPage(0)
    setPanOffset({ x: 0, y: 0 })
  }

  // ─── Render PDF page ───

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return
    const page = await pdfDoc.getPage(currentPage + 1)
    pageRef.current = page

    const viewport = page.getViewport({ scale: zoom * 1.5 })
    const canvas = canvasRef.current
    canvas.width = viewport.width
    canvas.height = viewport.height

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    // Resize overlay
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = viewport.width
      overlayCanvasRef.current.height = viewport.height
    }
  }, [pdfDoc, currentPage, zoom])

  useEffect(() => {
    renderPage()
  }, [renderPage])

  // ─── Redraw overlay ───

  const redrawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw all measurements
    for (const item of items) {
      const isActive = item.id === activeItemId
      const color = isActive ? item.color : '#6b7280'
      const alpha = isActive ? 1 : 0.5

      for (const m of item.measurements) {
        if (m.pageIndex !== currentPage) continue
        ctx.globalAlpha = alpha

        if (m.type === 'linear' && m.points.length === 2) {
          drawLine(ctx, m.points[0], m.points[1], color, m.label)
        } else if (m.type === 'area' && m.points.length >= 3) {
          drawPolygon(ctx, m.points, color, m.label)
        } else if (m.type === 'area' && m.points.length === 2) {
          // Rectangle stored as 2 corners
          const [a, b] = m.points
          const rectPts: Point[] = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
          drawPolygon(ctx, rectPts, color, m.label)
        }
      }
    }
    ctx.globalAlpha = 1

    // Draw markups
    for (const mk of markups) {
      if (mk.pageIndex !== currentPage) continue
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

    // Draw in-progress shapes
    if (tempPoints.length > 0) {
      const activeItem = items.find((i) => i.id === activeItemId)
      const color = activeItem?.color || '#3b82f6'

      if (activeTool === 'set-scale') {
        // Scale calibration points
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
      } else if (activeTool === 'area-polygon') {
        // Draw polygon in progress
        if (tempPoints.length >= 1) {
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(tempPoints[0].x, tempPoints[0].y)
          for (let i = 1; i < tempPoints.length; i++) {
            ctx.lineTo(tempPoints[i].x, tempPoints[i].y)
          }
          if (mousePos) ctx.lineTo(mousePos.x, mousePos.y)
          ctx.stroke()

          // Draw points
          for (const p of tempPoints) {
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }

    // Drag previews for rect tools
    if (dragStart && mousePos && isDragging) {
      if (activeTool === 'area-rect') {
        const activeItem = items.find((i) => i.id === activeItemId)
        const color = activeItem?.color || '#3b82f6'
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.fillStyle = color + '20'
        const x = Math.min(dragStart.x, mousePos.x)
        const y = Math.min(dragStart.y, mousePos.y)
        const w = Math.abs(mousePos.x - dragStart.x)
        const h = Math.abs(mousePos.y - dragStart.y)
        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
      } else if (activeTool === 'markup-rect') {
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 3])
        const x = Math.min(dragStart.x, mousePos.x)
        const y = Math.min(dragStart.y, mousePos.y)
        const w = Math.abs(mousePos.x - dragStart.x)
        const h = Math.abs(mousePos.y - dragStart.y)
        ctx.strokeRect(x, y, w, h)
        ctx.setLineDash([])
      } else if (activeTool === 'markup-arrow') {
        drawArrow(ctx, dragStart, mousePos, '#f59e0b')
      }
    }
  }, [items, activeItemId, markups, currentPage, tempPoints, mousePos, activeTool, dragStart, isDragging])

  useEffect(() => {
    redrawOverlay()
  }, [redrawOverlay])

  // ─── Canvas drawing helpers ───

  function drawLine(ctx: CanvasRenderingContext2D, a: Point, b: Point, color: string, label: string) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()

    // Endpoints
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(a.x, a.y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2)
    ctx.fill()

    if (label) {
      const mid = midpoint(a, b)
      drawMeasurementLabel(ctx, mid, label, color)
    }
  }

  function drawPolygon(ctx: CanvasRenderingContext2D, pts: Point[], color: string, label: string) {
    ctx.fillStyle = color + '20'
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    if (label) {
      const c = centroid(pts)
      drawMeasurementLabel(ctx, c, label, color)
    }
  }

  function drawMeasurementLabel(ctx: CanvasRenderingContext2D, pos: Point, label: string, color: string) {
    ctx.font = 'bold 12px sans-serif'
    const metrics = ctx.measureText(label)
    const pad = 4
    const w = metrics.width + pad * 2
    const h = 18
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, pos.x, pos.y)
  }

  function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string) {
    const headLen = 12
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
    ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fill()
  }

  function drawTextLabel(ctx: CanvasRenderingContext2D, pos: Point, text: string, color: string) {
    ctx.font = 'bold 14px sans-serif'
    const metrics = ctx.measureText(text)
    const pad = 6
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(pos.x - 2, pos.y - 16, metrics.width + pad * 2, 22)
    ctx.fillStyle = color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, pos.x + pad - 2, pos.y - 5)
  }

  // ─── Get canvas coordinates ───

  function getCanvasPoint(e: React.MouseEvent): Point {
    const rect = overlayCanvasRef.current!.getBoundingClientRect()
    const scaleX = overlayCanvasRef.current!.width / rect.width
    const scaleY = overlayCanvasRef.current!.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  // ─── Check prerequisites for measurement ───

  function checkMeasurePrereqs(): boolean {
    if (!currentPageScale?.calibrated) {
      setWarning('Please set the page scale before measuring.')
      setTimeout(() => setWarning(null), 3000)
      return false
    }
    if (!activeItemId) {
      setWarning('Please select or create a measurement item first.')
      setTimeout(() => setWarning(null), 3000)
      return false
    }
    const item = items.find((i) => i.id === activeItemId)
    if (!item) return false

    // Check type compatibility
    if (activeTool === 'linear' && item.type !== 'linear') {
      setWarning('Active item is an area type. Select a linear item or create one.')
      setTimeout(() => setWarning(null), 3000)
      return false
    }
    if ((activeTool === 'area-rect' || activeTool === 'area-polygon') && item.type !== 'area') {
      setWarning('Active item is a linear type. Select an area item or create one.')
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
      if (activeTool === 'area-rect' && !checkMeasurePrereqs()) return
      setDragStart(pt)
      setIsDragging(true)
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const pt = getCanvasPoint(e)
    setMousePos(pt)

    if (activeTool === 'pan' && panStart) {
      const dx = e.clientX - panStart.x
      const dy = e.clientY - panStart.y
      setPanOffset({ x: panStartOffset.x + dx, y: panStartOffset.y + dy })
      return
    }

    if (isDragging) {
      // Handled by redrawOverlay via mousePos update
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (activeTool === 'pan' && panStart) {
      setPanStart(null)
      return
    }

    const pt = getCanvasPoint(e)

    if (isDragging && dragStart) {
      setIsDragging(false)

      if (activeTool === 'area-rect') {
        const ppf = currentPageScale!.pixelsPerFoot
        const w = Math.abs(pt.x - dragStart.x) / ppf
        const h = Math.abs(pt.y - dragStart.y) / ppf
        const area = w * h
        if (area < 0.01) { setDragStart(null); return }
        const label = `${area.toFixed(1)} sq ft`
        const measurement: Measurement = {
          id: genId(),
          type: 'area',
          points: [dragStart, pt],
          valueInFeet: area,
          label,
          pageIndex: currentPage,
        }
        addMeasurementToActiveItem(measurement)
      } else if (activeTool === 'markup-rect') {
        const mk: Markup = {
          id: genId(),
          type: 'rect',
          points: [dragStart, pt],
          color: '#f59e0b',
          pageIndex: currentPage,
        }
        setMarkups((prev) => [...prev, mk])
      } else if (activeTool === 'markup-arrow') {
        const mk: Markup = {
          id: genId(),
          type: 'arrow',
          points: [dragStart, pt],
          color: '#f59e0b',
          pageIndex: currentPage,
        }
        setMarkups((prev) => [...prev, mk])
      }
      setDragStart(null)
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (activeTool === 'pan') return
    if (isDragging) return

    const pt = getCanvasPoint(e)

    if (activeTool === 'set-scale') {
      const newPts = [...scalePoints, pt]
      setScalePoints(newPts)
      setTempPoints(newPts)
      if (newPts.length === 2) {
        setShowScaleModal(true)
      }
      return
    }

    if (activeTool === 'linear') {
      if (!checkMeasurePrereqs()) return
      const newPts = [...tempPoints, pt]
      setTempPoints(newPts)
      if (newPts.length === 2) {
        const ppf = currentPageScale!.pixelsPerFoot
        const dist = distance(newPts[0], newPts[1]) / ppf
        const label = formatFeetInches(dist)
        const measurement: Measurement = {
          id: genId(),
          type: 'linear',
          points: newPts,
          valueInFeet: dist,
          label,
          pageIndex: currentPage,
        }
        addMeasurementToActiveItem(measurement)
        setTempPoints([])
      }
      return
    }

    if (activeTool === 'area-polygon') {
      if (!checkMeasurePrereqs()) return
      setTempPoints((prev) => [...prev, pt])
      return
    }

    if (activeTool === 'markup-text') {
      setMarkupTextInput({ pos: pt, visible: true })
      setMarkupTextValue('')
      return
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (activeTool === 'area-polygon' && tempPoints.length >= 3) {
      const ppf = currentPageScale!.pixelsPerFoot
      const pxArea = polygonArea(tempPoints)
      const realArea = pxArea / (ppf * ppf)
      const label = `${realArea.toFixed(1)} sq ft`
      const measurement: Measurement = {
        id: genId(),
        type: 'area',
        points: [...tempPoints],
        valueInFeet: realArea,
        label,
        pageIndex: currentPage,
      }
      addMeasurementToActiveItem(measurement)
      setTempPoints([])
    }
  }

  // ─── Scale calibration ───

  function handleScaleSubmit() {
    if (!scaleInput || isNaN(Number(scaleInput))) return
    const realDist = Number(scaleInput)
    const realDistFeet = scaleUnit === 'inches' ? realDist / 12 : realDist
    const pxDist = distance(scalePoints[0], scalePoints[1])
    const ppf = pxDist / realDistFeet

    setPageScales((prev) => {
      const filtered = prev.filter((s) => s.pageIndex !== currentPage)
      return [...filtered, { pageIndex: currentPage, pixelsPerFoot: ppf, calibrated: true }]
    })

    setShowScaleModal(false)
    setScalePoints([])
    setTempPoints([])
    setScaleInput('')
    setActiveTool('pan')
  }

  // ─── Add measurement to active item ───

  function addMeasurementToActiveItem(measurement: Measurement) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === activeItemId
          ? { ...item, measurements: [...item.measurements, measurement] }
          : item
      )
    )
  }

  // ─── Item management ───

  function handleAddItem(name: string, type: MeasurementType) {
    const newItem: TakeoffItem = {
      id: genId(),
      name,
      type,
      measurements: [],
      color: getNextColor(),
    }
    setItems((prev) => [...prev, newItem])
    setActiveItemId(newItem.id)
  }

  function handleDeleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (activeItemId === id) {
      setActiveItemId(null)
    }
  }

  function handleRenameItem(id: string, name: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, name } : i))
    )
  }

  function handleDeleteMeasurement(itemId: string, measurementId: string) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, measurements: item.measurements.filter((m) => m.id !== measurementId) }
          : item
      )
    )
  }

  // ─── Markup text submit ───

  function handleMarkupTextSubmit() {
    if (!markupTextValue.trim()) {
      setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false })
      return
    }
    const mk: Markup = {
      id: genId(),
      type: 'text',
      points: [markupTextInput.pos],
      text: markupTextValue.trim(),
      color: '#f59e0b',
      pageIndex: currentPage,
    }
    setMarkups((prev) => [...prev, mk])
    setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false })
    setMarkupTextValue('')
  }

  // ─── Page navigation ───

  function handlePrevPage() {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1)
      setTempPoints([])
      setPanOffset({ x: 0, y: 0 })
    }
  }

  function handleNextPage() {
    if (currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1)
      setTempPoints([])
      setPanOffset({ x: 0, y: 0 })
    }
  }

  // ─── Zoom ───

  function handleZoomIn() {
    setZoom((z) => Math.min(z + 0.25, 5))
  }

  function handleZoomOut() {
    setZoom((z) => Math.max(z - 0.25, 0.25))
  }

  // ─── Tool change ───

  function handleToolChange(tool: ToolMode) {
    setActiveTool(tool)
    setTempPoints([])
    setScalePoints([])
    setDragStart(null)
    setIsDragging(false)
  }

  // ─── Escape key to cancel in-progress drawing ───

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setTempPoints([])
        setScalePoints([])
        setDragStart(null)
        setIsDragging(false)
        if (showScaleModal) setShowScaleModal(false)
        if (markupTextInput.visible) setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showScaleModal, markupTextInput.visible])

  // ─── Cursor ───

  function getCursor(): string {
    if (activeTool === 'pan') return panStart ? 'grabbing' : 'grab'
    if (activeTool === 'set-scale') return 'crosshair'
    if (activeTool === 'linear') return 'crosshair'
    if (activeTool === 'area-rect') return 'crosshair'
    if (activeTool === 'area-polygon') return 'crosshair'
    if (activeTool === 'markup-rect') return 'crosshair'
    if (activeTool === 'markup-text') return 'text'
    if (activeTool === 'markup-arrow') return 'crosshair'
    return 'default'
  }

  // ─── Upload prompt ───

  if (!pdfDoc) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <div className="text-center">
          <UploadCloudIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Upload Construction Plans</h2>
          <p className="text-gray-500 mb-6 text-sm">Upload a PDF to begin taking measurements</p>
          <label className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-lg cursor-pointer hover:bg-amber-600 transition-colors font-medium">
            <UploadCloudIcon className="w-5 h-5" />
            Choose PDF
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Toolbar */}
      <TakeoffToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        pageScale={currentPageScale}
      />

      {/* Warning banner */}
      {warning && (
        <div className="bg-amber-500/90 text-white text-sm px-4 py-2 text-center font-medium">
          {warning}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto relative bg-gray-300"
        >
          <div
            className="relative inline-block"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              cursor: getCursor(),
            }}
          >
            <canvas ref={canvasRef} className="block" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute top-0 left-0 block"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
            />
          </div>

          {/* Markup text input overlay */}
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

        {/* Right sidebar */}
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

      {/* Scale calibration modal */}
      {showScaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Set Scale</h3>
            <p className="text-sm text-gray-600 mb-4">
              What is the real-world distance between the two points you selected?
            </p>
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
                onClick={() => {
                  setShowScaleModal(false)
                  setScalePoints([])
                  setTempPoints([])
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
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
