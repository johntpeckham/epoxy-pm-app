'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
import { exportSinglePage } from './takeoffExport'

// Lazy-loaded pdfjs-dist to avoid SSR DOMMatrix errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  }
  return pdfjsLib
}

export const ITEM_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#22c55e', // Green
  '#f97316', // Orange
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#eab308', // Yellow
  '#a16207', // Brown
  '#6b7280', // Gray
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

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function pointInPolygon(px: number, py: number, pts: Point[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function polyArea(pts: Point[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a) / 2
}

function polylineLen(pts: Point[]): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += ptDist(pts[i - 1], pts[i])
  }
  return total
}

// ─── Props ───

interface TakeoffViewerProps {
  page: TakeoffPage
  pageScale: number | undefined
  items: TakeoffItem[]
  markups: Markup[]
  isFullscreen: boolean
  pageRenderedSizes: Record<string, { w: number; h: number }>
  projectName: string
  onBack: () => void
  onPageScaleChange: (pixelsPerFoot: number) => void
  onItemsChange: (items: TakeoffItem[]) => void
  onMarkupsChange: (markups: Markup[]) => void
  onToggleFullscreen: () => void
  onCanvasSizeChange: (pageKey: string, size: { w: number; h: number }) => void
}

export default function TakeoffViewer({
  page,
  pageScale,
  items,
  markups,
  isFullscreen,
  pageRenderedSizes,
  projectName,
  onBack,
  onPageScaleChange,
  onItemsChange,
  onMarkupsChange,
  onToggleFullscreen,
  onCanvasSizeChange,
}: TakeoffViewerProps) {
  const pageKey = `${page.pdfIndex}-${page.pageIndex}`
  const scaleCalibrated = pageScale !== undefined

  // ─── Refs ───
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  // ─── PDF loaded state ───
  const [pdfLoaded, setPdfLoaded] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })

  // ─── Zoom (CSS-only, never re-render canvas) ───
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // ─── Pan ───
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const panXRef = useRef(0)
  const panYRef = useRef(0)
  useEffect(() => { panXRef.current = panX }, [panX])
  useEffect(() => { panYRef.current = panY }, [panY])

  // ─── Download state ───
  const [isDownloading, setIsDownloading] = useState(false)

  // ─── Drag tracking ───
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const panStartRef = useRef({ x: 0, y: 0 })

  // ─── RAF for batching pan updates ───
  const rafRef = useRef<number | null>(null)

  // ─── DPR ref ───
  const dprRef = useRef(1)

  // ─── Touch pinch start values ───
  const startDistRef = useRef(0)
  const startZoomRef = useRef(1)
  const startPanXRef = useRef(0)
  const startPanYRef = useRef(0)

  // ─── Tool state ───
  const [activeTool, setActiveTool] = useState<ToolMode>('pan')
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [tempPoints, setTempPoints] = useState<Point[]>([])
  const [mousePos, setMousePos] = useState<Point | null>(null)
  const [svgDragStart, setSvgDragStart] = useState<Point | null>(null)
  const [isSvgDragging, setIsSvgDragging] = useState(false)
  const activeToolRef = useRef<ToolMode>('pan')
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])

  // ─── Sidebar config-panel + click-arming state ───
  // isConfigPanelOpen: mirrors the sidebar's "+" form. When open, PDF clicks
  // are LOCKED unless the user has explicitly clicked "Start Measuring",
  // which sets isMeasuringActive=true.
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false)
  const [isMeasuringActive, setIsMeasuringActive] = useState(false)

  // ─── Scale calibration ───
  const [scalePoints, setScalePoints] = useState<Point[]>([])
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [scaleFeet, setScaleFeet] = useState('')
  const [scaleInches, setScaleInches] = useState('')

  // ─── Markup text ───
  const [markupTextInput, setMarkupTextInput] = useState<{ pos: Point; visible: boolean }>({
    pos: { x: 0, y: 0 }, visible: false,
  })
  const [markupTextValue, setMarkupTextValue] = useState('')

  // ─── Warning ───
  const [warning, setWarning] = useState<string | null>(null)

  // ─── Selection state (pan tool only) ───
  const [selectedSvgId, setSelectedSvgId] = useState<string | null>(null)
  const [selectedSvgType, setSelectedSvgType] = useState<'measurement' | 'markup' | null>(null)

  // ─── Pulse animation for scale point ───
  const [pulsePhase, setPulsePhase] = useState(0)
  useEffect(() => {
    if (activeTool !== 'set-scale' || scalePoints.length !== 1) return
    const id = setInterval(() => setPulsePhase(p => p + 1), 50)
    return () => clearInterval(id)
  }, [activeTool, scalePoints.length])

  // ─── Clamp pan so at least 100px of PDF stays visible ───
  const clampPan = useCallback((x: number, y: number, currentZoom: number) => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return { x, y }

    const containerW = container.clientWidth
    const containerH = container.clientHeight
    const scaledW = (canvas.width / dprRef.current) * currentZoom
    const scaledH = (canvas.height / dprRef.current) * currentZoom

    const margin = 100

    const minX = -(scaledW - margin)
    const maxX = containerW - margin
    const minY = -(scaledH - margin)
    const maxY = containerH - margin

    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    }
  }, [])

  // ─── Convert client coords to canvas-CSS-px (transient working space) ───
  const clientToPdf = useCallback((clientX: number, clientY: number): Point => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    return {
      x: (clientX - rect.left - panXRef.current) / zoomRef.current,
      y: (clientY - rect.top - panYRef.current) / zoomRef.current,
    }
  }, [])

  // ─── Coordinate-space conversion helpers ───
  // Stored points (m.points, mk.points) are NORMALIZED (0–1) relative to the
  // PDF intrinsic page. Transient points (tempPoints, scalePoints, mousePos,
  // svgDragStart, markupTextInput.pos) are in canvas-CSS-px at zoom=1 and are
  // converted at the storage boundary. canvasSize is the canvas CSS size of
  // the current render — different sessions may render the same PDF at
  // different canvas sizes, so we always convert through the normalized space.
  const canvasToNorm = useCallback(
    (p: Point): Point => ({
      x: canvasSize.w > 0 ? p.x / canvasSize.w : 0,
      y: canvasSize.h > 0 ? p.y / canvasSize.h : 0,
    }),
    [canvasSize.w, canvasSize.h]
  )
  const normToCanvas = useCallback(
    (p: Point): Point => ({
      x: p.x * canvasSize.w,
      y: p.y * canvasSize.h,
    }),
    [canvasSize.w, canvasSize.h]
  )

  // ─── Wheel zoom + touch pinch + touch pan — native events ───
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Measurement tools: don't pan/zoom from wheel (only ctrlKey zoom)
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05
        const newZoom = Math.min(Math.max(zoomRef.current * zoomFactor, 0.3), 5)

        const rawPanX = mouseX - (mouseX - panXRef.current) * (newZoom / zoomRef.current)
        const rawPanY = mouseY - (mouseY - panYRef.current) * (newZoom / zoomRef.current)
        const clamped = clampPan(rawPanX, rawPanY, newZoom)

        zoomRef.current = newZoom
        panXRef.current = clamped.x
        panYRef.current = clamped.y
        setZoom(newZoom)
        setPanX(clamped.x)
        setPanY(clamped.y)
      } else {
        // Two-finger scroll = pan — batch with rAF
        const rawX = panXRef.current - e.deltaX
        const rawY = panYRef.current - e.deltaY
        const clamped = clampPan(rawX, rawY, zoomRef.current)
        panXRef.current = clamped.x
        panYRef.current = clamped.y
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
            setPanX(panXRef.current)
            setPanY(panYRef.current)
            rafRef.current = null
          })
        }
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        startDistRef.current = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        )
        startZoomRef.current = zoomRef.current
        startPanXRef.current = panXRef.current
        startPanYRef.current = panYRef.current
        isDraggingRef.current = false
      } else if (e.touches.length === 1 && activeToolRef.current === 'pan') {
        isDraggingRef.current = true
        dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        panStartRef.current = { x: panXRef.current, y: panYRef.current }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left
        const midY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        )
        const newZoom = Math.min(Math.max(startZoomRef.current * (dist / startDistRef.current), 0.3), 5)

        const rawPanX = midX - (midX - startPanXRef.current) * (newZoom / startZoomRef.current)
        const rawPanY = midY - (midY - startPanYRef.current) * (newZoom / startZoomRef.current)
        const clamped = clampPan(rawPanX, rawPanY, newZoom)

        zoomRef.current = newZoom
        panXRef.current = clamped.x
        panYRef.current = clamped.y
        setZoom(newZoom)
        setPanX(clamped.x)
        setPanY(clamped.y)
      } else if (e.touches.length === 1 && isDraggingRef.current) {
        const dx = e.touches[0].clientX - dragStartRef.current.x
        const dy = e.touches[0].clientY - dragStartRef.current.y
        const clamped = clampPan(panStartRef.current.x + dx, panStartRef.current.y + dy, zoomRef.current)
        panXRef.current = clamped.x
        panYRef.current = clamped.y
        setPanX(clamped.x)
        setPanY(clamped.y)
      }
    }

    const onTouchEnd = () => {
      isDraggingRef.current = false
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [clampPan])

  // ─── Mouse drag to pan (pan tool only) ───
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseDown = (e: MouseEvent) => {
      if (activeToolRef.current !== 'pan') return
      isDraggingRef.current = true
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      panStartRef.current = { x: panXRef.current, y: panYRef.current }
      el.style.cursor = 'grabbing'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const clamped = clampPan(panStartRef.current.x + dx, panStartRef.current.y + dy, zoomRef.current)
      panXRef.current = clamped.x
      panYRef.current = clamped.y
      setPanX(clamped.x)
      setPanY(clamped.y)
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      el.style.cursor = ''
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [clampPan])

  // ─── Load and render PDF ONCE at fitScale with DPR ───
  useEffect(() => {
    if (!page.arrayBuffer) return
    let cancelled = false

    async function loadAndRender() {
      const pdfjs = await getPdfjs()
      const data = new Uint8Array(page.arrayBuffer!.slice(0))
      const doc = await pdfjs.getDocument({ data }).promise
      if (cancelled) return
      const pdfPage = await doc.getPage(page.pageIndex + 1)
      if (cancelled) return

      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      const rawVp = pdfPage.getViewport({ scale: 1 })
      const cw = container.clientWidth
      const ch = container.clientHeight
      const fitScale = Math.min(cw / rawVp.width, ch / rawVp.height) * 0.92

      // DPR floor of 2 ensures retina-class crispness even on 1x displays,
      // and an additional quality multiplier oversamples beyond fit-scale so
      // that CSS zoom-up (transform: scale) stays sharp without re-rendering.
      const baseDpr = window.devicePixelRatio || 1
      const RENDER_QUALITY_MULTIPLIER = 2
      const dpr = Math.max(baseDpr, 2) * RENDER_QUALITY_MULTIPLIER
      dprRef.current = dpr
      const viewport = pdfPage.getViewport({ scale: fitScale * dpr })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const cssW = viewport.width / dpr
      const cssH = viewport.height / dpr
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise

      if (cancelled) return
      setCanvasSize({ w: cssW, h: cssH })
      onCanvasSizeChange(pageKey, { w: cssW, h: cssH })
      setZoom(1)
      zoomRef.current = 1
      setPanX(0)
      setPanY(0)
      panXRef.current = 0
      panYRef.current = 0
      setPdfLoaded(true)
    }

    loadAndRender()
    return () => { cancelled = true }
  }, [page.arrayBuffer, page.pageIndex])

  // ─── Complete linear polyline ───
  // Stored points are normalized 0–1 (PDF-page-relative). Lengths are computed
  // in canvas-CSS-px and divided by the live pixels-per-foot derived from the
  // normalized pageScale.
  const completeLinearRef = useRef<() => void>(() => {})
  completeLinearRef.current = () => {
    if (activeTool !== 'linear' || tempPoints.length < 2) return
    if (pageScale === undefined || !activeItemId || canvasSize.w === 0) return
    const ppf = pageScale * canvasSize.w
    if (ppf <= 0) return
    const d = polylineLen(tempPoints) / ppf
    addMeasurement({ id: genId(), type: 'linear', points: tempPoints.map(canvasToNorm), valueInFeet: d, perimeterFt: 0, label: fmtFtIn(d), pageKey })
    setTempPoints([])
    // Stay armed — the lock boundary is the "+" button (new item), not
    // Enter (single shape complete). User can immediately draw the next
    // shape under the same item.
  }

  // ─── Complete area polygon ───
  const completeAreaRef = useRef<() => void>(() => {})
  completeAreaRef.current = () => {
    if (activeTool !== 'area-polygon' || tempPoints.length < 3) return
    if (pageScale === undefined || !activeItemId || canvasSize.w === 0) return
    const ppf = pageScale * canvasSize.w
    if (ppf <= 0) return
    const area = polyArea(tempPoints) / (ppf * ppf)
    const perimPx = polylineLen(tempPoints) + ptDist(tempPoints[tempPoints.length - 1], tempPoints[0])
    const perimFt = perimPx / ppf
    addMeasurement({ id: genId(), type: 'area', points: tempPoints.map(canvasToNorm), valueInFeet: area, perimeterFt: perimFt, label: `${area.toFixed(1)} sq ft`, pageKey })
    setTempPoints([])
    // Stay armed — see completeLinearRef for rationale.
  }

  // ─── Delete selected item ref (to avoid stale closures) ───
  const deleteSelectedRef = useRef<() => void>(() => {})
  deleteSelectedRef.current = () => {
    if (!selectedSvgId || !selectedSvgType) return
    if (selectedSvgType === 'measurement') {
      onItemsChange(items.map(it => ({
        ...it,
        measurements: it.measurements.filter(m => m.id !== selectedSvgId),
      })))
    } else if (selectedSvgType === 'markup') {
      onMarkupsChange(markups.filter(mk => mk.id !== selectedSvgId))
    }
    setSelectedSvgId(null)
    setSelectedSvgType(null)
  }

  // ─── Keyboard ───
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Special case: config panel open AND points already placed →
        // discard in-progress points and disarm, but KEEP the panel open
        // (form state preserved in the sidebar). User can click
        // "Start Measuring" again to retry.
        if (isConfigPanelOpen && tempPoints.length > 0) {
          setTempPoints([])
          setIsMeasuringActive(false)
          return
        }
        // Config panel open with no points → do nothing (user must click
        // Cancel to close the panel).
        if (isConfigPanelOpen) {
          return
        }
        setTempPoints([])
        setScalePoints([])
        setSvgDragStart(null)
        setIsSvgDragging(false)
        setSelectedSvgId(null)
        setSelectedSvgType(null)
        if (showScaleModal) setShowScaleModal(false)
        if (markupTextInput.visible) setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false })
      }
      if (e.key === 'Enter') {
        completeLinearRef.current()
        completeAreaRef.current()
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedRef.current()
      }
      // Cmd+Z / Ctrl+Z → undo. Skip if focus is in a form field so native
      // text undo still works inside the sidebar inputs and modal inputs.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName
        const isEditable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target?.isContentEditable === true
        if (isEditable) return
        e.preventDefault()
        handleUndoRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showScaleModal, markupTextInput.visible, isConfigPanelOpen, tempPoints.length])

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
    if (activeTool === 'area-polygon' && item.type !== 'area') {
      setWarning('Active item is linear type. Select an area item.')
      setTimeout(() => setWarning(null), 3000)
      return false
    }
    return true
  }

  // ─── SVG event handlers (measurement interactions) ───

  function handleSvgMouseDown(e: React.MouseEvent) {
    if (activeTool === 'pan') return // pan handled by native mouse handler
    e.stopPropagation()
    const pt = clientToPdf(e.clientX, e.clientY)
    if (activeTool === 'markup-rect' || activeTool === 'markup-arrow') {
      setSvgDragStart(pt)
      setIsSvgDragging(true)
    }
  }

  function handleSvgMouseMove(e: React.MouseEvent) {
    if (activeTool === 'pan') return
    setMousePos(clientToPdf(e.clientX, e.clientY))
  }

  function handleSvgMouseUp(e: React.MouseEvent) {
    if (activeTool === 'pan') return
    const pt = clientToPdf(e.clientX, e.clientY)
    if (isSvgDragging && svgDragStart) {
      setIsSvgDragging(false)
      if (activeTool === 'markup-rect') {
        onMarkupsChange([...markups, { id: genId(), type: 'rect', points: [canvasToNorm(svgDragStart), canvasToNorm(pt)], color: '#f59e0b', pageKey }])
      } else if (activeTool === 'markup-arrow') {
        onMarkupsChange([...markups, { id: genId(), type: 'arrow', points: [canvasToNorm(svgDragStart), canvasToNorm(pt)], color: '#f59e0b', pageKey }])
      }
      setSvgDragStart(null)
    }
  }

  function handleSvgClick(e: React.MouseEvent) {
    if (activeTool === 'pan') {
      // Hit-test for selection
      e.stopPropagation()
      const pt = clientToPdf(e.clientX, e.clientY)
      const hitTol = 8 / zoom // 8 screen px tolerance in PDF space

      // Check measurements — convert stored normalized points to canvas-CSS-px
      // before comparing with `pt` (which is in canvas-CSS-px).
      for (const item of items) {
        for (const m of item.measurements) {
          if (m.pageKey !== pageKey) continue
          const cpts = m.points.map(normToCanvas)
          if (m.type === 'linear' && cpts.length >= 2) {
            for (let si = 1; si < cpts.length; si++) {
              if (distToSegment(pt.x, pt.y, cpts[si - 1].x, cpts[si - 1].y, cpts[si].x, cpts[si].y) < hitTol) {
                setSelectedSvgId(m.id)
                setSelectedSvgType('measurement')
                return
              }
            }
          } else if (m.type === 'area' && cpts.length >= 3) {
            if (pointInPolygon(pt.x, pt.y, cpts)) {
              setSelectedSvgId(m.id)
              setSelectedSvgType('measurement')
              return
            }
            for (let si = 0; si < cpts.length; si++) {
              const next = (si + 1) % cpts.length
              if (distToSegment(pt.x, pt.y, cpts[si].x, cpts[si].y, cpts[next].x, cpts[next].y) < hitTol) {
                setSelectedSvgId(m.id)
                setSelectedSvgType('measurement')
                return
              }
            }
          } else if (m.type === 'area' && cpts.length === 2) {
            const [a, b] = cpts
            const minX = Math.min(a.x, b.x) - hitTol
            const maxX = Math.max(a.x, b.x) + hitTol
            const minY = Math.min(a.y, b.y) - hitTol
            const maxY = Math.max(a.y, b.y) + hitTol
            if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
              setSelectedSvgId(m.id)
              setSelectedSvgType('measurement')
              return
            }
          }
        }
      }

      // Check markups — same conversion
      for (const mk of markups) {
        if (mk.pageKey !== pageKey) continue
        const cpts = mk.points.map(normToCanvas)
        if (mk.type === 'rect' && cpts.length === 2) {
          const [a, b] = cpts
          const minX = Math.min(a.x, b.x) - hitTol
          const maxX = Math.max(a.x, b.x) + hitTol
          const minY = Math.min(a.y, b.y) - hitTol
          const maxY = Math.max(a.y, b.y) + hitTol
          if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
            setSelectedSvgId(mk.id)
            setSelectedSvgType('markup')
            return
          }
        } else if (mk.type === 'arrow' && cpts.length === 2) {
          if (distToSegment(pt.x, pt.y, cpts[0].x, cpts[0].y, cpts[1].x, cpts[1].y) < hitTol) {
            setSelectedSvgId(mk.id)
            setSelectedSvgType('markup')
            return
          }
        } else if (mk.type === 'text' && cpts.length === 1) {
          const pos = cpts[0]
          const text = mk.text || ''
          const w = text.length * 8 + 12
          const h = 22
          if (pt.x >= pos.x - hitTol && pt.x <= pos.x + w + hitTol &&
              pt.y >= pos.y - 16 - hitTol && pt.y <= pos.y - 16 + h + hitTol) {
            setSelectedSvgId(mk.id)
            setSelectedSvgType('markup')
            return
          }
        }
      }

      // Clicked empty space — deselect
      setSelectedSvgId(null)
      setSelectedSvgType(null)
      return
    }
    if (activeTool === 'markup-rect' || activeTool === 'markup-arrow') return
    e.stopPropagation()
    const pt = clientToPdf(e.clientX, e.clientY)

    if (activeTool === 'set-scale') {
      const newPts = [...scalePoints, pt]
      setScalePoints(newPts)
      setTempPoints(newPts)
      if (newPts.length === 2) setShowScaleModal(true)
      return
    }
    if (activeTool === 'linear') {
      if (!checkPrereqs()) return
      // Click placement is locked until the user explicitly clicks
      // "Start Measuring" in the sidebar config panel.
      if (!isMeasuringActive) return
      setTempPoints(p => [...p, pt])
      return
    }
    if (activeTool === 'area-polygon') {
      if (!checkPrereqs()) return
      if (!isMeasuringActive) return
      // Snap to first point — close polygon if clicking within 10 screen px
      if (tempPoints.length >= 3) {
        const screenDist = ptDist(pt, tempPoints[0]) * zoomRef.current
        if (screenDist < 10) {
          completeAreaRef.current()
          return
        }
      }
      setTempPoints(p => [...p, pt])
      return
    }
    if (activeTool === 'markup-text') {
      setMarkupTextInput({ pos: pt, visible: true })
      setMarkupTextValue('')
    }
  }

  function handleSvgDoubleClick() {
    if (activeTool === 'linear' && tempPoints.length >= 2) {
      completeLinearRef.current()
      return
    }
    if (activeTool === 'area-polygon' && tempPoints.length >= 3) {
      completeAreaRef.current()
    }
  }

  // ─── Scale modal ───
  // Emits a normalized "units-per-foot" value: canvas-px-per-foot divided by
  // the canvas CSS width. Stored this way so calibration survives canvas
  // resizes between sessions.
  function handleScaleSubmit() {
    const ft = Number(scaleFeet) || 0
    const inches = Number(scaleInches) || 0
    if (ft === 0 && inches === 0) return
    const realFt = ft + inches / 12
    if (realFt <= 0 || canvasSize.w === 0) return
    const pxDist = ptDist(scalePoints[0], scalePoints[1])
    const pxPerFt = pxDist / realFt
    onPageScaleChange(pxPerFt / canvasSize.w)
    setShowScaleModal(false)
    setScalePoints([])
    setTempPoints([])
    setScaleFeet('')
    setScaleInches('')
    setActiveTool('pan')
  }

  function addMeasurement(m: Measurement) {
    onItemsChange(items.map(it => it.id === activeItemId ? { ...it, measurements: [...it.measurements, m] } : it))
  }

  // ─── Item management ───
  // Tracks the item created during the current "+" panel session so that
  // repeated "Start Measuring" clicks within the same session (e.g. after
  // Escape clears in-progress points) re-arm placement instead of
  // re-creating the item. State (not just a ref) so the sidebar can
  // exclude the in-progress item from the saved list and render its live
  // tally inline in the panel.
  const [panelSessionItemId, setPanelSessionItemId] = useState<string | null>(null)

  function handleAddItem(name: string, type: MeasurementType, color?: string) {
    if (panelSessionItemId) {
      // Already created the item this session — just re-arm placement.
      const existing = items.find((it) => it.id === panelSessionItemId)
      if (existing) {
        setActiveItemId(existing.id)
        setActiveTool(existing.type === 'linear' ? 'linear' : 'area-polygon')
        setTempPoints([])
        setIsMeasuringActive(true)
        return
      }
    }
    const newItem: TakeoffItem = { id: genId(), name, type, measurements: [], color: color || getNextColor() }
    onItemsChange([...items, newItem])
    setActiveItemId(newItem.id)
    setActiveTool(type === 'linear' ? 'linear' : 'area-polygon')
    setTempPoints([])
    setIsMeasuringActive(true)
    setPanelSessionItemId(newItem.id)
  }

  function handleChangeItemColor(id: string, color: string) {
    onItemsChange(items.map(i => (i.id === id ? { ...i, color } : i)))
  }

  async function handleDownloadPage() {
    setIsDownloading(true)
    try {
      const storedSize = pageRenderedSizes[pageKey] || (canvasSize.w > 0 ? canvasSize : undefined)
      await exportSinglePage(page, items, pageKey, storedSize, projectName)
    } catch (err) {
      console.error('Failed to export page:', err)
    } finally {
      setIsDownloading(false)
    }
  }

  // ─── Undo ───
  // Walks back one step at a time. If in-progress points exist, the last
  // point is removed. Otherwise, the most recent completed measurement on
  // this page is removed. (Page-scoped so undo doesn't reach across pages.)
  // Persistence is handled by TakeoffClient's debounced autosave on every
  // items mutation — no explicit DB delete needed.
  function findMostRecentMeasurement(): { itemIndex: number; measurementIndex: number } | null {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      for (let j = it.measurements.length - 1; j >= 0; j--) {
        if (it.measurements[j].pageKey === pageKey) {
          return { itemIndex: i, measurementIndex: j }
        }
      }
    }
    return null
  }

  const canUndo =
    tempPoints.length > 0 || findMostRecentMeasurement() !== null

  const handleUndoRef = useRef<() => void>(() => {})
  handleUndoRef.current = () => {
    if (tempPoints.length > 0) {
      const next = tempPoints.slice(0, -1)
      setTempPoints(next)
      // Single-point case: removing it leaves the measurement empty but
      // armed; the user can re-place. Matches Escape-with-1-point semantics
      // except that the panel doesn't have to be open here.
      return
    }
    const target = findMostRecentMeasurement()
    if (!target) return
    const next = items.map((it, i) =>
      i === target.itemIndex
        ? {
            ...it,
            measurements: it.measurements.filter(
              (_, j) => j !== target.measurementIndex
            ),
          }
        : it
    )
    onItemsChange(next)
  }

  function handleSelectItem(id: string) {
    setActiveItemId(id)
    const item = items.find(i => i.id === id)
    if (item) {
      setActiveTool(item.type === 'linear' ? 'linear' : 'area-polygon')
      setTempPoints([])
      // Selecting an existing item from the sidebar list arms placement
      // immediately (no "+" panel involved).
      setIsMeasuringActive(true)
    }
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
    onMarkupsChange([...markups, { id: genId(), type: 'text', points: [canvasToNorm(markupTextInput.pos)], text: markupTextValue.trim(), color: '#f59e0b', pageKey }])
    setMarkupTextInput({ pos: { x: 0, y: 0 }, visible: false })
    setMarkupTextValue('')
  }

  function handleToolChange(tool: ToolMode) {
    setActiveTool(tool)
    setTempPoints([])
    setScalePoints([])
    setSvgDragStart(null)
    setIsSvgDragging(false)
    setSelectedSvgId(null)
    setSelectedSvgType(null)
  }

  // ─── Zoom buttons ───
  function zoomIn() { setZoom(z => Math.min(z * 1.2, 5)) }
  function zoomOut() { setZoom(z => Math.max(z / 1.2, 0.3)) }

  // ─── Scale banner text ───
  function getScaleBannerText(): string | null {
    if (activeTool !== 'set-scale') return null
    if (scalePoints.length === 0) return 'Click two points on the plan that represent a known distance'
    if (scalePoints.length === 1) return 'First point set — now click the second point'
    return null
  }
  const scaleBannerText = getScaleBannerText()

  // ─── Cursor ───
  const cursor = activeTool === 'pan'
    ? 'grab'
    : activeTool === 'markup-text' ? 'text' : 'crosshair'

  // ─── No PDF data ───
  if (!page.arrayBuffer) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center bg-gray-900 flex-shrink-0">
          <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white text-xs font-medium transition-colors border-r border-gray-700">
            <ArrowLeftIcon className="w-4 h-4" />
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

  // ─── Helper: convert PDF point to SVG coords (divide sizes by zoom for constant visual size) ───
  function toSvg(p: Point): Point {
    return { x: p.x, y: p.y }
  }

  // ─── Build SVG overlay content ───
  const svgElements: React.ReactNode[] = []
  const sw = 2 / zoom // constant stroke width
  const fs = 12 / zoom // constant font size
  const cr = 4 / zoom  // constant circle radius

  // Completed measurements
  for (const item of items) {
    const isActive = item.id === activeItemId
    for (const m of item.measurements) {
      if (m.pageKey !== pageKey) continue
      if (m.type === 'linear' && m.points.length >= 2) {
        const pts = m.points.map(normToCanvas)
        // Midpoint of the entire path for label placement
        const totalLen = polylineLen(pts)
        let midPt = pts[0]
        if (totalLen > 0) {
          const halfLen = totalLen / 2
          let accum = 0
          for (let si = 1; si < pts.length; si++) {
            const segLen = ptDist(pts[si - 1], pts[si])
            if (accum + segLen >= halfLen) {
              const t = (halfLen - accum) / segLen
              midPt = { x: pts[si - 1].x + (pts[si].x - pts[si - 1].x) * t, y: pts[si - 1].y + (pts[si].y - pts[si - 1].y) * t }
              break
            }
            accum += segLen
          }
        }
        const labelW = m.label ? (m.label.length * 7 + 10) / zoom : 0
        const labelH = 18 / zoom
        svgElements.push(
          <g key={m.id} opacity={isActive ? 1 : 0.6}>
            <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={item.color} strokeWidth={sw} />
            {pts.map((p, pi) => <circle key={pi} cx={p.x} cy={p.y} r={cr} fill={item.color} />)}
            {m.label && (
              <>
                <rect x={midPt.x - labelW / 2} y={midPt.y - labelH / 2} width={labelW} height={labelH} rx={3 / zoom} fill="rgba(0,0,0,0.75)" />
                <text x={midPt.x} y={midPt.y} fill="white" fontSize={fs} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">{m.label}</text>
              </>
            )}
          </g>
        )
      } else if (m.type === 'area' && m.points.length >= 3) {
        const pts = m.points.map(normToCanvas)
        const center = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
        const areaLine = m.label || ''
        const perimLine = m.perimeterFt ? `Perim: ${fmtFtIn(m.perimeterFt)}` : ''
        const showPerim = !!perimLine
        const longestLine = areaLine.length > perimLine.length ? areaLine : perimLine
        const labelW = longestLine ? (longestLine.length * 7 + 10) / zoom : 0
        const labelH = (showPerim ? 32 : 18) / zoom
        svgElements.push(
          <g key={m.id} opacity={isActive ? 1 : 0.6}>
            <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill={item.color + '26'} stroke={item.color} strokeWidth={sw} />
            {areaLine && (
              <>
                <rect x={center.x - labelW / 2} y={center.y - labelH / 2} width={labelW} height={labelH} rx={3 / zoom} fill="rgba(0,0,0,0.75)" />
                <text x={center.x} y={center.y + (showPerim ? -6 / zoom : 0)} fill="white" fontSize={fs} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">{areaLine}</text>
                {showPerim && (
                  <text x={center.x} y={center.y + 8 / zoom} fill="#d1d5db" fontSize={10 / zoom} fontWeight="600" textAnchor="middle" dominantBaseline="middle">{perimLine}</text>
                )}
              </>
            )}
          </g>
        )
      } else if (m.type === 'area' && m.points.length === 2) {
        // Legacy: 2-point rect area from old drag tool
        const [a, b] = m.points.map(normToCanvas)
        const pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const labelW = m.label ? (m.label.length * 7 + 10) / zoom : 0
        const labelH = 18 / zoom
        svgElements.push(
          <g key={m.id} opacity={isActive ? 1 : 0.6}>
            <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill={item.color + '26'} stroke={item.color} strokeWidth={sw} />
            {m.label && (
              <>
                <rect x={center.x - labelW / 2} y={center.y - labelH / 2} width={labelW} height={labelH} rx={3 / zoom} fill="rgba(0,0,0,0.75)" />
                <text x={center.x} y={center.y} fill="white" fontSize={fs} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">{m.label}</text>
              </>
            )}
          </g>
        )
      }
    }
  }

  // Completed markups
  for (const mk of markups) {
    if (mk.pageKey !== pageKey) continue
    if (mk.type === 'rect' && mk.points.length === 2) {
      const a = normToCanvas(mk.points[0])
      const b = normToCanvas(mk.points[1])
      svgElements.push(
        <rect key={mk.id} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
          fill="none" stroke={mk.color} strokeWidth={sw} strokeDasharray={`${6 / zoom} ${3 / zoom}`} />
      )
    } else if (mk.type === 'arrow' && mk.points.length === 2) {
      const from = normToCanvas(mk.points[0])
      const to = normToCanvas(mk.points[1])
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      const hl = 12 / zoom
      const p1 = { x: to.x - hl * Math.cos(angle - Math.PI / 6), y: to.y - hl * Math.sin(angle - Math.PI / 6) }
      const p2 = { x: to.x - hl * Math.cos(angle + Math.PI / 6), y: to.y - hl * Math.sin(angle + Math.PI / 6) }
      svgElements.push(
        <g key={mk.id}>
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={mk.color} strokeWidth={sw} />
          <polygon points={`${to.x},${to.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={mk.color} />
        </g>
      )
    } else if (mk.type === 'text' && mk.points.length === 1) {
      const pos = normToCanvas(mk.points[0])
      const text = mk.text || ''
      const w = (text.length * 8 + 12) / zoom
      const h = 22 / zoom
      svgElements.push(
        <g key={mk.id}>
          <rect x={pos.x - 2 / zoom} y={pos.y - 16 / zoom} width={w} height={h} rx={2 / zoom} fill="rgba(255,255,255,0.85)" />
          <text x={pos.x + 4 / zoom} y={pos.y - 5 / zoom} fill={mk.color} fontSize={14 / zoom} fontWeight="bold" dominantBaseline="middle">{text}</text>
        </g>
      )
    }
  }

  // ─── Selection highlight + delete button ───
  if (selectedSvgId && selectedSvgType === 'measurement') {
    for (const item of items) {
      const m = item.measurements.find(mm => mm.id === selectedSvgId && mm.pageKey === pageKey)
      if (!m) continue
      const selSw = 3 / zoom
      const dashArr = `${6 / zoom} ${4 / zoom}`
      if (m.type === 'linear' && m.points.length >= 2) {
        const pts = m.points.map(normToCanvas)
        const topPt = pts.reduce((best, p) => p.y < best.y ? p : best, pts[0])
        svgElements.push(
          <g key="sel-highlight">
            <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#3b82f6" strokeWidth={selSw} strokeDasharray={dashArr} />
          </g>
        )
        svgElements.push(
          <g key="sel-delete" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); deleteSelectedRef.current() }}>
            <circle cx={topPt.x + 12 / zoom} cy={topPt.y - 12 / zoom} r={10 / zoom} fill="#ef4444" />
            <text x={topPt.x + 12 / zoom} y={topPt.y - 12 / zoom} fill="white" fontSize={14 / zoom} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">×</text>
          </g>
        )
      } else if (m.type === 'area' && m.points.length >= 3) {
        const pts = m.points.map(normToCanvas)
        const topPt = pts.reduce((best, p) => p.y < best.y ? p : best, pts[0])
        svgElements.push(
          <g key="sel-highlight">
            <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#3b82f6" strokeWidth={selSw} strokeDasharray={dashArr} />
          </g>
        )
        svgElements.push(
          <g key="sel-delete" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); deleteSelectedRef.current() }}>
            <circle cx={topPt.x + 12 / zoom} cy={topPt.y - 12 / zoom} r={10 / zoom} fill="#ef4444" />
            <text x={topPt.x + 12 / zoom} y={topPt.y - 12 / zoom} fill="white" fontSize={14 / zoom} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">×</text>
          </g>
        )
      } else if (m.type === 'area' && m.points.length === 2) {
        const [a, b] = m.points.map(normToCanvas)
        const pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
        const topPt = pts.reduce((best, p) => p.y < best.y ? p : best, pts[0])
        svgElements.push(
          <g key="sel-highlight">
            <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#3b82f6" strokeWidth={selSw} strokeDasharray={dashArr} />
          </g>
        )
        svgElements.push(
          <g key="sel-delete" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); deleteSelectedRef.current() }}>
            <circle cx={topPt.x + 12 / zoom} cy={topPt.y - 12 / zoom} r={10 / zoom} fill="#ef4444" />
            <text x={topPt.x + 12 / zoom} y={topPt.y - 12 / zoom} fill="white" fontSize={14 / zoom} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">×</text>
          </g>
        )
      }
      break
    }
  } else if (selectedSvgId && selectedSvgType === 'markup') {
    const mk = markups.find(m => m.id === selectedSvgId && m.pageKey === pageKey)
    if (mk) {
      const selSw = 3 / zoom
      const dashArr = `${6 / zoom} ${4 / zoom}`
      if (mk.type === 'rect' && mk.points.length === 2) {
        const a = normToCanvas(mk.points[0])
        const b = normToCanvas(mk.points[1])
        const topX = Math.max(a.x, b.x)
        const topY = Math.min(a.y, b.y)
        svgElements.push(
          <g key="sel-highlight">
            <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)}
              width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
              fill="none" stroke="#3b82f6" strokeWidth={selSw} strokeDasharray={dashArr} />
          </g>
        )
        svgElements.push(
          <g key="sel-delete" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); deleteSelectedRef.current() }}>
            <circle cx={topX + 12 / zoom} cy={topY - 12 / zoom} r={10 / zoom} fill="#ef4444" />
            <text x={topX + 12 / zoom} y={topY - 12 / zoom} fill="white" fontSize={14 / zoom} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">×</text>
          </g>
        )
      } else if (mk.type === 'arrow' && mk.points.length === 2) {
        const from = normToCanvas(mk.points[0])
        const to = normToCanvas(mk.points[1])
        const topPt = from.y < to.y ? from : to
        svgElements.push(
          <g key="sel-highlight">
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#3b82f6" strokeWidth={selSw} strokeDasharray={dashArr} />
          </g>
        )
        svgElements.push(
          <g key="sel-delete" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); deleteSelectedRef.current() }}>
            <circle cx={topPt.x + 12 / zoom} cy={topPt.y - 12 / zoom} r={10 / zoom} fill="#ef4444" />
            <text x={topPt.x + 12 / zoom} y={topPt.y - 12 / zoom} fill="white" fontSize={14 / zoom} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">×</text>
          </g>
        )
      } else if (mk.type === 'text' && mk.points.length === 1) {
        const pos = normToCanvas(mk.points[0])
        const text = mk.text || ''
        const w = (text.length * 8 + 12) / zoom
        const h = 22 / zoom
        svgElements.push(
          <g key="sel-highlight">
            <rect x={pos.x - 2 / zoom} y={pos.y - 16 / zoom} width={w} height={h} fill="none" stroke="#3b82f6" strokeWidth={selSw} strokeDasharray={dashArr} />
          </g>
        )
        svgElements.push(
          <g key="sel-delete" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); deleteSelectedRef.current() }}>
            <circle cx={pos.x + w + 6 / zoom} cy={pos.y - 16 / zoom} r={10 / zoom} fill="#ef4444" />
            <text x={pos.x + w + 6 / zoom} y={pos.y - 16 / zoom} fill="white" fontSize={14 / zoom} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">×</text>
          </g>
        )
      }
    }
  }

  // In-progress: scale calibration
  if (activeTool === 'set-scale' && tempPoints.length >= 1) {
    const p0 = toSvg(tempPoints[0])
    const pulse = Math.sin(pulsePhase * 0.15) * 0.3 + 0.7
    const radius = (6 + pulse * 4) / zoom
    svgElements.push(
      <g key="scale-progress">
        <circle cx={p0.x} cy={p0.y} r={radius} fill={`rgba(245, 158, 11, ${pulse})`} />
        <circle cx={p0.x} cy={p0.y} r={cr} fill="#f59e0b" />
        {tempPoints.length === 1 && mousePos && (() => {
          const mp = toSvg(mousePos)
          return <line x1={p0.x} y1={p0.y} x2={mp.x} y2={mp.y} stroke="#f59e0b" strokeWidth={sw} strokeDasharray={`${4 / zoom} ${4 / zoom}`} />
        })()}
        {tempPoints.length >= 2 && (() => {
          const p1 = toSvg(tempPoints[1])
          return <circle cx={p1.x} cy={p1.y} r={5 / zoom} fill="#f59e0b" />
        })()}
      </g>
    )
  }

  // In-progress: linear polyline
  if (activeTool === 'linear' && tempPoints.length >= 1) {
    const activeItem = items.find(i => i.id === activeItemId)
    const color = activeItem?.color || '#3b82f6'
    const pts = tempPoints.map(toSvg)
    const mp = mousePos ? toSvg(mousePos) : null
    // Running total including live segment
    const placedLen = polylineLen(pts)
    const liveLen = mp && pts.length > 0 ? ptDist(pts[pts.length - 1], mp) : 0
    const totalPx = placedLen + liveLen
    const ppf = pageScale && canvasSize.w > 0 ? pageScale * canvasSize.w : 1
    const totalFt = totalPx / ppf
    svgElements.push(
      <g key="linear-progress">
        {/* Placed segments — solid */}
        {pts.length >= 2 && (
          <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={sw} />
        )}
        {/* Live preview segment — dashed */}
        {mp && pts.length > 0 && (
          <line x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={mp.x} y2={mp.y}
            stroke={color} strokeWidth={sw} opacity={0.6} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />
        )}
        {/* Point dots */}
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={cr} fill={color} />)}
        {mp && <circle cx={mp.x} cy={mp.y} r={cr} fill={color} opacity={0.6} />}
        {/* Running total near cursor */}
        {mp && scaleCalibrated && (() => {
          const label = `Total: ${fmtFtIn(totalFt)}`
          const lw = (label.length * 7 + 10) / zoom
          const lh = 18 / zoom
          const ox = 12 / zoom
          const oy = -12 / zoom
          return (
            <>
              <rect x={mp.x + ox} y={mp.y + oy - lh / 2} width={lw} height={lh} rx={3 / zoom} fill="rgba(0,0,0,0.8)" />
              <text x={mp.x + ox + lw / 2} y={mp.y + oy} fill="white" fontSize={fs} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">{label}</text>
            </>
          )
        })()}
      </g>
    )
  }

  // In-progress: area polygon
  if (activeTool === 'area-polygon' && tempPoints.length >= 1) {
    const activeItem = items.find(i => i.id === activeItemId)
    const color = activeItem?.color || '#3b82f6'
    const pts = tempPoints.map(toSvg)
    const mp = mousePos ? toSvg(mousePos) : null
    // Preview polygon fill (with cursor as temporary closing point)
    const previewPts = [...pts, ...(mp ? [mp] : [])]
    // Running area estimate
    const ppf = pageScale && canvasSize.w > 0 ? pageScale * canvasSize.w : 1
    const liveArea = previewPts.length >= 3 ? polyArea(previewPts) / (ppf * ppf) : 0
    const livePerimPx = previewPts.length >= 2 ? polylineLen(previewPts) + ptDist(previewPts[previewPts.length - 1], previewPts[0]) : 0
    const livePerimFt = livePerimPx / ppf
    svgElements.push(
      <g key="polygon-progress">
        {/* Faint fill preview */}
        {previewPts.length >= 3 && (
          <polygon points={previewPts.map(p => `${p.x},${p.y}`).join(' ')} fill={color + '15'} stroke="none" />
        )}
        {/* Placed segments — solid */}
        {pts.length >= 2 && (
          <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={sw} />
        )}
        {/* Live preview segment (last point to cursor) — dashed, 60% */}
        {mp && pts.length > 0 && (
          <line x1={pts[pts.length - 1].x} y1={pts[pts.length - 1].y} x2={mp.x} y2={mp.y}
            stroke={color} strokeWidth={sw} opacity={0.6} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />
        )}
        {/* Closing preview line (cursor back to first point) — dashed, 30% */}
        {mp && pts.length >= 2 && (
          <line x1={mp.x} y1={mp.y} x2={pts[0].x} y2={pts[0].y}
            stroke={color} strokeWidth={sw} opacity={0.3} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />
        )}
        {/* Point dots — first point larger */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? (6 / zoom) : cr} fill={color}
            stroke={i === 0 ? 'white' : 'none'} strokeWidth={i === 0 ? sw : 0} />
        ))}
        {mp && <circle cx={mp.x} cy={mp.y} r={cr} fill={color} opacity={0.6} />}
        {/* Running area estimate near cursor */}
        {mp && scaleCalibrated && liveArea > 0 && (() => {
          const areaLabel = `~${liveArea.toFixed(1)} sq ft`
          const perimLabel = `~${fmtFtIn(livePerimFt)} perim.`
          const longestLabel = areaLabel.length > perimLabel.length ? areaLabel : perimLabel
          const lw = (longestLabel.length * 7 + 10) / zoom
          const lh = 32 / zoom
          const ox = 12 / zoom
          const oy = -18 / zoom
          return (
            <>
              <rect x={mp.x + ox} y={mp.y + oy - lh / 2} width={lw} height={lh} rx={3 / zoom} fill="rgba(0,0,0,0.8)" />
              <text x={mp.x + ox + lw / 2} y={mp.y + oy - 6 / zoom} fill="white" fontSize={fs} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">{areaLabel}</text>
              <text x={mp.x + ox + lw / 2} y={mp.y + oy + 8 / zoom} fill="#d1d5db" fontSize={10 / zoom} fontWeight="600" textAnchor="middle" dominantBaseline="middle">{perimLabel}</text>
            </>
          )
        })()}
      </g>
    )
  }

  // Drag previews (markups only)
  if (isSvgDragging && svgDragStart && mousePos) {
    const a = toSvg(svgDragStart)
    const b = toSvg(mousePos)
    if (activeTool === 'markup-rect') {
      svgElements.push(
        <rect key="drag-markup-rect" x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
          fill="none" stroke="#f59e0b" strokeWidth={sw} strokeDasharray={`${6 / zoom} ${3 / zoom}`} />
      )
    } else if (activeTool === 'markup-arrow') {
      const from = a
      const to = b
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      const hl = 12 / zoom
      const p1 = { x: to.x - hl * Math.cos(angle - Math.PI / 6), y: to.y - hl * Math.sin(angle - Math.PI / 6) }
      const p2 = { x: to.x - hl * Math.cos(angle + Math.PI / 6), y: to.y - hl * Math.sin(angle + Math.PI / 6) }
      svgElements.push(
        <g key="drag-markup-arrow">
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#f59e0b" strokeWidth={sw} />
          <polygon points={`${to.x},${to.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill="#f59e0b" />
        </g>
      )
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-white">
      {/* Back + Toolbar */}
      <div className="flex items-center bg-gray-900 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white text-xs font-medium transition-colors border-r border-gray-700">
          <ArrowLeftIcon className="w-4 h-4" />
          Dashboard
        </button>
        <div className="flex-1 min-w-0 flex items-center">
          <TakeoffToolbar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            currentPage={page.pageIndex}
            totalPages={1}
            onPrevPage={() => {}}
            onNextPage={() => {}}
            zoom={zoom}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            pageScale={scaleCalibrated && canvasSize.w > 0 ? { pageIndex: page.pageIndex, pixelsPerFoot: pageScale! * canvasSize.w, calibrated: true } : undefined}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            hidePagination
            onDownloadPage={handleDownloadPage}
            isDownloading={isDownloading}
            onUndo={() => handleUndoRef.current()}
            canUndo={canUndo}
          />
          {activeItemId && activeTool !== 'pan' && activeTool !== 'set-scale' && (() => {
            const item = items.find(i => i.id === activeItemId)
            return item ? (
              <div className="flex items-center gap-1.5 px-3 flex-shrink-0">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-amber-400 text-[11px] font-medium whitespace-nowrap truncate max-w-[140px]">
                  Measuring: {item.name}
                </span>
              </div>
            ) : null
          })()}
        </div>
      </div>

      {/* Scale not set warning banner */}
      {!scaleCalibrated && activeTool !== 'set-scale' && (
        <div className="bg-amber-500 text-white text-xs px-4 py-2 flex items-center gap-2 font-medium flex-shrink-0">
          <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
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
        <div
          ref={containerRef}
          className="flex-1 relative bg-gray-100 overflow-hidden overscroll-contain"
          style={{
            touchAction: 'none',
            contain: 'strict',
            overscrollBehavior: 'contain',
            cursor: activeTool === 'pan' ? 'grab' : undefined,
          }}
        >
          {!pdfLoaded && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              Loading PDF...
            </div>
          )}

          {/* Inner div: CSS transform for zoom + pan (PDF canvas only).
              The SVG overlay below is intentionally NOT inside this scaled
              wrapper — see the comment on the <svg> for why. */}
          <div
            ref={innerRef}
            style={{
              transformOrigin: '0 0',
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              position: 'relative',
              display: 'inline-block',
            }}
          >
            <canvas ref={canvasRef} style={{ display: 'block' }} />
          </div>

          {/* SVG overlay for measurements.
              Held OUTSIDE the scaled wrapper so the browser re-tessellates
              vector strokes at the current zoom resolution instead of
              bitmap-scaling a once-rasterized compositor layer. We mirror
              the wrapper's translate (panX, panY) but apply zoom by
              growing the SVG's intrinsic width/height to canvasSize * zoom
              while keeping viewBox locked to canvasSize — points stay in
              zoom=1 user-units, so neither the captured/stored coords nor
              the hit-test math has to change. */}
          {pdfLoaded && canvasSize.w > 0 && (
            <svg
              width={canvasSize.w * zoom}
              height={canvasSize.h * zoom}
              viewBox={`0 0 ${canvasSize.w} ${canvasSize.h}`}
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${canvasSize.w * zoom}px`,
                height: `${canvasSize.h * zoom}px`,
                transform: `translate(${panX}px, ${panY}px)`,
                transformOrigin: '0 0',
                cursor,
                pointerEvents: 'all',
              }}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onClick={handleSvgClick}
              onDoubleClick={handleSvgDoubleClick}
            >
              {svgElements}
            </svg>
          )}

          {/* Markup text input */}
          {markupTextInput.visible && (
            <div
              className="absolute z-10"
              style={{
                left: markupTextInput.pos.x * zoom + panX,
                top: markupTextInput.pos.y * zoom + panY,
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
          onSelectItem={handleSelectItem}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
          onRenameItem={handleRenameItem}
          onChangeItemColor={handleChangeItemColor}
          onDeleteMeasurement={handleDeleteMeasurement}
          isPanelOpen={isConfigPanelOpen}
          onPanelOpenChange={(open) => {
            setIsConfigPanelOpen(open)
            if (open) {
              // Fresh panel session — reset session item tracking and disarm.
              setPanelSessionItemId(null)
              setIsMeasuringActive(false)
              setTempPoints([])
            } else {
              // Cancel — disarm placement.
              setIsMeasuringActive(false)
              setTempPoints([])
              setPanelSessionItemId(null)
            }
          }}
          isMeasuringActive={isMeasuringActive}
          panelSessionItemId={panelSessionItemId}
          tempPointsCount={tempPoints.length}
          onFinishMeasuring={() => {
            // Finalize the in-progress item: close the panel, leave the
            // item in `items` (so it surfaces in the saved list), and
            // disarm placement.
            setIsConfigPanelOpen(false)
            setIsMeasuringActive(false)
            setTempPoints([])
            setPanelSessionItemId(null)
          }}
        />
      </div>

      {/* Scale modal */}
      {showScaleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[420px]">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Set Scale</h3>
            <p className="text-sm text-gray-500 mb-5">What is the real-world distance between these two points?</p>
            <div className="flex items-center gap-2 mb-5">
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="number"
                  value={scaleFeet}
                  onChange={e => setScaleFeet(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScaleSubmit()}
                  placeholder="0"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  autoFocus
                  min="0"
                  step="any"
                />
                <span className="text-sm text-gray-500 font-medium">ft</span>
              </div>
              <div className="flex-1 flex items-center gap-1">
                <input
                  type="number"
                  value={scaleInches}
                  onChange={e => { const v = Number(e.target.value); if (v <= 11.99 || e.target.value === '') setScaleInches(e.target.value) }}
                  onKeyDown={e => e.key === 'Enter' && handleScaleSubmit()}
                  placeholder="0"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  min="0"
                  max="11.99"
                  step="any"
                />
                <span className="text-sm text-gray-500 font-medium">in</span>
              </div>
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
