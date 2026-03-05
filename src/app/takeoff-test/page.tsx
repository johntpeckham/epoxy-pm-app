'use client'

import { useState, useRef, useEffect } from 'react'

interface Point {
  x: number
  y: number
}

// Lazy-loaded pdfjs-dist to avoid SSR issues (DOMMatrix not available in Node)
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

export default function TakeoffTestPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const [pdfLoaded, setPdfLoaded] = useState(false)
  const [zoomWorking, setZoomWorking] = useState(false)

  // Zoom is CSS-only (1.0 = fit scale, no canvas re-render)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // Pan
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const panXRef = useRef(0)
  const panYRef = useRef(0)
  useEffect(() => { panXRef.current = panX }, [panX])
  useEffect(() => { panYRef.current = panY }, [panY])

  // Drag tracking
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const panStartRef = useRef({ x: 0, y: 0 })

  // Touch pinch start values
  const startDistRef = useRef(0)
  const startZoomRef = useRef(1)
  const startPanXRef = useRef(0)
  const startPanYRef = useRef(0)

  // Measurement state
  const [pointA, setPointA] = useState<Point | null>(null)
  const [pointB, setPointB] = useState<Point | null>(null)
  const [lastDistance, setLastDistance] = useState<number | null>(null)

  // Canvas dimensions (set once on PDF load for SVG sizing)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })

  // ─── Wheel zoom + touch pinch + touch pan — native events ───
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top
        const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05
        const newZoom = Math.min(Math.max(zoomRef.current * zoomFactor, 0.3), 5)

        // Adjust pan so the point under cursor stays fixed
        const newPanX = mouseX - (mouseX - panXRef.current) * (newZoom / zoomRef.current)
        const newPanY = mouseY - (mouseY - panYRef.current) * (newZoom / zoomRef.current)

        zoomRef.current = newZoom
        panXRef.current = newPanX
        panYRef.current = newPanY
        setZoom(newZoom)
        setPanX(newPanX)
        setPanY(newPanY)
        setZoomWorking(true)
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
        setZoomWorking(true)
      } else if (e.touches.length === 1) {
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

        // Adjust pan so the midpoint between fingers stays fixed
        const newPanX = midX - (midX - startPanXRef.current) * (newZoom / startZoomRef.current)
        const newPanY = midY - (midY - startPanYRef.current) * (newZoom / startZoomRef.current)

        zoomRef.current = newZoom
        panXRef.current = newPanX
        panYRef.current = newPanY
        setZoom(newZoom)
        setPanX(newPanX)
        setPanY(newPanY)
      } else if (e.touches.length === 1 && isDraggingRef.current) {
        const dx = e.touches[0].clientX - dragStartRef.current.x
        const dy = e.touches[0].clientY - dragStartRef.current.y
        setPanX(panStartRef.current.x + dx)
        setPanY(panStartRef.current.y + dy)
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
  }, [])

  // ─── Mouse drag to pan ───
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      panStartRef.current = { x: panXRef.current, y: panYRef.current }
      el.style.cursor = 'grabbing'
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      setPanX(panStartRef.current.x + dx)
      setPanY(panStartRef.current.y + dy)
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
  }, [])

  // ─── File upload — render canvas ONCE at fitScale ───
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const pdfjs = await getPdfjs()
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    const doc = await pdfjs.getDocument({ data }).promise
    const pdfPage = await doc.getPage(1)

    const container = containerRef.current
    if (!container) return
    const rawVp = pdfPage.getViewport({ scale: 1 })
    const cw = container.clientWidth
    const ch = container.clientHeight
    const fitScale = Math.min(cw / rawVp.width, ch / rawVp.height) * 0.9

    // Render canvas once at fitScale — never re-rendered for zoom
    const canvas = canvasRef.current
    if (!canvas) return
    const viewport = pdfPage.getViewport({ scale: fitScale })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise

    setCanvasSize({ w: viewport.width, h: viewport.height })
    setZoom(1)
    zoomRef.current = 1
    setPanX(0)
    setPanY(0)
    setPdfLoaded(true)
  }

  // ─── Click to measure (on inner div — coords are in scaled space) ───
  function handleMeasureClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    // Coords relative to the inner div, which is CSS-scaled
    // Divide by zoom to get canvas-space coordinates
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

    if (!pointA) {
      setPointA({ x, y })
      setPointB(null)
      setLastDistance(null)
    } else {
      const b = { x, y }
      setPointB(b)
      const dist = Math.hypot(b.x - pointA.x, b.y - pointA.y)
      setLastDistance(dist)
      setTimeout(() => {
        setPointA(null)
        setPointB(null)
      }, 2000)
    }
  }

  // ─── Zoom buttons ───
  function zoomIn() {
    setZoom(prev => Math.min(prev * 1.2, 5))
  }
  function zoomOut() {
    setZoom(prev => Math.max(prev / 1.2, 0.3))
  }
  function zoomReset() {
    setZoom(1)
    setPanX(0)
    setPanY(0)
  }

  const zoomPercent = Math.round(zoom * 100)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, background: '#f3f4f6', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Takeoff Test Page</h1>

        <input
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          style={{ fontSize: 14 }}
        />

        {pdfLoaded && (
          <>
            <button onClick={zoomOut} style={btnStyle}>- Zoom Out</button>
            <button onClick={zoomReset} style={btnStyle}>Reset</button>
            <button onClick={zoomIn} style={btnStyle}>+ Zoom In</button>
          </>
        )}
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
        <span>
          <strong>Zoom:</strong> {zoomPercent}%
        </span>
        <span>
          <strong>Zoom working:</strong>{' '}
          <span style={{ color: zoomWorking ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
            {zoomWorking ? 'YES' : 'NO'}
          </span>
        </span>
        <span>
          <strong>Last measured distance:</strong>{' '}
          {lastDistance !== null ? `${lastDistance.toFixed(1)} px` : '—'}
        </span>
        <span>
          <strong>PDF loaded:</strong>{' '}
          <span style={{ color: pdfLoaded ? '#16a34a' : '#9ca3af' }}>
            {pdfLoaded ? 'YES' : 'NO'}
          </span>
        </span>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100vh - 100px)',
          overflow: 'hidden',
          background: '#e5e7eb',
          border: '2px solid #d1d5db',
          borderRadius: 8,
          touchAction: 'none',
          cursor: 'grab',
        }}
      >
        {!pdfLoaded && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9ca3af', fontSize: 14,
          }}>
            Upload a PDF to begin
          </div>
        )}

        {/* Inner div: CSS transform for zoom + pan, canvas rendered once */}
        <div
          ref={innerRef}
          onClick={pdfLoaded ? handleMeasureClick : undefined}
          style={{
            transformOrigin: '0 0',
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            cursor: pdfLoaded ? 'crosshair' : undefined,
            position: 'relative',
            display: 'inline-block',
          }}
        >
          <canvas ref={canvasRef} style={{ display: 'block' }} />

          {/* SVG overlay for measurement visuals — same coordinate space as canvas */}
          {pdfLoaded && canvasSize.w > 0 && (
            <svg
              width={canvasSize.w}
              height={canvasSize.h}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
              {pointA && (
                <circle cx={pointA.x} cy={pointA.y} r={6 / zoom} fill="red" stroke="white" strokeWidth={2 / zoom} />
              )}

              {pointA && pointB && (
                <>
                  <line
                    x1={pointA.x} y1={pointA.y}
                    x2={pointB.x} y2={pointB.y}
                    stroke="red" strokeWidth={2 / zoom}
                  />
                  <circle cx={pointB.x} cy={pointB.y} r={6 / zoom} fill="red" stroke="white" strokeWidth={2 / zoom} />

                  {lastDistance !== null && (() => {
                    const mx = (pointA.x + pointB.x) / 2
                    const my = (pointA.y + pointB.y) / 2
                    const label = `${lastDistance.toFixed(1)} px`
                    const labelW = (label.length * 8 + 12) / zoom
                    const labelH = 24 / zoom
                    const fontSize = 13 / zoom
                    return (
                      <>
                        <rect
                          x={mx - labelW / 2} y={my - labelH / 2}
                          width={labelW} height={labelH}
                          rx={4 / zoom} fill="rgba(0,0,0,0.8)"
                        />
                        <text
                          x={mx} y={my + 1 / zoom}
                          fill="white" fontSize={fontSize} fontWeight="bold"
                          textAnchor="middle" dominantBaseline="middle"
                        >
                          {label}
                        </text>
                      </>
                    )
                  })()}
                </>
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: 'white',
  cursor: 'pointer',
}
