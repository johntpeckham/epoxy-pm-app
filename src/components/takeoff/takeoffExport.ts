import type { TakeoffPage, TakeoffItem, Point } from './types'
import jsPDF from 'jspdf'

// ─── Lazy pdfjs (same approach as TakeoffViewer) ───
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

// ─── Helpers ───

function fmtFtIn(ft: number): string {
  const f = Math.floor(ft)
  const i = Math.round((ft - f) * 12)
  if (i === 12) return `${f + 1}'-0"`
  return `${f}'-${i}"`
}

function fmtArea(sf: number): string {
  return sf >= 1000 ? `${sf.toLocaleString('en-US', { maximumFractionDigits: 0 })} sq ft` : `${sf.toFixed(1)} sq ft`
}

function polylineLen(pts: Point[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  return len
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ─── Render a PDF page to a canvas at EXPORT_SCALE ───

const EXPORT_SCALE = 2

async function renderPdfPageToCanvas(
  page: TakeoffPage
): Promise<{ canvas: HTMLCanvasElement; rawW: number; rawH: number }> {
  const pdfjs = await getPdfjs()
  const buf = page.arrayBuffer ?? (page.pdfBase64 ? base64ToArrayBuffer(page.pdfBase64) : null)
  if (!buf) throw new Error('No PDF data for page')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
  const pdfPage = await doc.getPage(page.pageIndex + 1)
  const rawVp = pdfPage.getViewport({ scale: 1 })
  const viewport = pdfPage.getViewport({ scale: EXPORT_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
  return { canvas, rawW: rawVp.width, rawH: rawVp.height }
}

// ─── Coordinate mapping ───
//
// Measurement points are stored in "canvas CSS space":
//   storedX ∈ [0, canvasSize.w]  where canvasSize.w = rawPdfW * fitScale
//   fitScale = min(containerW / rawPdfW, containerH / rawPdfH) * 0.92
//
// To draw on the export canvas (rawPdfW * EXPORT_SCALE pixels wide):
//   1. Normalize: normalizedX = storedX / canvasSize.w   (range 0..1)
//   2. Scale:     exportX = normalizedX * exportCanvasW
//   Combined:     exportX = storedX * (exportCanvasW / canvasSize.w)
//                         = storedX * scaleFactor
//
// canvasSize.w is provided by pageRenderedSizes (stored when viewer renders).
// When not available (legacy data), we estimate the viewer container dimensions
// from the current window size, matching the TakeoffViewer layout:
//   - Viewer overlay starts at left-56 (224px) on lg screens
//   - Measurement sidebar is 260px wide
//   - Toolbar is ~36px tall
//   - Canvas container is the remaining space

function estimateCanvasSize(rawW: number, rawH: number): { w: number; h: number } {
  // Estimate what the viewer container dimensions would be.
  // Viewer layout: fixed overlay from left:224px, contains toolbar + (canvas + 260px sidebar)
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1400
  const winH = typeof window !== 'undefined' ? window.innerHeight : 900
  const containerW = Math.max(400, winW - 224 - 260)
  const containerH = Math.max(300, winH - 100) // toolbar + banners
  const fitScale = Math.min(containerW / rawW, containerH / rawH) * 0.92
  return { w: rawW * fitScale, h: rawH * fitScale }
}

function computeScaleFactor(
  rawW: number,
  rawH: number,
  storedCanvasSize: { w: number; h: number } | undefined,
): number {
  const exportW = rawW * EXPORT_SCALE
  const canvasW = (storedCanvasSize && storedCanvasSize.w > 0)
    ? storedCanvasSize.w
    : estimateCanvasSize(rawW, rawH).w
  return exportW / canvasW
}

// ─── Draw measurements onto a canvas ───

function drawMeasurementsOnCanvas(
  ctx: CanvasRenderingContext2D,
  items: TakeoffItem[],
  pageKey: string,
  sf: number, // scaleFactor: storedCoord * sf = exportCoord
) {
  const sw = Math.max(2, 2 * sf)
  const fontSize = Math.max(12, 12 * sf)
  const cr = Math.max(4, 4 * sf)

  for (const item of items) {
    for (const m of item.measurements) {
      if (m.pageKey !== pageKey) continue
      const color = item.color
      const rgb = hexToRgb(color)

      if (m.type === 'linear' && m.points.length >= 2) {
        const pts = m.points.map(p => ({ x: p.x * sf, y: p.y * sf }))

        // Draw polyline
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.strokeStyle = color
        ctx.lineWidth = sw
        ctx.stroke()

        // Draw points
        for (const p of pts) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, cr, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }

        // Label at midpoint
        if (m.label) {
          const totalLen = polylineLen(pts)
          let midPt = pts[0]
          if (totalLen > 0) {
            const halfLen = totalLen / 2
            let accum = 0
            for (let si = 1; si < pts.length; si++) {
              const segLen = Math.hypot(pts[si].x - pts[si - 1].x, pts[si].y - pts[si - 1].y)
              if (accum + segLen >= halfLen) {
                const t = (halfLen - accum) / segLen
                midPt = { x: pts[si - 1].x + (pts[si].x - pts[si - 1].x) * t, y: pts[si - 1].y + (pts[si].y - pts[si - 1].y) * t }
                break
              }
              accum += segLen
            }
          }
          drawLabel(ctx, m.label, midPt.x, midPt.y, fontSize)
        }
      } else if (m.type === 'area' && m.points.length >= 3) {
        const pts = m.points.map(p => ({ x: p.x * sf, y: p.y * sf }))

        // Fill polygon
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.closePath()
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = sw
        ctx.stroke()

        // Label at center
        const center = {
          x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
          y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
        }
        const lines: string[] = []
        if (m.label) lines.push(m.label)
        if (m.perimeterFt) lines.push(`Perim: ${fmtFtIn(m.perimeterFt)}`)
        if (lines.length) drawLabel(ctx, lines.join(' | '), center.x, center.y, fontSize)
      } else if (m.type === 'area' && m.points.length === 2) {
        // Legacy 2-point rect
        const [a, b] = m.points.map(p => ({ x: p.x * sf, y: p.y * sf }))
        ctx.beginPath()
        ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = sw
        ctx.stroke()

        if (m.label) {
          drawLabel(ctx, m.label, (a.x + b.x) / 2, (a.y + b.y) / 2, fontSize)
        }
      }
    }
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontSize: number) {
  ctx.font = `bold ${fontSize}px sans-serif`
  const metrics = ctx.measureText(text)
  const pad = 6
  const w = metrics.width + pad * 2
  const h = fontSize + pad * 2
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 4)
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ─── Draw a legend in the bottom-right corner ───

function drawLegend(
  ctx: CanvasRenderingContext2D,
  items: TakeoffItem[],
  pageKey: string,
  canvasW: number,
  canvasH: number,
) {
  // Filter items that have measurements on this page
  const pageItems = items
    .map(item => {
      const pageMeasurements = item.measurements.filter(m => m.pageKey === pageKey)
      if (pageMeasurements.length === 0) return null
      const total = pageMeasurements.reduce((s, m) => s + m.valueInFeet, 0)
      return { name: item.name, color: item.color, type: item.type, total }
    })
    .filter(Boolean) as { name: string; color: string; type: string; total: number }[]

  if (pageItems.length === 0) return

  const fontSize = 14
  const lineHeight = 22
  const padding = 12
  const dotSize = 8
  const legendW = 240
  const legendH = padding * 2 + pageItems.length * lineHeight + 20 // 20 for title

  const x = canvasW - legendW - 16
  const y = canvasH - legendH - 16

  // Background
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  roundRect(ctx, x, y, legendW, legendH, 8)
  ctx.fill()
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  roundRect(ctx, x, y, legendW, legendH, 8)
  ctx.stroke()

  // Title
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.fillStyle = '#111'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('Measurements', x + padding, y + padding)

  // Items
  ctx.font = `${fontSize - 1}px sans-serif`
  pageItems.forEach((item, i) => {
    const iy = y + padding + 20 + i * lineHeight

    // Color dot
    ctx.beginPath()
    ctx.arc(x + padding + dotSize / 2, iy + dotSize / 2 + 2, dotSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = item.color
    ctx.fill()

    // Name
    ctx.fillStyle = '#374151'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(item.name, x + padding + dotSize + 8, iy + 1)

    // Value
    const valueText = item.type === 'linear' ? fmtFtIn(item.total) : fmtArea(item.total)
    ctx.fillStyle = '#6b7280'
    ctx.textAlign = 'right'
    ctx.fillText(valueText, x + legendW - padding, iy + 1)
  })
}

// ─── Render a page with measurements to a data URL ───

async function renderPageComposite(
  page: TakeoffPage,
  items: TakeoffItem[],
  pageKey: string,
  storedCanvasSize: { w: number; h: number } | undefined,
): Promise<{ dataUrl: string; rawW: number; rawH: number; exportW: number; exportH: number }> {
  const { canvas, rawW, rawH } = await renderPdfPageToCanvas(page)
  const exportW = canvas.width
  const exportH = canvas.height
  const sf = computeScaleFactor(rawW, rawH, storedCanvasSize)

  const ctx = canvas.getContext('2d')!
  drawMeasurementsOnCanvas(ctx, items, pageKey, sf)
  drawLegend(ctx, items, pageKey, exportW, exportH)

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), rawW, rawH, exportW, exportH }
}

// ─── Export single page PDF ───

export async function exportSinglePage(
  page: TakeoffPage,
  items: TakeoffItem[],
  pageKey: string,
  storedCanvasSize: { w: number; h: number } | undefined,
  projectName: string,
): Promise<{ blob: Blob; filename: string }> {
  const { dataUrl, rawW, rawH } = await renderPageComposite(
    page, items, pageKey, storedCanvasSize,
  )

  const orientation = rawW > rawH ? 'landscape' : 'portrait'
  const doc = new jsPDF({ orientation, unit: 'pt', format: [rawW, rawH] })
  doc.addImage(dataUrl, 'JPEG', 0, 0, rawW, rawH)

  const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-') || 'takeoff'
  const filename = `${safeName}-page-${page.pageIndex + 1}.pdf`
  return { blob: doc.output('blob'), filename }
}

// ─── Export full report PDF ───

export async function exportFullReport(
  projectName: string,
  pages: TakeoffPage[],
  items: TakeoffItem[],
  pageScales: Record<string, number>,
  pageRenderedSizes: Record<string, { w: number; h: number }>,
): Promise<{ blob: Blob; filename: string }> {
  const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-') || 'takeoff'
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()

  // ─── Page 1: Summary ───
  const margin = 40
  let cy = margin

  // Title
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('Takeoff Report', margin, cy + 22)
  cy += 36

  // Project name
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(projectName, margin, cy + 14)
  cy += 24

  // Date
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, cy + 10)
  cy += 16

  // Scale info
  const scaleEntries = Object.entries(pageScales)
  if (scaleEntries.length > 0) {
    const ppf = scaleEntries[0][1]
    const scaleText = `Scale: 1in = ${(ppf / 12).toFixed(1)}ft`
    doc.text(scaleText, margin, cy + 10)
    cy += 16
  }

  cy += 12

  // ─── Measurement items table ───
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('Measurement Items', margin, cy + 12)
  cy += 24

  // Table header
  const colX = { color: margin, name: margin + 24, type: margin + 240, count: margin + 340, total: margin + 440 }
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('Color', colX.color, cy + 9)
  doc.text('Item Name', colX.name, cy + 9)
  doc.text('Type', colX.type, cy + 9)
  doc.text('Measurements', colX.count, cy + 9)
  doc.text('Total', colX.total, cy + 9)
  cy += 16
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, cy, pw - margin, cy)
  cy += 6

  // Table rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  for (const item of items) {
    if (cy > ph - margin - 20) {
      doc.addPage()
      cy = margin
    }
    const total = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)
    const rgb = hexToRgb(item.color)

    // Color dot
    doc.setFillColor(rgb.r, rgb.g, rgb.b)
    doc.circle(colX.color + 5, cy + 5, 4, 'F')

    // Name
    doc.setTextColor(30, 30, 30)
    doc.text(item.name, colX.name, cy + 9)

    // Type
    doc.setTextColor(100, 100, 100)
    doc.text(item.type === 'linear' ? 'Linear' : 'Area', colX.type, cy + 9)

    // Count
    doc.text(`${item.measurements.length}`, colX.count, cy + 9)

    // Total
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(item.type === 'linear' ? fmtFtIn(total) : fmtArea(total), colX.total, cy + 9)
    doc.setFont('helvetica', 'normal')

    cy += 22
  }

  // Totals row
  cy += 6
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, cy, pw - margin, cy)
  cy += 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)

  const totalLinear = items.filter(i => i.type === 'linear').reduce((s, i) => s + i.measurements.reduce((a, m) => a + m.valueInFeet, 0), 0)
  const totalAreaVal = items.filter(i => i.type === 'area').reduce((s, i) => s + i.measurements.reduce((a, m) => a + m.valueInFeet, 0), 0)

  if (totalLinear > 0) {
    doc.setTextColor(30, 30, 30)
    doc.text(`Total Linear: ${fmtFtIn(totalLinear)}`, margin, cy + 11)
    cy += 20
  }
  if (totalAreaVal > 0) {
    doc.setTextColor(30, 30, 30)
    doc.text(`Total Area: ${fmtArea(totalAreaVal)}`, margin, cy + 11)
    cy += 20
  }

  // ─── Pages 2+: Plan pages with measurements ───
  for (const page of pages) {
    const pageKey = `${page.pdfIndex}-${page.pageIndex}`
    try {
      const { dataUrl, rawW, rawH } = await renderPageComposite(
        page, items, pageKey, pageRenderedSizes[pageKey],
      )

      // Fit to letter landscape with margins
      const availW = pw - margin * 2
      const availH = ph - margin * 2
      const fitScale = Math.min(availW / rawW, availH / rawH)
      const imgW = rawW * fitScale
      const imgH = rawH * fitScale
      const imgX = margin + (availW - imgW) / 2
      const imgY = margin + (availH - imgH) / 2

      doc.addPage()
      doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH)

      // Page label at top
      const displayName = page.displayName || `Page ${page.pageIndex + 1}`
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(120, 120, 120)
      doc.text(displayName, margin, margin - 8)
    } catch {
      // Skip pages that fail to render
      doc.addPage()
      doc.setFontSize(12)
      doc.setTextColor(200, 50, 50)
      doc.text(`Failed to render page ${page.pageIndex + 1}`, margin, margin + 20)
    }
  }

  const filename = `${safeName}-takeoff-report.pdf`
  return { blob: doc.output('blob'), filename }
}

// ─── Generate full report as Blob (for uploading to Supabase) ───

export async function generateReportBlob(
  projectName: string,
  pages: TakeoffPage[],
  items: TakeoffItem[],
  pageScales: Record<string, number>,
  pageRenderedSizes: Record<string, { w: number; h: number }>,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()

  // ─── Page 1: Summary ───
  const margin = 40
  let cy = margin

  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('Takeoff Report', margin, cy + 22)
  cy += 36

  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(projectName, margin, cy + 14)
  cy += 24

  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, cy + 10)
  cy += 16

  const scaleEntries = Object.entries(pageScales)
  if (scaleEntries.length > 0) {
    const ppf = scaleEntries[0][1]
    const scaleText = `Scale: 1in = ${(ppf / 12).toFixed(1)}ft`
    doc.text(scaleText, margin, cy + 10)
    cy += 16
  }

  cy += 12

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('Measurement Items', margin, cy + 12)
  cy += 24

  const colX2 = { color: margin, name: margin + 24, type: margin + 240, count: margin + 340, total: margin + 440 }
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text('Color', colX2.color, cy + 9)
  doc.text('Item Name', colX2.name, cy + 9)
  doc.text('Type', colX2.type, cy + 9)
  doc.text('Measurements', colX2.count, cy + 9)
  doc.text('Total', colX2.total, cy + 9)
  cy += 16
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, cy, pw - margin, cy)
  cy += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  for (const item of items) {
    if (cy > ph - margin - 20) {
      doc.addPage()
      cy = margin
    }
    const total = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)
    const rgb = hexToRgb(item.color)

    doc.setFillColor(rgb.r, rgb.g, rgb.b)
    doc.circle(colX2.color + 5, cy + 5, 4, 'F')
    doc.setTextColor(30, 30, 30)
    doc.text(item.name, colX2.name, cy + 9)
    doc.setTextColor(100, 100, 100)
    doc.text(item.type === 'linear' ? 'Linear' : 'Area', colX2.type, cy + 9)
    doc.text(`${item.measurements.length}`, colX2.count, cy + 9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text(item.type === 'linear' ? fmtFtIn(total) : fmtArea(total), colX2.total, cy + 9)
    doc.setFont('helvetica', 'normal')
    cy += 22
  }

  cy += 6
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, cy, pw - margin, cy)
  cy += 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)

  const totalLinear2 = items.filter(i => i.type === 'linear').reduce((s, i) => s + i.measurements.reduce((a, m) => a + m.valueInFeet, 0), 0)
  const totalAreaVal2 = items.filter(i => i.type === 'area').reduce((s, i) => s + i.measurements.reduce((a, m) => a + m.valueInFeet, 0), 0)

  if (totalLinear2 > 0) {
    doc.setTextColor(30, 30, 30)
    doc.text(`Total Linear: ${fmtFtIn(totalLinear2)}`, margin, cy + 11)
    cy += 20
  }
  if (totalAreaVal2 > 0) {
    doc.setTextColor(30, 30, 30)
    doc.text(`Total Area: ${fmtArea(totalAreaVal2)}`, margin, cy + 11)
    cy += 20
  }

  for (const page of pages) {
    const pageKey = `${page.pdfIndex}-${page.pageIndex}`
    try {
      const { dataUrl, rawW, rawH } = await renderPageComposite(
        page, items, pageKey, pageRenderedSizes[pageKey],
      )

      const availW = pw - margin * 2
      const availH = ph - margin * 2
      const fitScale = Math.min(availW / rawW, availH / rawH)
      const imgW = rawW * fitScale
      const imgH = rawH * fitScale
      const imgX = margin + (availW - imgW) / 2
      const imgY = margin + (availH - imgH) / 2

      doc.addPage()
      doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH)

      const displayName = page.displayName || `Page ${page.pageIndex + 1}`
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(120, 120, 120)
      doc.text(displayName, margin, margin - 8)
    } catch {
      doc.addPage()
      doc.setFontSize(12)
      doc.setTextColor(200, 50, 50)
      doc.text(`Failed to render page ${page.pageIndex + 1}`, margin, margin + 20)
    }
  }

  return doc.output('blob')
}
