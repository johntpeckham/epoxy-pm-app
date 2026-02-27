'use client'

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'

export interface SignaturePadRef {
  clear: () => void
  toDataURL: () => string | null
  isEmpty: () => boolean
}

interface SignaturePadProps {
  initialData?: string | null
  width?: number
  height?: number
  className?: string
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(function SignaturePad(
  { initialData, height = 150, className },
  ref
) {
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

  // Resize canvas to match display size (for sharp lines on retina)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2
      ctx.strokeStyle = '#000'
    }
    // Restore initial data if present
    if (initialData) {
      const img = new Image()
      img.onload = () => {
        if (ctx) {
          ctx.drawImage(img, 0, 0, rect.width, rect.height)
          hasStrokes.current = true
        }
      }
      img.src = initialData
    }
  }, [initialData])

  useEffect(() => {
    resizeCanvas()
    // Resize on window resize to keep canvas crisp
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    isDrawing.current = true
    hasStrokes.current = true
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.nativeEvent, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [getPos])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.nativeEvent, canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [getPos])

  const handleMouseUp = useCallback(() => {
    isDrawing.current = false
  }, [])

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
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
  }, [getPos])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas || !e.touches[0]) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e.touches[0], canvas)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [getPos])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    isDrawing.current = false
  }, [])

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
      hasStrokes.current = false
    },
    toDataURL() {
      if (!hasStrokes.current) return null
      return canvasRef.current?.toDataURL('image/png') ?? null
    },
    isEmpty() {
      return !hasStrokes.current
    },
  }))

  return (
    <canvas
      ref={canvasRef}
      style={{ height, touchAction: 'none' }}
      className={`w-full border border-gray-300 rounded-lg bg-white cursor-crosshair ${className ?? ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />
  )
})

export default SignaturePad
