'use client'

import { useState, useEffect, useRef, useCallback, Fragment, type ReactNode } from 'react'
import Portal from '@/components/ui/Portal'
import {
  MousePointer2Icon, MoveRightIcon, CircleIcon, TypeIcon, PenIcon,
  Undo2Icon, Trash2Icon, XIcon,
} from 'lucide-react'
import {
  type MarkupAnnotation, type MarkupData, type HandleId,
  MARKUP_COLORS, DEFAULT_BLUR_INTENSITY, STROKE_WIDTHS,
  generateId, renderMarkupToCanvas, drawSelectionHighlight,
  hitTestAnnotation, getHandles, hitTestHandle,
  moveAnnotation, resizeAnnotation,
} from './sopMarkupUtils'

function FocusRectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" strokeWidth="1.5" />
      <path d="M4.5 8C5.5 6 10.5 6 11.5 8C10.5 10 5.5 10 4.5 8Z" strokeWidth="1" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FocusCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor">
      <circle cx="8" cy="8" r="6.5" strokeWidth="1.5" />
      <path d="M4.5 8C5.5 6 10.5 6 11.5 8C10.5 10 5.5 10 4.5 8Z" strokeWidth="1" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="relative group/tip inline-flex">
      {children}
      <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 rounded bg-gray-950 text-white text-[11px] whitespace-nowrap opacity-0 group-hover/tip:opacity-100 group-hover/tip:delay-300 pointer-events-none transition-opacity z-20">
        {label}
      </span>
    </span>
  )
}

type ToolType = 'select' | 'arrow' | 'circle' | 'text' | 'freeform' | 'focus-rect' | 'focus-circle'

interface Props {
  imageUrl: string
  initialMarkupData: MarkupData | null
  onSave: (data: MarkupData) => void
  onCancel: () => void
}

const TOOLS: { type: ToolType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'select', icon: MousePointer2Icon, label: 'Select' },
  { type: 'arrow', icon: MoveRightIcon, label: 'Arrow' },
  { type: 'circle', icon: CircleIcon, label: 'Circle' },
  { type: 'text', icon: TypeIcon, label: 'Text' },
  { type: 'freeform', icon: PenIcon, label: 'Freeform' },
  { type: 'focus-rect', icon: FocusRectIcon, label: 'Blur — rectangle' },
  { type: 'focus-circle', icon: FocusCircleIcon, label: 'Blur — circle' },
]

export default function SOPImageMarkup({ imageUrl, initialMarkupData, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  const [tool, setTool] = useState<ToolType>('select')
  const [color, setColor] = useState(MARKUP_COLORS[3])
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [blurIntensity, setBlurIntensity] = useState(initialMarkupData?.blurIntensity ?? DEFAULT_BLUR_INTENSITY)
  const [annotations, setAnnotations] = useState<MarkupAnnotation[]>(
    initialMarkupData?.annotations ?? []
  )
  const [history, setHistory] = useState<MarkupAnnotation[][]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgDims, setImgDims] = useState({ natW: 0, natH: 0, dispW: 0, dispH: 0 })

  const [drawing, setDrawing] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<number[][]>([])

  const dragRef = useRef<{
    mode: 'move' | 'resize'
    handleId?: HandleId
    startX: number
    startY: number
    curX: number
    curY: number
    annId: string
    snapshot: MarkupAnnotation[]
    moved: boolean
  } | null>(null)
  const rafRef = useRef(0)

  const [textInput, setTextInput] = useState<{ dispX: number; dispY: number; editId?: string } | null>(null)
  const [textValue, setTextValue] = useState('')

  useEffect(() => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      setImgDims(d => ({ ...d, natW: img.naturalWidth, natH: img.naturalHeight }))
      setImgLoaded(true)
    }
    img.src = imageUrl
  }, [imageUrl])

  const updateDisplaySize = useCallback(() => {
    const c = containerRef.current
    if (!c || !imgRef.current) return
    const iw = imgRef.current.naturalWidth, ih = imgRef.current.naturalHeight
    const scale = Math.min(c.clientWidth / iw, c.clientHeight / ih, 1)
    setImgDims({ natW: iw, natH: ih, dispW: iw * scale, dispH: ih * scale })
  }, [])

  useEffect(() => {
    if (!imgLoaded) return
    updateDisplaySize()
    const obs = new ResizeObserver(updateDisplaySize)
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [imgLoaded, updateDisplaySize])

  function getCoords(e: React.MouseEvent | React.TouchEvent): [number, number] | null {
    const canvas = canvasRef.current
    if (!canvas || !imgDims.dispW || !imgDims.dispH) return null
    const rect = canvas.getBoundingClientRect()
    let cx: number, cy: number
    if ('touches' in e) {
      if (e.touches.length === 0) return null
      cx = e.touches[0].clientX; cy = e.touches[0].clientY
    } else {
      cx = e.clientX; cy = e.clientY
    }
    const natX = (cx - rect.left) * (imgDims.natW / imgDims.dispW)
    const natY = (cy - rect.top) * (imgDims.natH / imgDims.dispH)
    if (!isFinite(natX) || !isFinite(natY)) return null
    return [natX, natY]
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgDims.dispW || !imgDims.dispH) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = Math.round(imgDims.dispW)
    const h = Math.round(imgDims.dispH)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    try {
      const sx = imgDims.dispW / imgDims.natW
      const sy = imgDims.dispH / imgDims.natH

      const allAnns = [...annotations]
      if (drawing && currentPoints.length >= 2) {
        if (tool === 'freeform') {
          allAnns.push({
            id: '__preview__', type: 'freeform', color, strokeWidth,
            x1: 0, y1: 0, x2: 0, y2: 0, points: currentPoints,
          })
        } else if (tool !== 'text' && tool !== 'select') {
          allAnns.push({
            id: '__preview__', type: tool, color, strokeWidth,
            x1: currentPoints[0][0], y1: currentPoints[0][1],
            x2: currentPoints[1][0], y2: currentPoints[1][1],
          })
        }
      }

      renderMarkupToCanvas(ctx, { blurIntensity, annotations: allAnns }, imgRef.current, sx, sy)

      if (selectedId) {
        const sel = allAnns.find(a => a.id === selectedId)
        if (sel) drawSelectionHighlight(ctx, sel, sx, sy)
      }
    } catch {
      // Render error — canvas stays cleared so the image underneath shows through
    }
  }, [annotations, currentPoints, imgDims, tool, strokeWidth, color, drawing, selectedId, blurIntensity])

  useEffect(() => { redraw() }, [redraw])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function drawDragFrame() {
    const canvas = canvasRef.current
    const drag = dragRef.current
    if (!canvas || !drag || !imgDims.dispW || !imgDims.dispH) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = Math.round(imgDims.dispW)
    const h = Math.round(imgDims.dispH)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const sx = imgDims.dispW / imgDims.natW
    const sy = imgDims.dispH / imgDims.natH
    const virtualAnns = drag.snapshot.map(a => {
      if (a.id !== drag.annId) return a
      if (drag.mode === 'move') return moveAnnotation(a, drag.curX - drag.startX, drag.curY - drag.startY)
      if (drag.mode === 'resize' && drag.handleId) return resizeAnnotation(a, drag.handleId, drag.curX, drag.curY)
      return a
    })
    try {
      renderMarkupToCanvas(ctx, { blurIntensity, annotations: virtualAnns }, imgRef.current, sx, sy)
      const sel = virtualAnns.find(a => a.id === drag.annId)
      if (sel) drawSelectionHighlight(ctx, sel, sx, sy)
    } catch {
      // drawing failed
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (textInput) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        setAnnotations(prev => {
          setHistory(h => [...h.slice(-49), prev])
          return prev.filter(a => a.id !== selectedId)
        })
        setSelectedId(null)
      }
      if (e.key === 'Escape') {
        setSelectedId(null)
        setDrawing(false)
        setCurrentPoints([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, textInput])

  function handleToolChange(t: ToolType) {
    setTool(t)
    setTextInput(null)
    setTextValue('')
    setDrawing(false)
    setCurrentPoints([])
    dragRef.current = null
    if (t !== 'select') setSelectedId(null)
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (textInput) return
    const coords = getCoords(e)
    if (!coords) return
    const [px, py] = coords
    const scaleTol = imgDims.natW / imgDims.dispW

    if (tool === 'select') {
      if (selectedId) {
        const sel = annotations.find(a => a.id === selectedId)
        if (sel) {
          const handles = getHandles(sel)
          const hid = hitTestHandle(handles, px, py, 12 * scaleTol)
          if (hid) {
            dragRef.current = { mode: 'resize', handleId: hid, startX: px, startY: py, curX: px, curY: py, annId: selectedId, snapshot: [...annotations], moved: false }
            return
          }
        }
      }
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (hitTestAnnotation(annotations[i], px, py, 10 * scaleTol)) {
          setSelectedId(annotations[i].id)
          dragRef.current = { mode: 'move', startX: px, startY: py, curX: px, curY: py, annId: annotations[i].id, snapshot: [...annotations], moved: false }
          return
        }
      }
      setSelectedId(null)
      return
    }

    if (tool === 'text') {
      const sx = imgDims.dispW / imgDims.natW
      const sy = imgDims.dispH / imgDims.natH
      setTextInput({ dispX: px * sx, dispY: py * sy })
      setTextValue('')
      setTimeout(() => textInputRef.current?.focus(), 50)
      return
    }

    setDrawing(true)
    setCurrentPoints([coords])
    setSelectedId(null)
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    const coords = getCoords(e)
    if (!coords) return

    if (dragRef.current) {
      const [px, py] = coords
      dragRef.current.curX = px
      dragRef.current.curY = py
      dragRef.current.moved = true
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(drawDragFrame)
      return
    }

    if (!drawing) return
    if (tool === 'freeform') {
      setCurrentPoints(p => [...p, coords])
    } else {
      setCurrentPoints(p => [p[0], coords])
    }
  }

  function handlePointerUp() {
    if (dragRef.current) {
      cancelAnimationFrame(rafRef.current)
      if (dragRef.current.moved) {
        const drag = dragRef.current
        const finalAnns = drag.snapshot.map(a => {
          if (a.id !== drag.annId) return a
          if (drag.mode === 'move') return moveAnnotation(a, drag.curX - drag.startX, drag.curY - drag.startY)
          if (drag.mode === 'resize' && drag.handleId) return resizeAnnotation(a, drag.handleId, drag.curX, drag.curY)
          return a
        })
        setHistory(h => [...h.slice(-49), drag.snapshot])
        setAnnotations(finalAnns)
      }
      dragRef.current = null
      return
    }
    if (!drawing) return
    setDrawing(false)
    if (currentPoints.length < 2) {
      setCurrentPoints([])
      return
    }

    setHistory(h => [...h.slice(-49), annotations])
    const id = generateId()
    let ann: MarkupAnnotation

    if (tool === 'freeform') {
      const xs = currentPoints.map(p => p[0])
      const ys = currentPoints.map(p => p[1])
      ann = {
        id, type: 'freeform', color, strokeWidth,
        x1: Math.min(...xs), y1: Math.min(...ys),
        x2: Math.max(...xs), y2: Math.max(...ys),
        points: currentPoints,
      }
    } else {
      ann = {
        id, type: tool as MarkupAnnotation['type'], color, strokeWidth,
        x1: currentPoints[0][0], y1: currentPoints[0][1],
        x2: currentPoints[1][0], y2: currentPoints[1][1],
      }
    }
    setAnnotations(prev => [...prev, ann])
    setCurrentPoints([])
  }

  function handleTextSubmit() {
    if (!textInput) return
    if (textInput.editId) {
      if (!textValue.trim()) {
        setHistory(h => [...h.slice(-49), annotations])
        setAnnotations(prev => prev.filter(a => a.id !== textInput.editId))
      } else {
        setHistory(h => [...h.slice(-49), annotations])
        setAnnotations(prev => prev.map(a => a.id === textInput.editId ? { ...a, text: textValue.trim() } : a))
      }
    } else if (textValue.trim()) {
      setHistory(h => [...h.slice(-49), annotations])
      const sx = imgDims.natW / imgDims.dispW
      const sy = imgDims.natH / imgDims.dispH
      setAnnotations(prev => [...prev, {
        id: generateId(), type: 'text' as const, color, strokeWidth,
        x1: textInput.dispX * sx, y1: textInput.dispY * sy,
        x2: 0, y2: 0, text: textValue.trim(),
      }])
    }
    setTextInput(null)
    setTextValue('')
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (tool !== 'select') return
    const coords = getCoords(e)
    if (!coords) return
    const [px, py] = coords
    const scaleTol = imgDims.natW / imgDims.dispW
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i]
      if (a.type === 'text' && hitTestAnnotation(a, px, py, 10 * scaleTol)) {
        const sx = imgDims.dispW / imgDims.natW
        const sy = imgDims.dispH / imgDims.natH
        setTextInput({ dispX: a.x1 * sx, dispY: a.y1 * sy, editId: a.id })
        setTextValue(a.text ?? '')
        setSelectedId(a.id)
        setTimeout(() => textInputRef.current?.focus(), 50)
        return
      }
    }
  }

  function handleUndo() {
    if (history.length === 0) return
    setAnnotations(history[history.length - 1])
    setHistory(h => h.slice(0, -1))
    setSelectedId(null)
  }

  function handleClearAll() {
    if (annotations.length === 0) return
    if (!window.confirm('Remove all markup from this image?')) return
    setHistory(h => [...h.slice(-49), annotations])
    setAnnotations([])
    setSelectedId(null)
  }

  const hasFocusAnns = annotations.some(a => a.type === 'focus-rect' || a.type === 'focus-circle') ||
    (drawing && currentPoints.length >= 2 && (tool === 'focus-rect' || tool === 'focus-circle'))
  const showBlurSlider = hasFocusAnns || tool === 'focus-rect' || tool === 'focus-circle'
  const cursorStyle = tool === 'text' ? 'text' : tool === 'select' ? 'default' : 'crosshair'

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
        <div className="flex items-center flex-wrap gap-1 px-3 py-2 bg-gray-800 border-b border-gray-700">
          {TOOLS.map(({ type: t, icon: Icon, label }) => (
            <Fragment key={t}>
              {t === 'focus-rect' && (
                <>
                  <div className="w-px h-6 bg-gray-700 mx-0.5" />
                  <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mx-0.5">Blur</span>
                </>
              )}
              <Tip label={label}>
                <button
                  onClick={() => handleToolChange(t)}
                  className={`p-1.5 rounded transition ${tool === t ? 'bg-amber-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              </Tip>
            </Fragment>
          ))}

          <div className="w-px h-6 bg-gray-700 mx-0.5" />

          {STROKE_WIDTHS.map(sw => (
            <Tip key={sw} label={sw === 2 ? 'Thin' : sw === 4 ? 'Medium' : 'Thick'}>
              <button
                onClick={() => setStrokeWidth(sw)}
                className={`p-1 rounded transition ${strokeWidth === sw ? 'bg-amber-500' : 'hover:bg-gray-700'}`}
              >
                <div className="rounded-full bg-gray-300" style={{ width: sw * 2 + 4, height: sw * 2 + 4 }} />
              </button>
            </Tip>
          ))}

          <div className="w-px h-6 bg-gray-700 mx-0.5" />

          {MARKUP_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full border-2 transition flex-shrink-0 ${
                color === c ? 'border-white ring-2 ring-amber-500 ring-offset-1 ring-offset-gray-800' : 'border-gray-600 hover:border-gray-400'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}

          <div className="w-px h-6 bg-gray-700 mx-0.5" />

          <Tip label="Undo">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="p-1.5 rounded text-gray-300 hover:bg-gray-700 transition disabled:opacity-30"
            >
              <Undo2Icon className="w-4 h-4" />
            </button>
          </Tip>
          <Tip label="Clear all">
            <button
              onClick={handleClearAll}
              disabled={annotations.length === 0}
              className="p-1.5 rounded text-gray-300 hover:bg-gray-700 transition disabled:opacity-30"
            >
              <Trash2Icon className="w-4 h-4" />
            </button>
          </Tip>

          {showBlurSlider && (
            <>
              <div className="w-px h-6 bg-gray-700 mx-0.5" />
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                Blur
                <input
                  type="range"
                  min={2}
                  max={20}
                  value={blurIntensity}
                  onChange={e => setBlurIntensity(Number(e.target.value))}
                  className="w-20 h-1 accent-amber-500"
                />
                <span className="w-4 text-center">{blurIntensity}</span>
              </label>
            </>
          )}

          <div className="flex-1" />

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
              style={hasFocusAnns ? { filter: `blur(${blurIntensity}px)` } : undefined}
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              width={Math.round(imgDims.dispW)}
              height={Math.round(imgDims.dispH)}
              className="absolute inset-0"
              style={{ cursor: cursorStyle, touchAction: 'none' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onDoubleClick={handleDoubleClick}
              onTouchStart={(e) => { e.preventDefault(); handlePointerDown(e) }}
              onTouchMove={(e) => { e.preventDefault(); handlePointerMove(e) }}
              onTouchEnd={(e) => { e.preventDefault(); handlePointerUp() }}
            />
            {textInput && (
              <input
                ref={textInputRef}
                type="text"
                value={textValue}
                onChange={e => setTextValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTextSubmit()
                  if (e.key === 'Escape') { setTextInput(null); setTextValue('') }
                }}
                onBlur={handleTextSubmit}
                className="absolute bg-black/60 text-amber-400 font-bold text-sm px-2 py-1 rounded border border-amber-500/50 outline-none"
                style={{ left: textInput.dispX, top: textInput.dispY - 30, minWidth: 100 }}
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
            onClick={() => onSave({ blurIntensity, annotations })}
            className="px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition"
          >
            Save Markup
          </button>
        </div>
      </div>
    </Portal>
  )
}
