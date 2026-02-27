'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { PlusIcon, XIcon, PenLineIcon } from 'lucide-react'
import { JsaSignatureEntry } from '@/types'

interface SignatureRow {
  name: string
  signatureData: string | null
}

interface JsaSignatureSectionProps {
  initialSignatures?: JsaSignatureEntry[]
  onChange: (signatures: JsaSignatureEntry[]) => void
}

const DEFAULT_ROW_COUNT = 10

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'

// ── Signature Modal ──────────────────────────────────────────────────────────

function SignatureModal({
  name,
  initialData,
  onDone,
  onCancel,
}: {
  name: string
  initialData: string | null
  onDone: (data: string) => void
  onCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const hasStrokes = useRef(false)

  // Coordinates are in CSS pixels because ctx.scale(dpr, dpr) maps them to canvas pixels.
  // Do NOT multiply by canvas.width/rect.width — that would double-scale on retina displays.
  const getPos = useCallback((e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = '#000'
    if (initialData) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height)
        hasStrokes.current = true
      }
      img.src = initialData
    }
  }, [initialData])

  useEffect(() => {
    initCanvas()
  }, [initCanvas])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    hasStrokes.current = false
  }

  function handleDone() {
    const canvas = canvasRef.current
    if (!canvas || !hasStrokes.current) return
    onDone(canvas.toDataURL('image/png'))
  }

  // Mouse handlers
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    isDrawing.current = true
    hasStrokes.current = true
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.nativeEvent, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.nativeEvent, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }
  function onMouseUp() {
    isDrawing.current = false
  }

  // Touch handlers
  function onTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas || !e.touches[0]) return
    isDrawing.current = true
    hasStrokes.current = true
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.touches[0], canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }
  function onTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas || !e.touches[0]) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.touches[0], canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }
  function onTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    isDrawing.current = false
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Sign: {name || 'Employee'}
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <canvas
          ref={canvasRef}
          style={{ height: 200, touchAction: 'none' }}
          className="w-full border border-gray-300 rounded-lg bg-white cursor-crosshair"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearCanvas}
            className="px-3 py-2 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Clear
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDone}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Section Component ───────────────────────────────────────────────────

export default function JsaSignatureSection({ initialSignatures, onChange }: JsaSignatureSectionProps) {
  const [rows, setRows] = useState<SignatureRow[]>(() => {
    const existing = (initialSignatures ?? []).map((s) => ({
      name: s.name,
      signatureData: s.signature || null,
    }))
    // Pad to DEFAULT_ROW_COUNT
    while (existing.length < DEFAULT_ROW_COUNT) {
      existing.push({ name: '', signatureData: null })
    }
    return existing
  })
  const [signingIndex, setSigningIndex] = useState<number | null>(null)

  // Emit filled signatures whenever rows change
  useEffect(() => {
    const filled: JsaSignatureEntry[] = rows
      .filter((r) => r.name.trim() || r.signatureData)
      .map((r) => ({ name: r.name.trim(), signature: r.signatureData ?? '' }))
    onChange(filled)
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateName(i: number, name: string) {
    setRows((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], name }
      return next
    })
  }

  function addRow() {
    setRows((prev) => [...prev, { name: '', signatureData: null }])
  }

  function handleSignDone(data: string) {
    if (signingIndex === null) return
    setRows((prev) => {
      const next = [...prev]
      next[signingIndex] = { ...next[signingIndex], signatureData: data }
      return next
    })
    setSigningIndex(null)
  }

  return (
    <>
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
          Employee Acknowledgment &amp; Signatures
        </p>
        <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
          I acknowledge that the Job Safety Analysis has been reviewed with me, I understand the hazards
          and required controls, and I agree to follow all safety procedures outlined.
        </p>

        {/* Sign-in sheet rows */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px] gap-2 px-3 py-1.5 bg-gray-50 border-b border-gray-200">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Print Name</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">Signature</span>
          </div>

          {rows.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_100px] gap-2 items-center px-3 py-1.5 ${
                i % 2 === 1 ? 'bg-gray-50/50' : ''
              } ${i < rows.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateName(i, e.target.value)}
                placeholder={`Employee ${i + 1}`}
                className={inputCls}
              />
              {row.signatureData ? (
                <button
                  type="button"
                  onClick={() => setSigningIndex(i)}
                  className="relative group flex items-center justify-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.signatureData}
                    alt="Signature"
                    className="h-[36px] w-[90px] object-contain border border-gray-200 rounded bg-white"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70 opacity-0 group-hover:opacity-100 transition rounded">
                    <PenLineIcon className="w-3.5 h-3.5 text-amber-600" />
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSigningIndex(i)}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-amber-600 border border-amber-300 rounded hover:bg-amber-50 transition"
                >
                  <PenLineIcon className="w-3 h-3" />
                  Sign
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 mt-2 text-xs text-amber-600 hover:text-amber-700 font-medium transition"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add Row
        </button>
      </div>

      {signingIndex !== null && (
        <SignatureModal
          name={rows[signingIndex].name}
          initialData={rows[signingIndex].signatureData}
          onDone={handleSignDone}
          onCancel={() => setSigningIndex(null)}
        />
      )}
    </>
  )
}
