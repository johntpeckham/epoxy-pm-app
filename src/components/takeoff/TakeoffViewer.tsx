'use client'

import { useState, useRef, useEffect } from 'react'
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
import { ArrowLeftIcon, AlertTriangleIcon } from 'lucide-react'

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

function ptDist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
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

// ─── SVG sub-components ───

function SvgLine({ a, b, color, label }: { a: Point; b: Point; color: string; label: string }) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const labelW = label ? label.length * 7 + 10 : 0
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={2} />
      <circle cx={a.x} cy={a.y} r={4} fill={color} />
      <circle cx={b.x} cy={b.y} r={4} fill={color} />
      {label && (
        <>
          <rect x={mid.x - labelW / 2} y={mid.y - 9} width={labelW} height={18} rx={3} fill="rgba(0,0,0,0.75)" />
          <text x={mid.x} y={mid.y} fill="white" fontSize={12} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">{label}</text>
        </>
      )}
    </g>
  )
}

function SvgPolygon({ points, color, label }: { points: Point[]; color: string; label: string }) {
  const center = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  }
  const labelW = label ? label.length * 7 + 10 : 0
  return (
    <g>
      <polygon
        points={points.map(p => `${p.x},${p.y}`).join(' ')}
        fill={color + '20'}
        stroke={color}
        strokeWidth={2}
      />
      {label && (
        <>
          <rect x={center.x - labelW / 2} y={center.y - 9} width={labelW} height={18} rx={3} fill="rgba(0,0,0,0.75)" />
          <text x={center.x} y={center.y} fill="white" fontSize={12} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">{label}</text>
        </>
      )}
    </g>
  )
}

function SvgArrow({ from, to, color }: { from: Point; to: Point; color: string }) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const hl = 12
  const p1 = { x: to.x - hl * Math.cos(angle - Math.PI / 6), y: to.y - hl * Math.sin(angle - Math.PI / 6) }
  const p2 = { x: to.x - hl * Math.cos(angle + Math.PI / 6), y: to.y - hl * Math.sin(angle + Math.PI / 6) }
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={2} />
      <polygon points={`${to.x},${to.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={color} />
    </g>
  )
}

function SvgTextLabel({ pos, text, color }: { pos: Point; text: string; color: string }) {
  const w = text.length * 8 + 12
  return (
    <g>
      <rect x={pos.x - 2} y={pos.y - 16} width={w} height={22} rx={2} fill="rgba(255,255,255,0.85)" />
      <text x={pos.x + 4} y={pos.y - 5} fill={color} fontSize={14} fontWeight="bold" dominantBaseline="middle">{text}</text>
    </g>
  )
}

// ─── Main component ───

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

  // ─── Refs ───
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ─── PDF state ───
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null)
  const [pdfDims, setPdfDims] = useState({ w: 0, h: 0 })
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  // ─── View state ───
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  // ─── Tool state ───
  const [activeTool, setActiveTool] = useState<ToolMode>('pan')
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [tempPoints, setTempPoints] = useState<Point[]>([])
  const [mousePos, setMousePos] = useState<Point | null>(null)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // ─── Scale calibration ───
  const [scalePoints, setScalePoints] = useState<Point[]>([])
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [scaleInput, setScaleInput] = useState('')
  const [scaleUnit, setScaleUnit] = useState<'feet' | 'inches'>('feet')

  // ─── Markup text ───
  const [markupTextInput, setMarkupTextInput] = useState<{ pos: Point; visible: boolean }>({
    pos: { x: 0, y: 0 }, visible: false,
  })
  const [markupTextValue, setMarkupTextValue] = useState('')

  // ─── Warning ───
  const [warning, setWarning] = useState<string | null>(null)

  // ─── Pulse animation for scale point ───
  const [pulsePhase, setPulsePhase] = useState(0)
  useEffect(() => {
    if (activeTool !== 'set-scale' || scalePoints.length !== 1) return
    const id = setInterval(() => setPulsePhase(p => p + 1), 50)
    return () => clearInterval(id)
  }, [activeTool, scalePoints.length])

  // ─── Refs for native touch handlers (avoid stale closures) ───
  const panXRef = useRef(0)
  const panYRef = useRef(0)
  const zoomRef = useRef(1)
  const activeToolRef = useRef<ToolMode>('pan')
  useEffect(() => { panXRef.current = panX }, [panX])
  useEffect(() => { panYRef.current = panY }, [panY])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])

  // ─── Pan tracking refs ───
  const isPanningRef = useRef(false)
  const panStartMouseRef = useRef({ x: 0, y: 0 })
  const panStartOffsetRef = useRef({ x: 0, y: 0 })

  // ─── Pinch tracking ───
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)

  // ─── Derived values ───
  const fitScale = containerSize.w > 0 && pdfDims.w > 0
    ? Math.min(containerSize.w / pdfDims.w, containerSize.h / pdfDims.h) * 0.92
    : 1
  const renderScale = fitScale * zoom
  const canvasW = pdfDims.w > 0 ? Math.round(pdfDims.w * renderScale) : 0
  const canvasH = pdfDims.h > 0 ? Math.round(pdfDims.h * renderScale) : 0

  // Center offset when canvas is smaller than container
  const offsetX = canvasW > 0 ? Math.max(0, (containerSize.w - canvasW) / 2) : 0
  const offsetY = canvasH > 0 ? Math.max(0, (containerSize.h - canvasH) / 2) : 0

  // ─── Convert PDF point to screen coordinates ───
  function toScreen(p: Point): Point {
    return { x: p.x * renderScale, y: p.y * renderScale }
  }

  // ─── Get PDF coordinates from mouse event on SVG ───
  function getSvgPoint(e: React.MouseEvent): Point {
    const svg = svgRef.current
    if (!svg || renderScale === 0) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / renderScale,
      y: (e.clientY - rect.top) / renderScale,
    }
  }

  // ─── ResizeObserver ───
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        setContainerSize(prev => {
          const w = Math.round(width)
          const h = Math.round(height)
          if (prev.w === w && prev.h === h) return prev
          return { w, h }
        })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ─── Load PDF page ───
  useEffect(() => {
    if (!page.arrayBuffer) return
    let cancelled = false
    async function load() {
      try {
        const data = new Uint8Array(page.arrayBuffer!.slice(0))
        const doc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return
        const p = await doc.getPage(page.pageIndex + 1)
        if (cancelled) return
        const vp = p.getViewport({ scale: 1 })
        setPdfPage(p)
        setPdfDims({ w: vp.width, h: vp.height })
      } catch {
        // PDF load failed
      }
    }
    load()
    return () => { cancelled = true }
  }, [page.arrayBuffer, page.pageIndex])

  // ─── Render canvas ───
  useEffect(() => {
    if (!pdfPage || !canvasRef.current || canvasW === 0) return
    const canvas = canvasRef.current
    const viewport = pdfPage.getViewport({ scale: renderScale })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const task = pdfPage.render({ canvas, canvasContext: ctx, viewport })
    task.promise.catch(() => {})
    return () => { task.cancel() }
  }, [pdfPage, renderScale, canvasW, canvasH])

  // ─── Reset pan when zoom fits ───
  useEffect(() => {
    if (zoom <= 1) { setPanX(0); setPanY(0) }
  }, [zoom])

  // ─── Native touch events (passive: false for preventDefault) ───
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        )
        pinchRef.current = { dist, zoom: zoomRef.current }
      } else if (e.touches.length === 1 && activeToolRef.current === 'pan') {
        e.preventDefault()
        isPanningRef.current = true
        panStartMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        panStartOffsetRef.current = { x: panXRef.current, y: panYRef.current }
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY,
        )
        const newZoom = Math.min(5, Math.max(0.5, pinchRef.current.zoom * (dist / pinchRef.current.dist)))
        setZoom(newZoom)
      } else if (e.touches.length === 1 && isPanningRef.current) {
        e.preventDefault()
        setPanX(panStartOffsetRef.current.x + e.touches[0].clientX - panStartMouseRef.current.x)
        setPanY(panStartOffsetRef.current.y + e.touches[0].clientY - panStartMouseRef.current.y)
      }
    }

    function onTouchEnd() {
      pinchRef.current = null
      isPanningRef.current = false
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

  // ─── Keyboard ───
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

  // ─── Scale banner text ───
  function getScaleBannerText(): string | null {
    if (activeTool !== 'set-scale') return null
    if (scalePoints.length === 0) return "Click two points on the plan that represent a known distance"
    if (scalePoints.length === 1) return "First point set — now click the second point"
    return null
  }
  const scaleBannerText = getScaleBannerText()

  // ─── Prereqs check ───
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
    const item = items.find(i => i.id === activeItemId)
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
    e.preventDefault()
    e.stopPropagation()
    const pt = getSvgPoint(e)
    if (activeTool === 'pan') {
      isPanningRef.current = true
      panStartMouseRef.current = { x: e.clientX, y: e.clientY }
      panStartOffsetRef.current = { x: panXRef.current, y: panYRef.current }
      return
    }
    if (activeTool === 'area-rect' || activeTool === 'markup-rect' || activeTool === 'markup-arrow') {
      if (activeTool === 'area-rect' && !checkPrereqs()) return
      setDragStart(pt)
      setIsDragging(true)
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isPanningRef.current) {
      setPanX(panStartOffsetRef.current.x + e.clientX - panStartMouseRef.current.x)
      setPanY(panStartOffsetRef.current.y + e.clientY - panStartMouseRef.current.y)
      return
    }
    setMousePos(getSvgPoint(e))
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (isPanningRef.current) {
      isPanningRef.current = false
      return
    }
    const pt = getSvgPoint(e)
    if (isDragging && dragStart) {
      setIsDragging(false)
      const dx = Math.abs(pt.x - dragStart.x)
      const dy = Math.abs(pt.y - dragStart.y)
      if (activeTool === 'area-rect') {
        const ppf = pageScale!
        const area = (dx / ppf) * (dy / ppf)
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
    if (activeTool === 'pan') return
    if (activeTool === 'area-rect' || activeTool === 'markup-rect' || activeTool === 'markup-arrow') return
    const pt = getSvgPoint(e)

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
        const d = ptDist(newPts[0], newPts[1]) / pageScale!
        addMeasurement({ id: genId(), type: 'linear', points: newPts, valueInFeet: d, label: fmtFtIn(d), pageKey })
        setTempPoints([])
      }
      return
    }
    if (activeTool === 'area-polygon') {
      if (!checkPrereqs()) return
      setTempPoints(p => [...p, pt])
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
    if (realFt <= 0) return
    onPageScaleChange(ptDist(scalePoints[0], scalePoints[1]) / realFt)
    setShowScaleModal(false)
    setScalePoints([])
    setTempPoints([])
    setScaleInput('')
    setActiveTool('pan')
  }

  function addMeasurement(m: Measurement) {
    onItemsChange(items.map(it => it.id === activeItemId ? { ...it, measurements: [...it.measurements, m] } : it))
  }

  // ─── Item management ───
  function handleAddItem(name: string, type: MeasurementType) {
    const newItem: TakeoffItem = { id: genId(), name, type, measurements: [], color: getNextColor() }
    onItemsChange([...items, newItem])
    setActiveItemId(newItem.id)
  }

  function handleDeleteItem(id: string) {
    onItemsChange(items.filter(i => i.id !== id))
    if (activeItemId === id) setActiveItemId(null)
  }

  function handleRenameItem(id: string, name: string) {
    onItemsChange(items.map(i => (i.id === id ? { ...i, name } : i)))
  }

  function handleDeleteMeasurement(itemId: string, mId: string) {
    onItemsChange(items.map(it => it.id === itemId ? { ...it, measurements: it.measurements.filter(m => m.id !== mId) } : it))
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

  // ─── Cursor ───
  const cursor = activeTool === 'pan'
    ? (isPanningRef.current ? 'grabbing' : 'grab')
    : activeTool === 'markup-text' ? 'text' : 'crosshair'

  // ─── No PDF data ───
  if (!page.arrayBuffer) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center bg-gray-900 flex-shrink-0">
          <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white text-xs font-medium transition-colors border-r border-gray-700">
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Dashboard
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangleIcon className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">PDF data missing</p>
            <p className="text-xs text-gray-400 mt-1">Please re-upload this PDF from the dashboard</p>
            <button onClick={onBack} className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Build SVG overlay content ───
  const svgElements: React.ReactNode[] = []

  // Completed measurements
  for (const item of items) {
    const isActive = item.id === activeItemId
    for (const m of item.measurements) {
      if (m.pageKey !== pageKey) continue
      if (m.type === 'linear' && m.points.length === 2) {
        svgElements.push(
          <g key={m.id} opacity={isActive ? 1 : 0.6}>
            <SvgLine a={toScreen(m.points[0])} b={toScreen(m.points[1])} color={item.color} label={m.label} />
          </g>
        )
      } else if (m.type === 'area' && m.points.length >= 3) {
        svgElements.push(
          <g key={m.id} opacity={isActive ? 1 : 0.6}>
            <SvgPolygon points={m.points.map(toScreen)} color={item.color} label={m.label} />
          </g>
        )
      } else if (m.type === 'area' && m.points.length === 2) {
        const [a, b] = m.points
        svgElements.push(
          <g key={m.id} opacity={isActive ? 1 : 0.6}>
            <SvgPolygon
              points={[toScreen(a), toScreen({ x: b.x, y: a.y }), toScreen(b), toScreen({ x: a.x, y: b.y })]}
              color={item.color}
              label={m.label}
            />
          </g>
        )
      }
    }
  }

  // Completed markups
  for (const mk of markups) {
    if (mk.pageKey !== pageKey) continue
    if (mk.type === 'rect' && mk.points.length === 2) {
      const a = toScreen(mk.points[0])
      const b = toScreen(mk.points[1])
      svgElements.push(
        <rect key={mk.id} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
          fill="none" stroke={mk.color} strokeWidth={2} strokeDasharray="6 3" />
      )
    } else if (mk.type === 'arrow' && mk.points.length === 2) {
      svgElements.push(<SvgArrow key={mk.id} from={toScreen(mk.points[0])} to={toScreen(mk.points[1])} color={mk.color} />)
    } else if (mk.type === 'text' && mk.points.length === 1) {
      svgElements.push(<SvgTextLabel key={mk.id} pos={toScreen(mk.points[0])} text={mk.text || ''} color={mk.color} />)
    }
  }

  // In-progress: scale calibration
  if (activeTool === 'set-scale' && tempPoints.length >= 1) {
    const p0 = toScreen(tempPoints[0])
    const pulse = Math.sin(pulsePhase * 0.15) * 0.3 + 0.7
    const radius = 6 + pulse * 4
    svgElements.push(
      <g key="scale-progress">
        <circle cx={p0.x} cy={p0.y} r={radius} fill={`rgba(245, 158, 11, ${pulse})`} />
        <circle cx={p0.x} cy={p0.y} r={4} fill="#f59e0b" />
        {tempPoints.length === 1 && mousePos && (() => {
          const mp = toScreen(mousePos)
          return <line x1={p0.x} y1={p0.y} x2={mp.x} y2={mp.y} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" />
        })()}
        {tempPoints.length >= 2 && (() => {
          const p1 = toScreen(tempPoints[1])
          return <circle cx={p1.x} cy={p1.y} r={5} fill="#f59e0b" />
        })()}
      </g>
    )
  }

  // In-progress: linear
  if (activeTool === 'linear' && tempPoints.length === 1 && mousePos) {
    const activeItem = items.find(i => i.id === activeItemId)
    const color = activeItem?.color || '#3b82f6'
    svgElements.push(<SvgLine key="linear-progress" a={toScreen(tempPoints[0])} b={toScreen(mousePos)} color={color} label="" />)
  }

  // In-progress: polygon
  if (activeTool === 'area-polygon' && tempPoints.length >= 1) {
    const activeItem = items.find(i => i.id === activeItemId)
    const color = activeItem?.color || '#3b82f6'
    const pts = tempPoints.map(toScreen)
    const mp = mousePos ? toScreen(mousePos) : null
    svgElements.push(
      <g key="polygon-progress">
        <polyline
          points={[...pts, ...(mp ? [mp] : [])].map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={color} strokeWidth={2}
        />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={color} />)}
      </g>
    )
  }

  // Drag previews
  if (isDragging && dragStart && mousePos) {
    const activeItem = items.find(i => i.id === activeItemId)
    const color = activeItem?.color || '#3b82f6'
    const a = toScreen(dragStart)
    const b = toScreen(mousePos)
    if (activeTool === 'area-rect') {
      svgElements.push(
        <rect key="drag-area" x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
          fill={color + '20'} stroke={color} strokeWidth={2} />
      )
    } else if (activeTool === 'markup-rect') {
      svgElements.push(
        <rect key="drag-markup-rect" x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
          fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" />
      )
    } else if (activeTool === 'markup-arrow') {
      svgElements.push(<SvgArrow key="drag-markup-arrow" from={a} to={b} color="#f59e0b" />)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Back + Toolbar */}
      <div className="flex items-center bg-gray-900 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white text-xs font-medium transition-colors border-r border-gray-700">
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
            onZoomIn={() => setZoom(z => Math.min(z * 1.2, 5))}
            onZoomOut={() => setZoom(z => Math.max(z / 1.2, 0.5))}
            pageScale={scaleCalibrated ? { pageIndex: page.pageIndex, pixelsPerFoot: pageScale!, calibrated: true } : undefined}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            hidePagination
          />
        </div>
      </div>

      {/* Scale not set warning banner */}
      {!scaleCalibrated && activeTool !== 'set-scale' && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2 flex items-center gap-2 font-medium flex-shrink-0">
          <AlertTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
          Scale not set — click &apos;Set Scale&apos; in the toolbar before measuring
        </div>
      )}

      {/* Scale tool instruction banner */}
      {scaleBannerText && (
        <div className="bg-amber-100 text-amber-800 text-xs px-4 py-2 font-medium flex-shrink-0 border-b border-amber-200">
          {scaleBannerText}
        </div>
      )}

      {/* Warning banner */}
      {warning && (
        <div className="bg-red-500/90 text-white text-xs px-3 py-1.5 text-center font-medium flex-shrink-0">
          {warning}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Canvas area */}
        <div ref={containerRef} className="flex-1 relative bg-gray-100 overflow-hidden">
          <div
            ref={wrapperRef}
            className="absolute inset-0"
            style={{ touchAction: 'none' }}
          >
            {canvasW > 0 && (
              <div
                className="absolute"
                style={{
                  left: offsetX + panX,
                  top: offsetY + panY,
                  width: canvasW,
                  height: canvasH,
                }}
              >
                <canvas ref={canvasRef} className="block" />
                <svg
                  ref={svgRef}
                  width={canvasW}
                  height={canvasH}
                  className="absolute top-0 left-0"
                  style={{ cursor }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                >
                  {svgElements}
                </svg>
              </div>
            )}
          </div>

          {/* Markup text input */}
          {markupTextInput.visible && (
            <div
              className="absolute z-10"
              style={{
                left: markupTextInput.pos.x * renderScale + offsetX + panX,
                top: markupTextInput.pos.y * renderScale + offsetY + panY,
              }}
            >
              <input
                type="text"
                value={markupTextValue}
                onChange={e => setMarkupTextValue(e.target.value)}
                onKeyDown={e => {
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
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[420px]">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Set Scale</h3>
            <p className="text-sm text-gray-500 mb-5">What is the real-world distance between these two points?</p>
            <div className="flex items-center gap-2 mb-5">
              <input
                type="number"
                value={scaleInput}
                onChange={e => setScaleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScaleSubmit()}
                placeholder="Distance..."
                className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                autoFocus
                min="0"
                step="any"
              />
              <select
                value={scaleUnit}
                onChange={e => setScaleUnit(e.target.value as 'feet' | 'inches')}
                className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
              >
                <option value="inches">Inches</option>
                <option value="feet">Feet</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowScaleModal(false); setScalePoints([]); setTempPoints([]) }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleScaleSubmit}
                className="px-5 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 transition-colors"
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
