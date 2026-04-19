'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Portal from '@/components/ui/Portal'
import {
  MoveRightIcon,
  CircleIcon,
  TypeIcon,
  PenIcon,
  Undo2Icon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'

interface Annotation {
  type: 'arrow' | 'circle' | 'text' | 'freeform'
  points: number[][]
  strokeWidth: number
  text?: string
}

type Tool = 'arrow' | 'circle' | 'text' | 'freeform'

interface Props {
  imageUrl: string
  initialAnnotations: Annotation[]
  onSave: (annotations: Annotation[]) => void
  onCancel: () => void
}

const STROKE_WIDTHS = [2, 4, 8]
const COLOR = '#f59e0b'

export default function SOPImageMarkup({ imageUrl, initialAnnotations, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<Tool>('freeform')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations)
  const [drawing, setDrawing] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<number[][]>([])
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgDims, setImgDims] = useState({ natW: 0, natH: 0, dispW: 0, dispH: 0 })
  const imgRef = useRef<HTMLImageElement | null>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      setImgDims((prev) => ({ ...prev, natW: img.naturalWidth, natH: img.naturalHeight }))
      setImgLoaded(true)
    }
    img.src = imageUrl
  }, [imageUrl])

  const updateDisplaySize = useCallback(() => {
    const container = containerRef.current
    if (!container || !imgRef.current) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const iw = imgRef.current.naturalWidth
    const ih = imgRef.current.naturalHeight
    const scale = Math.min(cw / iw, ch / ih, 1)
    setImgDims({ natW: iw, natH: ih, dispW: iw * scale, dispH: ih * scale })
  }, [])

  useEffect(() => {
    if (!imgLoaded) return
    updateDisplaySize()
    const observer = new ResizeObserver(() => updateDisplaySize())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [imgLoaded, updateDisplaySize])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgDims.dispW) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = imgDims.dispW
    canvas.height = imgDims.dispH
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const sx = imgDims.dispW / imgDims.natW
    const sy = imgDims.dispH / imgDims.natH

    for (const a of annotations) {
      drawAnnotation(ctx, a, sx, sy)
    }

    if (currentPoints.length > 0) {
      const preview: Annotation = { type: tool, points: currentPoints, strokeWidth, text: undefined }
      drawAnnotation(ctx, preview, sx, sy)
    }
  }, [annotations, currentPoints, imgDims, tool, strokeWidth])

  useEffect(() => {
    redraw()
  }, [redraw])

  function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation, sx: number, sy: number) {
    ctx.strokeStyle = COLOR
    ctx.fillStyle = COLOR
    ctx.lineWidth = a.strokeWidth * sx
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const pts = a.points.map(([x, y]) => [x * sx, y * sy])

    if (a.type === 'freeform' && pts.length > 1) {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.stroke()
    } else if (a.type === 'arrow' && pts.length === 2) {
      const [start, end] = pts
      ctx.beginPath()
      ctx.moveTo(start[0], start[1])
      ctx.lineTo(end[0], end[1])
      ctx.stroke()
      const angle = Math.atan2(end[1] - start[1], end[0] - start[0])
      const headLen = Math.max(10, ctx.lineWidth * 5)
      ctx.beginPath()
      ctx.moveTo(end[0], end[1])
      ctx.lineTo(end[0] - headLen * Math.cos(angle - Math.PI / 6), end[1] - headLen * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(end[0], end[1])
      ctx.lineTo(end[0] - headLen * Math.cos(angle + Math.PI / 6), end[1] - headLen * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    } else if (a.type === 'circle' && pts.length === 2) {
      const [start, end] = pts
      const rx = Math.abs(end[0] - start[0]) / 2
      const ry = Math.abs(end[1] - start[1]) / 2
      const cx = (start[0] + end[0]) / 2
      const cy = (start[1] + end[1]) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (a.type === 'text' && pts.length >= 1 && a.text) {
      const fs = Math.max(14, ctx.lineWidth * 6)
      ctx.font = `bold ${fs}px sans-serif`
      const metrics = ctx.measureText(a.text)
      const px = 4
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(pts[0][0] - px, pts[0][1] - fs - px, metrics.width + px * 2, fs + px * 2)
      ctx.fillStyle = COLOR
      ctx.fillText(a.text, pts[0][0], pts[0][1])
    }
  }

  function getCoords(e: React.MouseEvent | React.TouchEvent): [number, number] | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number
    if ('touches' in e) {
      if (e.touches.length === 0) return null
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }
    const sx = imgDims.natW / imgDims.dispW
    const sy = imgDims.natH / imgDims.dispH
    return [(clientX - rect.left) * sx, (clientY - rect.top) * sy]
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (textInput) return
    const coords = getCoords(e)
    if (!coords) return

    if (tool === 'text') {
      const sx = imgDims.dispW / imgDims.natW
      const sy = imgDims.dispH / imgDims.natH
      setTextInput({ x: coords[0] * sx, y: coords[1] * sy })
      setTextValue('')
      setTimeout(() => textInputRef.current?.focus(), 50)
      return
    }

    setDrawing(true)
    setCurrentPoints([coords])
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return
    const coords = getCoords(e)
    if (!coords) return

    if (tool === 'freeform') {
      setCurrentPoints((prev) => [...prev, coords])
    } else {
      setCurrentPoints((prev) => [prev[0], coords])
    }
  }

  function handlePointerUp() {
    if (!drawing) return
    setDrawing(false)

    if (currentPoints.length < 2) {
      setCurrentPoints([])
      return
    }

    const annotation: Annotation = {
      type: tool,
      points: currentPoints,
      strokeWidth,
    }
    setAnnotations((prev) => [...prev, annotation])
    setCurrentPoints([])
  }

  function handleTextSubmit() {
    if (!textInput || !textValue.trim()) {
      setTextInput(null)
      setTextValue('')
      return
    }
    const sx = imgDims.natW / imgDims.dispW
    const sy = imgDims.natH / imgDims.dispH
    const annotation: Annotation = {
      type: 'text',
      points: [[textInput.x * sx, textInput.y * sy]],
      strokeWidth,
      text: textValue.trim(),
    }
    setAnnotations((prev) => [...prev, annotation])
    setTextInput(null)
    setTextValue('')
  }

  function handleUndo() {
    setAnnotations((prev) => prev.slice(0, -1))
  }

  function handleClearAll() {
    if (annotations.length === 0) return
    if (!window.confirm('Remove all markup from this image?')) return
    setAnnotations([])
  }

  if (!imgLoaded) {
    return (
      <Portal>
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
        </div>
      </Portal>
    )
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex flex-col bg-gray-900">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-1">
            {([
              ['arrow', MoveRightIcon, 'Arrow'],
              ['circle', CircleIcon, 'Circle'],
              ['text', TypeIcon, 'Text'],
              ['freeform', PenIcon, 'Draw'],
            ] as const).map(([t, Icon, label]) => (
              <button
                key={t}
                onClick={() => { setTool(t); setTextInput(null) }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition ${
                  tool === t ? 'bg-amber-500 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
                title={label}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
            <div className="w-px h-6 bg-gray-700 mx-1" />
            {STROKE_WIDTHS.map((sw) => (
              <button
                key={sw}
                onClick={() => setStrokeWidth(sw)}
                className={`p-1.5 rounded transition ${
                  strokeWidth === sw ? 'bg-amber-500' : 'hover:bg-gray-700'
                }`}
                title={sw === 2 ? 'Thin' : sw === 4 ? 'Medium' : 'Thick'}
              >
                <div
                  className="rounded-full bg-gray-300"
                  style={{ width: sw * 2 + 4, height: sw * 2 + 4 }}
                />
              </button>
            ))}
            <div className="w-px h-6 bg-gray-700 mx-1" />
            <button
              onClick={handleUndo}
              disabled={annotations.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-gray-300 hover:bg-gray-700 transition disabled:opacity-30"
              title="Undo"
            >
              <Undo2Icon className="w-4 h-4" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              onClick={handleClearAll}
              disabled={annotations.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium text-gray-300 hover:bg-gray-700 transition disabled:opacity-30"
              title="Clear all"
            >
              <Trash2Icon className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden p-4 min-h-0">
          <div className="relative" style={{ width: imgDims.dispW, height: imgDims.dispH }}>
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-contain rounded"
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              width={imgDims.dispW}
              height={imgDims.dispH}
              className="absolute inset-0"
              style={{ cursor: tool === 'text' ? 'text' : 'crosshair', touchAction: 'none' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
            {textInput && (
              <input
                ref={textInputRef}
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTextSubmit()
                  if (e.key === 'Escape') { setTextInput(null); setTextValue('') }
                }}
                onBlur={handleTextSubmit}
                className="absolute bg-black/60 text-amber-400 font-bold text-sm px-2 py-1 rounded border border-amber-500/50 outline-none"
                style={{ left: textInput.x, top: textInput.y - 30, minWidth: 100 }}
                placeholder="Type here..."
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-gray-800 border-t border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(annotations)}
            className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition"
          >
            Save Markup
          </button>
        </div>
      </div>
    </Portal>
  )
}
