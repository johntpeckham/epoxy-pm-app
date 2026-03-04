'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageRef = useRef<any>(null)

  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  const [fitScale, setFitScale] = useState(1)

  const [pdfLoaded, setPdfLoaded] = useState(false)
  const [zoomWorking, setZoomWorking] = useState(false)

  // Measurement state
  const [pointA, setPointA] = useState<Point | null>(null)
  const [pointB, setPointB] = useState<Point | null>(null)
  const [lastDistance, setLastDistance] = useState<number | null>(null)

  // ─── Render canvas at current scale ───
  const renderCanvas = useCallback(async (s: number) => {
    const pdfPage = pageRef.current
    const canvas = canvasRef.current
    if (!pdfPage || !canvas) return

    const viewport = pdfPage.getViewport({ scale: s })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
  }, [])

  // ─── Re-render when scale changes ───
  useEffect(() => {
    if (pdfLoaded) {
      renderCanvas(scale)
    }
  }, [scale, pdfLoaded, renderCanvas])

  // ─── Pinch to zoom — native events, passive: false ───
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let startDist = 0
    let startScale = 1

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        startDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        )
        startScale = scaleRef.current
        setZoomWorking(true)
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        )
        const newScale = Math.min(Math.max(startScale * (dist / startDist), 0.3), 5)
        scaleRef.current = newScale
        setScale(newScale)
      }
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
        const newScale = Math.min(Math.max(scaleRef.current * zoomFactor, 0.3), 5)
        scaleRef.current = newScale
        setScale(newScale)
        setZoomWorking(true)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  // ─── File upload handler ───
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const pdfjs = await getPdfjs()
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    const doc = await pdfjs.getDocument({ data }).promise
    const pdfPage = await doc.getPage(1)
    pageRef.current = pdfPage

    // Calculate fit scale
    const container = containerRef.current
    if (!container) return
    const rawVp = pdfPage.getViewport({ scale: 1 })
    const cw = container.clientWidth
    const ch = container.clientHeight
    const fs = Math.min(cw / rawVp.width, ch / rawVp.height) * 0.9

    setFitScale(fs)
    scaleRef.current = fs
    setScale(fs)
    setPdfLoaded(true)

    // Initial render
    await renderCanvas(fs)
  }

  // ─── Click to measure ───
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (!pointA) {
      // First click — store point A
      setPointA({ x, y })
      setPointB(null)
      setLastDistance(null)
    } else {
      // Second click — store point B, calculate distance
      const b = { x, y }
      setPointB(b)
      const dist = Math.hypot(b.x - pointA.x, b.y - pointA.y)
      setLastDistance(dist)
      // Reset after a brief pause so user sees the line
      setTimeout(() => {
        setPointA(null)
        setPointB(null)
      }, 2000)
    }
  }

  // ─── Zoom buttons ───
  function zoomIn() {
    const newScale = Math.min(scaleRef.current * 1.2, 5)
    scaleRef.current = newScale
    setScale(newScale)
  }

  function zoomOut() {
    const newScale = Math.max(scaleRef.current / 1.2, 0.3)
    scaleRef.current = newScale
    setScale(newScale)
  }

  function zoomReset() {
    scaleRef.current = fitScale
    setScale(fitScale)
  }

  const zoomPercent = fitScale > 0 ? Math.round((scale / fitScale) * 100) : 100

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
          <strong>Scale:</strong> {zoomPercent}%
          {fitScale > 0 && ` (raw: ${scale.toFixed(3)}, fit: ${fitScale.toFixed(3)})`}
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

        {/* PDF canvas */}
        <canvas ref={canvasRef} style={{ display: 'block' }} />

        {/* Click-to-measure overlay */}
        {pdfLoaded && (
          <div
            onClick={handleOverlayClick}
            style={{
              position: 'absolute',
              inset: 0,
              cursor: 'crosshair',
              zIndex: 10,
            }}
          >
            {/* SVG overlay for measurement visuals */}
            <svg
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              {/* Point A dot */}
              {pointA && (
                <circle cx={pointA.x} cy={pointA.y} r={6} fill="red" stroke="white" strokeWidth={2} />
              )}

              {/* Point B dot + line */}
              {pointA && pointB && (
                <>
                  <line
                    x1={pointA.x} y1={pointA.y}
                    x2={pointB.x} y2={pointB.y}
                    stroke="red" strokeWidth={2}
                  />
                  <circle cx={pointB.x} cy={pointB.y} r={6} fill="red" stroke="white" strokeWidth={2} />

                  {/* Distance label */}
                  {lastDistance !== null && (() => {
                    const mx = (pointA.x + pointB.x) / 2
                    const my = (pointA.y + pointB.y) / 2
                    const label = `${lastDistance.toFixed(1)} px`
                    const labelW = label.length * 8 + 12
                    return (
                      <>
                        <rect
                          x={mx - labelW / 2} y={my - 12}
                          width={labelW} height={24}
                          rx={4} fill="rgba(0,0,0,0.8)"
                        />
                        <text
                          x={mx} y={my + 1}
                          fill="white" fontSize={13} fontWeight="bold"
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
          </div>
        )}
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
