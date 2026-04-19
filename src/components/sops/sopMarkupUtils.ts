export interface MarkupAnnotation {
  id: string
  type: 'arrow' | 'circle' | 'text' | 'freeform' | 'focus-rect' | 'focus-circle'
  color: string
  strokeWidth: number
  x1: number
  y1: number
  x2: number
  y2: number
  points?: number[][]
  text?: string
}

export interface MarkupData {
  blurIntensity: number
  annotations: MarkupAnnotation[]
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end'

export interface Handle {
  id: HandleId
  x: number
  y: number
}

export interface BBox {
  x: number
  y: number
  w: number
  h: number
}

export const MARKUP_COLORS = [
  '#000000', '#FFFFFF', '#E24B4A', '#EF9F27', '#FACC15',
  '#639922', '#378ADD', '#7F77DD', '#D4537E', '#1D9E75',
]

export const DEFAULT_BLUR_INTENSITY = 8
export const STROKE_WIDTHS = [2, 4, 8]

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

interface OldAnnotation {
  type: string
  points: number[][]
  strokeWidth: number
  text?: string
}

export function normalizeMarkupData(raw: unknown): MarkupData | null {
  if (!raw) return null
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null
    return {
      blurIntensity: DEFAULT_BLUR_INTENSITY,
      annotations: (raw as OldAnnotation[]).map(convertOldAnnotation),
    }
  }
  if (typeof raw === 'object' && raw !== null && 'annotations' in raw) {
    const d = raw as MarkupData
    if (!d.annotations || d.annotations.length === 0) return null
    return d
  }
  return null
}

function convertOldAnnotation(old: OldAnnotation): MarkupAnnotation {
  const base = { id: generateId(), color: '#f59e0b', strokeWidth: old.strokeWidth }
  const p = old.points
  if (old.type === 'arrow' && p.length >= 2) {
    return { ...base, type: 'arrow', x1: p[0][0], y1: p[0][1], x2: p[1][0], y2: p[1][1] }
  }
  if (old.type === 'circle' && p.length >= 2) {
    return { ...base, type: 'circle', x1: p[0][0], y1: p[0][1], x2: p[1][0], y2: p[1][1] }
  }
  if (old.type === 'text' && p.length >= 1) {
    return { ...base, type: 'text', x1: p[0][0], y1: p[0][1], x2: 0, y2: 0, text: old.text }
  }
  if (old.type === 'freeform' && p.length > 0) {
    const xs = p.map(pt => pt[0])
    const ys = p.map(pt => pt[1])
    return {
      ...base, type: 'freeform',
      x1: Math.min(...xs), y1: Math.min(...ys),
      x2: Math.max(...xs), y2: Math.max(...ys),
      points: p,
    }
  }
  return { ...base, type: 'freeform', x1: 0, y1: 0, x2: 0, y2: 0, points: p }
}

export function getBoundingBox(a: MarkupAnnotation): BBox {
  if (a.type === 'freeform' && a.points && a.points.length > 0) {
    const xs = a.points.map(p => p[0])
    const ys = a.points.map(p => p[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return { x: minX, y: minY, w: Math.max(...xs) - minX || 1, h: Math.max(...ys) - minY || 1 }
  }
  if (a.type === 'text' && a.text) {
    const fs = Math.max(14, a.strokeWidth * 6)
    const estW = Math.max(20, a.text.length * fs * 0.55)
    return { x: a.x1, y: a.y1 - fs, w: estW, h: fs + 4 }
  }
  const minX = Math.min(a.x1, a.x2)
  const minY = Math.min(a.y1, a.y2)
  return { x: minX, y: minY, w: Math.abs(a.x2 - a.x1) || 1, h: Math.abs(a.y2 - a.y1) || 1 }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export function hitTestAnnotation(a: MarkupAnnotation, px: number, py: number, tolerance = 8): boolean {
  const tol = tolerance + a.strokeWidth
  if (a.type === 'arrow') {
    return distToSegment(px, py, a.x1, a.y1, a.x2, a.y2) < tol
  }
  if (a.type === 'circle') {
    const cx = (a.x1 + a.x2) / 2, cy = (a.y1 + a.y2) / 2
    const rx = Math.abs(a.x2 - a.x1) / 2, ry = Math.abs(a.y2 - a.y1) / 2
    if (rx < 1 || ry < 1) return false
    const norm = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2
    return Math.abs(Math.sqrt(norm) - 1) * Math.min(rx, ry) < tol
  }
  if (a.type === 'text') {
    const bb = getBoundingBox(a)
    return px >= bb.x - 5 && px <= bb.x + bb.w + 5 && py >= bb.y - 5 && py <= bb.y + bb.h + 5
  }
  if (a.type === 'freeform' && a.points) {
    for (let i = 1; i < a.points.length; i++) {
      if (distToSegment(px, py, a.points[i - 1][0], a.points[i - 1][1], a.points[i][0], a.points[i][1]) < tol) return true
    }
    return false
  }
  return false
}

export function getHandles(a: MarkupAnnotation): Handle[] {
  if (a.type === 'arrow') {
    return [{ id: 'start', x: a.x1, y: a.y1 }, { id: 'end', x: a.x2, y: a.y2 }]
  }
  if (a.type === 'text') return []
  const bb = getBoundingBox(a)
  const { x, y, w, h } = bb
  if (a.type === 'freeform') {
    return [
      { id: 'nw', x, y }, { id: 'ne', x: x + w, y },
      { id: 'se', x: x + w, y: y + h }, { id: 'sw', x, y: y + h },
    ]
  }
  return [
    { id: 'nw', x, y }, { id: 'n', x: x + w / 2, y },
    { id: 'ne', x: x + w, y }, { id: 'e', x: x + w, y: y + h / 2 },
    { id: 'se', x: x + w, y: y + h }, { id: 's', x: x + w / 2, y: y + h },
    { id: 'sw', x, y: y + h }, { id: 'w', x, y: y + h / 2 },
  ]
}

export function hitTestHandle(handles: Handle[], px: number, py: number, tolerance = 8): HandleId | null {
  for (const h of handles) {
    if (Math.hypot(px - h.x, py - h.y) < tolerance) return h.id
  }
  return null
}

export function moveAnnotation(a: MarkupAnnotation, dx: number, dy: number): MarkupAnnotation {
  const moved = { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }
  if (a.type === 'freeform' && a.points) {
    moved.points = a.points.map(([x, y]) => [x + dx, y + dy])
  }
  return moved
}

export function resizeAnnotation(a: MarkupAnnotation, handleId: HandleId, px: number, py: number): MarkupAnnotation {
  if (a.type === 'arrow') {
    if (handleId === 'start') return { ...a, x1: px, y1: py }
    if (handleId === 'end') return { ...a, x2: px, y2: py }
    return a
  }
  if (a.type === 'text') return a

  const oldBB = getBoundingBox(a)
  let x = oldBB.x, y = oldBB.y, w = oldBB.w, h = oldBB.h

  switch (handleId) {
    case 'nw': w += x - px; h += y - py; x = px; y = py; break
    case 'n': h += y - py; y = py; break
    case 'ne': w = px - x; h += y - py; y = py; break
    case 'e': w = px - x; break
    case 'se': w = px - x; h = py - y; break
    case 's': h = py - y; break
    case 'sw': w += x - px; x = px; h = py - y; break
    case 'w': w += x - px; x = px; break
  }
  if (w < 5) w = 5
  if (h < 5) h = 5

  if (a.type === 'freeform' && a.points) {
    const scX = w / (oldBB.w || 1), scY = h / (oldBB.h || 1)
    return {
      ...a, x1: x, y1: y, x2: x + w, y2: y + h,
      points: a.points.map(([ppx, ppy]) => [x + (ppx - oldBB.x) * scX, y + (ppy - oldBB.y) * scY]),
    }
  }
  return { ...a, x1: x, y1: y, x2: x + w, y2: y + h }
}

function hasValidCoords(a: MarkupAnnotation): boolean {
  if (!isFinite(a.x1) || !isFinite(a.y1) || !isFinite(a.x2) || !isFinite(a.y2)) return false
  if (a.type === 'freeform' && a.points) {
    for (const p of a.points) {
      if (!isFinite(p[0]) || !isFinite(p[1])) return false
    }
  }
  return true
}

export function drawAnnotation(ctx: CanvasRenderingContext2D, a: MarkupAnnotation, sx: number, sy: number) {
  if (!hasValidCoords(a)) return
  ctx.save()
  try {
    ctx.strokeStyle = a.color
    ctx.fillStyle = a.color
    ctx.lineWidth = a.strokeWidth * sx
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (a.type === 'freeform' && a.points && a.points.length > 1) {
      const pts = a.points.map(([x, y]) => [x * sx, y * sy])
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.stroke()
    } else if (a.type === 'arrow') {
      const ax1 = a.x1 * sx, ay1 = a.y1 * sy, ax2 = a.x2 * sx, ay2 = a.y2 * sy
      ctx.beginPath()
      ctx.moveTo(ax1, ay1)
      ctx.lineTo(ax2, ay2)
      ctx.stroke()
      const angle = Math.atan2(ay2 - ay1, ax2 - ax1)
      const headLen = Math.max(10, ctx.lineWidth * 5)
      ctx.beginPath()
      ctx.moveTo(ax2, ay2)
      ctx.lineTo(ax2 - headLen * Math.cos(angle - Math.PI / 6), ay2 - headLen * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(ax2, ay2)
      ctx.lineTo(ax2 - headLen * Math.cos(angle + Math.PI / 6), ay2 - headLen * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    } else if (a.type === 'circle') {
      const cx = ((a.x1 + a.x2) / 2) * sx, cy = ((a.y1 + a.y2) / 2) * sy
      const rx = (Math.abs(a.x2 - a.x1) / 2) * sx, ry = (Math.abs(a.y2 - a.y1) / 2) * sy
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (a.type === 'text' && a.text) {
      const fs = Math.max(14, ctx.lineWidth * 6)
      ctx.font = `bold ${fs}px sans-serif`
      const metrics = ctx.measureText(a.text)
      const px = 4
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(a.x1 * sx - px, a.y1 * sy - fs - px, metrics.width + px * 2, fs + px * 2)
      ctx.fillStyle = a.color
      ctx.fillText(a.text, a.x1 * sx, a.y1 * sy)
    }
  } finally {
    ctx.restore()
  }
}

export function renderMarkupToCanvas(
  ctx: CanvasRenderingContext2D,
  markupData: MarkupData,
  _img: HTMLImageElement | null,
  sx: number, sy: number,
) {
  try {
    for (const a of markupData.annotations) {
      if (a.type === 'focus-rect' || a.type === 'focus-circle') continue
      drawAnnotation(ctx, a, sx, sy)
    }
  } catch {
    // Rendering failed — leave canvas transparent so the image underneath shows through
  }
}

export function drawSelectionHighlight(ctx: CanvasRenderingContext2D, a: MarkupAnnotation, sx: number, sy: number) {
  if (!hasValidCoords(a)) return
  const bb = getBoundingBox(a)
  ctx.save()
  try {
    ctx.strokeStyle = '#378ADD'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.strokeRect(bb.x * sx - 4, bb.y * sy - 4, bb.w * sx + 8, bb.h * sy + 8)
    ctx.setLineDash([])

    const handles = getHandles(a)
    for (const h of handles) {
      ctx.fillStyle = '#FFFFFF'
      ctx.strokeStyle = '#378ADD'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(h.x * sx, h.y * sy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  } finally {
    ctx.restore()
  }
}
