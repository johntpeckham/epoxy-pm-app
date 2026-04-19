'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Portal from '@/components/ui/Portal'
import {
  MousePointer2Icon, MoveRightIcon, CircleIcon, TypeIcon, PenIcon,
  SquareIcon, TargetIcon, Undo2Icon, Trash2Icon, XIcon,
} from 'lucide-react'
import {
  type MarkupAnnotation, type MarkupData, type HandleId,
  MARKUP_COLORS, DEFAULT_BLUR_INTENSITY, STROKE_WIDTHS,
  generateId, renderMarkupToCanvas, drawSelectionHighlight,
  hitTestAnnotation, getHandles, hitTestHandle,
  moveAnnotation, resizeAnnotation,
} from './sopMarkupUtils'

type ToolType = 'select' | 'arrow' | 'circle' | 'text' | 'freeform' | 'focus-rect' | 'focus-circle'

interface Props {
  imageUrl: string
  initialMarkupData: MarkupData | null
  onSave: (data: MarkupData) => void
  onCancel: () => void
}

const TOOLS: { type: ToolType; icon: typeof MousePointer2Icon; label: string }[] = [
  { type: 'select', icon: MousePointer2Icon, label: 'Select' },
  { type: 'arrow', icon: MoveRightIcon, label: 'Arrow' },
  { type: 'circle', icon: CircleIcon, label: 'Circle' },
  { type: 'text', icon: TypeIcon, label: 'Text' },
  { type: 'freeform', icon: PenIcon, label: 'Draw' },
  { type: 'focus-rect', icon: SquareIcon, label: 'Focus □' },
  { type: 'focus-circle', icon: TargetIcon, label: 'Focus ○' },
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
  const [annotations, setAnnotations] = useState<MarkupAnnotation[]>(initialMarkupData?.annotations ?? [])
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
    annId: string
    snapshot: MarkupAnnotation[]
    moved: boolean
  } | null>(null)

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
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    let cx: number, cy: number
    if ('touches' in e) {
      if (e.touches.length === 0) return null
      cx = e.touches[0].clientX; cy = e.touches[0].clientY
    } else {
      cx = e.clientX; cy = e.clientY
    }
    return [(cx - rect.left) * (imgDims.natW / imgDims.dispW), (cy - rect.top) * (imgDims.natH / imgDims.dispH)]
  }

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
  }, [annotations, currentPoints, imgDims, tool, strokeWidth, color, blurIntensity, drawing, selectedId])

  useEffect(() => { redraw() }, [redraw])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (textInput) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        setHistory(h => [...h.slice(-49), annotations])
        setAnnotations(prev => prev.filter(a => a.id !== selectedId))
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
  }, [selectedId, textInput, annotations])

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
            dragRef.current = { mode: 'resize', handleId: hid, startX: px, startY: py, annId: selectedId, snapshot: [...annotations], moved: false }
            return
          }
        }
      }
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (hitTestAnnotation(annotations[i], px, py, 10 * scaleTol)) {
          setSelectedId(annotations[i].id)
          dragRef.current = { mode: 'move', startX: px, startY: py, annId: annotations[i].id, snapshot: [...annotations], moved: false }
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
      const { mode, startX, startY, annId, handleId } = dragRef.current
      dragRef.current.moved = true
      setAnnotations(prev => prev.map(a => {
        if (a.id !== annId) return a
        if (mode === 'move') return moveAnnotation(a, px - startX, py - startY)
        if (mode === 'resize' && handleId) return resizeAnnotation(a, handleId, px, py)
        return a
      }))
      if (mode === 'move') {
        dragRef.current.startX = px
        dragRef.current.startY = py
      }
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
      if (dragRef.current.moved) {
        setHistory(h => [...h.slice(-49), dragRef.current!.snapshot])
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

  const hasFocus = annotations.some(a => a.type === 'focus-rect' || a.type === 'focus-circle')
  const showBlurSlider = hasFocus || tool === 'focus-rect' || tool === 'focus-circle'
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
            <button
              key={t}
              onClick={() => handleToolChange(t)}
              className={`p-1.5 rounded transition ${tool === t ? 'bg-amber-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
              title={label}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}

          <div className="w-px h-6 bg-gray-700 mx-0.5" />

          {STROKE_WIDTHS.map(sw => (
            <button
              key={sw}
              onClick={() => setStrokeWidth(sw)}
              className={`p-1 rounded transition ${strokeWidth === sw ? 'bg-amber-500' : 'hover:bg-gray-700'}`}
              title={sw === 2 ? 'Thin' : sw === 4 ? 'Medium' : 'Thick'}
            >
              <div className="rounded-full bg-gray-300" style={{ width: sw * 2 + 4, height: sw * 2 + 4 }} />
            </button>
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

          {showBlurSlider && (
            <>
              <div className="w-px h-6 bg-gray-700 mx-0.5" />
              <div className="flex items-center gap-1 text-xs text-gray-300 whitespace-nowrap">
                <span>Blur</span>
                <input
                  type="range" min={2} max={20} value={blurIntensity}
                  onChange={e => setBlurIntensity(Number(e.target.value))}
                  className="w-16 accent-amber-500"
                />
                <span>{blurIntensity}px</span>
              </div>
            </>
          )}

          <div className="w-px h-6 bg-gray-700 mx-0.5" />

          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="p-1.5 rounded text-gray-300 hover:bg-gray-700 transition disabled:opacity-30"
            title="Undo"
          >
            <Undo2Icon className="w-4 h-4" />
          </button>
          <button
            onClick={handleClearAll}
            disabled={annotations.length === 0}
            className="p-1.5 rounded text-gray-300 hover:bg-gray-700 transition disabled:opacity-30"
            title="Clear all"
          >
            <Trash2Icon className="w-4 h-4" />
          </button>

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
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              width={imgDims.dispW}
              height={imgDims.dispH}
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
