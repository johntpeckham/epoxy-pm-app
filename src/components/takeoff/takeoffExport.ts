import type { TakeoffPage, TakeoffItem, Point, TakeoffSection } from './types'
import {
  computeProjectTotals,
  computeTotals,
  groupItemsBySection,
  sortSections,
} from './sectionTotals'
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
  // Honor the page's embedded /Rotate hint. Both viewports use the rotated
  // dimensions so the export canvas, the jsPDF page format (rawW/rawH), and
  // the fit-scale math downstream all agree on the rotated orientation.
  const rawVp = pdfPage.getViewport({ scale: 1, rotation: pdfPage.rotate })
  const viewport = pdfPage.getViewport({ scale: EXPORT_SCALE, rotation: pdfPage.rotate })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
  return { canvas, rawW: rawVp.width, rawH: rawVp.height }
}

// ─── Coordinate mapping ───
//
// Measurement points are stored as NORMALIZED 0-1 coords relative to the PDF
// intrinsic page (coordVersion 2 in TakeoffClient.tsx).
// To draw on the export canvas (exportW × exportH px):
//   exportX = normalizedX * exportW
//   exportY = normalizedY * exportH
// Stroke widths / font sizes scale off `sf = exportW / 1000` so the visual
// weight of overlays scales with output resolution.

// ─── Draw measurements onto a canvas ───

function drawMeasurementsOnCanvas(
  ctx: CanvasRenderingContext2D,
  items: TakeoffItem[],
  pageKey: string,
  exportW: number,
  exportH: number,
) {
  const sx = exportW
  const sy = exportH
  const sf = exportW / 1000
  const sw = Math.max(2, 2 * sf)
  const fontSize = Math.max(12, 12 * sf)
  const cr = Math.max(4, 4 * sf)

  for (const item of items) {
    for (const m of item.measurements) {
      if (m.pageKey !== pageKey) continue
      const color = item.color
      const rgb = hexToRgb(color)

      if (m.type === 'linear' && m.points.length >= 2) {
        const pts = m.points.map(p => ({ x: p.x * sx, y: p.y * sy }))

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
        const pts = m.points.map(p => ({ x: p.x * sx, y: p.y * sy }))

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
        const [a, b] = m.points.map(p => ({ x: p.x * sx, y: p.y * sy }))
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
): Promise<{ dataUrl: string; rawW: number; rawH: number; exportW: number; exportH: number }> {
  const { canvas, rawW, rawH } = await renderPdfPageToCanvas(page)
  const exportW = canvas.width
  const exportH = canvas.height

  const ctx = canvas.getContext('2d')!
  drawMeasurementsOnCanvas(ctx, items, pageKey, exportW, exportH)
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
  void storedCanvasSize // accepted for backward-compatible signature; coords are normalized
  const { dataUrl, rawW, rawH } = await renderPageComposite(
    page, items, pageKey,
  )

  const orientation = rawW > rawH ? 'landscape' : 'portrait'
  const doc = new jsPDF({ orientation, unit: 'pt', format: [rawW, rawH] })
  doc.addImage(dataUrl, 'JPEG', 0, 0, rawW, rawH)

  const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-') || 'takeoff'
  const filename = `${safeName}-page-${page.pageIndex + 1}.pdf`
  return { blob: doc.output('blob'), filename }
}

// ─── Sectioned items table for the report ───
// Draws section headings, per-section item rows, per-section subtotals
// (TOTAL LINEAR + TOTAL AREA both always shown), and project totals at
// the bottom (PROJECT TOTAL LINEAR + PROJECT TOTAL AREA both always
// shown). Returns the new cy. Sections flow inline — no forced page
// breaks per section, but the row-fit check still inserts a page break
// when an individual row would overflow.

function drawSectionedItemsTable(
  doc: jsPDF,
  items: TakeoffItem[],
  sections: TakeoffSection[],
  margin: number,
  pw: number,
  ph: number,
  cyStart: number,
): number {
  const colX = { color: margin, name: margin + 24, type: margin + 240, count: margin + 340, total: margin + 440 }
  let cy = cyStart

  // Header row
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(107, 114, 128)
  doc.text('ITEM', colX.name, cy + 9)
  doc.text('TYPE', colX.type, cy + 9)
  doc.text('TOTAL', colX.total, cy + 9)
  cy += 16
  doc.setDrawColor(229, 231, 235)
  doc.line(margin, cy, pw - margin, cy)
  cy += 10

  const sortedSections = sortSections(sections)
  const grouped = groupItemsBySection(sortedSections, items)

  // If sections are empty (legacy / unknown), fall back to a single
  // implicit "Measurements" group covering all items so the table still
  // renders correctly.
  const renderGroups: Array<{ name: string; items: TakeoffItem[] }> =
    sortedSections.length > 0
      ? sortedSections.map((s) => ({
          name: s.name,
          items: grouped.get(s.id) ?? [],
        }))
      : [{ name: 'Measurements', items }]

  for (const group of renderGroups) {
    // Page-fit guard for the section heading + at least one row + subtotals.
    if (cy > ph - margin - 110) {
      doc.addPage()
      cy = margin
    }

    // Card geometry. Items always render expanded with one indented line
    // per individual measurement underneath the parent header row.
    const headerH = 24
    const rowH = 20
    const measurementH = 14
    const emptyH = 22
    const subtotalH = 30
    let bodyH = 0
    if (group.items.length === 0) {
      bodyH = emptyH
    } else {
      for (const it of group.items) {
        bodyH += rowH + it.measurements.length * measurementH + 4
      }
    }
    const cardH = headerH + bodyH + subtotalH

    // Card body — light fill behind everything so the rows + footer read as
    // a unified card. Border in gray-200 to match the UI section cards.
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(229, 231, 235) // gray-200
    doc.setLineWidth(0.5)
    doc.roundedRect(margin, cy, pw - 2 * margin, cardH, 4, 4, 'FD')
    doc.setLineWidth(1)

    const cardTop = cy

    // Amber-outlined section header rectangle — mirrors the PROJECT TOTALS
    // border color so the two amber outlines read as a consistent pair.
    doc.setDrawColor(253, 230, 138) // amber-200
    doc.setLineWidth(0.5)
    doc.roundedRect(margin + 4, cy + 3, pw - 2 * margin - 8, headerH - 6, 2, 2, 'S')
    doc.setLineWidth(1)

    // Amber accent bar to the left of the section name (3×16 pt).
    doc.setFillColor(245, 158, 11) // amber-500
    doc.rect(margin + 8, cy + 6, 3, 14, 'F')

    // Section heading (inside the card, 16pt bold-ish via fontSize 13).
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(30, 30, 30)
    doc.text(group.name, margin + 16, cy + 16)
    cy += headerH
    doc.setDrawColor(229, 231, 235) // gray-200
    doc.setLineWidth(0.5)
    doc.line(margin, cy, pw - margin, cy)
    doc.setLineWidth(1)

    // Rows + per-measurement detail lines.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (group.items.length === 0) {
      doc.setTextColor(160, 160, 160)
      doc.setFont('helvetica', 'italic')
      doc.text('No measurements in this section', colX.name, cy + 14)
      doc.setFont('helvetica', 'normal')
      cy += emptyH
    } else {
      for (const item of group.items) {
        const total = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)
        const rgb = hexToRgb(item.color)
        // Item header row: color dot + name + type + total
        doc.setFillColor(rgb.r, rgb.g, rgb.b)
        doc.circle(colX.color + 5, cy + 10, 4, 'F')
        doc.setTextColor(30, 30, 30)
        doc.setFont('helvetica', 'normal')
        doc.text(item.name, colX.name, cy + 13)
        doc.setTextColor(100, 100, 100)
        doc.text(item.type === 'linear' ? 'Linear' : 'Area', colX.type, cy + 13)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(180, 83, 9) // amber-700
        doc.text(item.type === 'linear' ? fmtFtIn(total) : fmtArea(total), colX.total, cy + 13)
        doc.setFont('helvetica', 'normal')
        cy += rowH

        // Per-measurement lines, indented under the item name.
        doc.setFontSize(9)
        doc.setTextColor(120, 120, 120)
        for (const m of item.measurements) {
          // Small grey bullet dot
          doc.setFillColor(180, 180, 180)
          doc.circle(colX.name + 6, cy + 6, 1.2, 'F')
          const valueText =
            m.type === 'area' ? fmtArea(m.valueInFeet) : fmtFtIn(m.valueInFeet)
          const detail =
            m.type === 'area' && m.perimeterFt
              ? `${valueText}  ·  ${fmtFtIn(m.perimeterFt)} perim`
              : valueText
          doc.text(detail, colX.name + 12, cy + 9)
          cy += measurementH
        }
        doc.setFontSize(10)
        cy += 4
      }
    }

    // Section subtotals — footer band darker than card body, edge-to-edge.
    doc.setFillColor(243, 244, 246) // gray-100
    doc.rect(margin + 0.25, cy + 0.25, pw - 2 * margin - 0.5, subtotalH - 0.5, 'F')
    doc.setDrawColor(229, 231, 235) // gray-200
    doc.setLineWidth(0.5)
    doc.line(margin, cy, pw - margin, cy)
    doc.setLineWidth(1)
    const sub = computeTotals(group.items)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(107, 114, 128) // gray-500
    doc.text(`TOTAL LINEAR`, margin + 12, cy + 18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(180, 83, 9) // amber-700
    doc.text(fmtFtIn(sub.linear), colX.type, cy + 18)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(107, 114, 128)
    doc.text(`TOTAL AREA`, colX.count, cy + 18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(180, 83, 9)
    doc.text(
      `${fmtArea(sub.area)}${sub.perim > 0 ? `  ·  ${fmtFtIn(sub.perim)} perim` : ''}`,
      colX.total,
      cy + 18
    )
    doc.setFont('helvetica', 'normal')
    cy = cardTop + cardH
    cy += 18 // gap between section cards
  }

  // Project totals — emphasized amber-tinted block.
  if (cy > ph - margin - 80) {
    doc.addPage()
    cy = margin
  }
  const projBlockH = 70
  doc.setFillColor(255, 251, 235) // amber-50
  doc.setDrawColor(253, 230, 138) // amber-200
  doc.setLineWidth(0.5)
  doc.roundedRect(margin, cy, pw - 2 * margin, projBlockH, 4, 4, 'FD')
  doc.setLineWidth(1)

  // Small-caps label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(180, 83, 9) // amber-700
  doc.text('PROJECT TOTALS', margin + 12, cy + 16)

  const proj = computeProjectTotals(items)
  // Linear row
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(55, 65, 81) // gray-700
  doc.text('Project Total Linear', margin + 12, cy + 36)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(217, 119, 6) // amber-600
  doc.text(fmtFtIn(proj.linear), pw - margin - 12, cy + 36, { align: 'right' })

  // Area row
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(55, 65, 81)
  doc.text('Project Total Area', margin + 12, cy + 56)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(217, 119, 6)
  const areaText = `${fmtArea(proj.area)}${proj.perim > 0 ? `  ·  ${fmtFtIn(proj.perim)} perim` : ''}`
  doc.text(areaText, pw - margin - 12, cy + 56, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setLineWidth(1)
  cy += projBlockH + 8
  return cy
}

// ─── Export full report PDF ───

export async function exportFullReport(
  projectName: string,
  pages: TakeoffPage[],
  items: TakeoffItem[],
  pageScales: Record<string, number>,
  pageRenderedSizes: Record<string, { w: number; h: number }>,
  sections: TakeoffSection[] = [],
): Promise<{ blob: Blob; filename: string }> {
  void pageRenderedSizes // accepted for signature compat; coords are normalized
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

  // ─── Measurement items table (sectioned) ───
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('Measurement Items', margin, cy + 12)
  cy += 24
  cy = drawSectionedItemsTable(doc, items, sections, margin, pw, ph, cy)

  // ─── Pages 2+: Plan pages with measurements ───
  for (const page of pages) {
    const pageKey = `${page.pdfIndex}-${page.pageIndex}`
    try {
      const { dataUrl, rawW, rawH } = await renderPageComposite(
        page, items, pageKey,
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
  sections: TakeoffSection[] = [],
): Promise<Blob> {
  void pageRenderedSizes // accepted for signature compat; coords are normalized
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
  cy = drawSectionedItemsTable(doc, items, sections, margin, pw, ph, cy)

  for (const page of pages) {
    const pageKey = `${page.pdfIndex}-${page.pageIndex}`
    try {
      const { dataUrl, rawW, rawH } = await renderPageComposite(
        page, items, pageKey,
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
