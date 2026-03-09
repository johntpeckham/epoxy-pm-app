import { jsPDF } from 'jspdf'
import { CalendarEvent } from '@/types'

/** Fetch an image URL and return a base64 data URL, format, and natural dimensions. */
async function loadImage(url: string): Promise<{
  data: string
  format: 'JPEG' | 'PNG'
  width: number
  height: number
}> {
  const res = await fetch(url)
  const blob = await res.blob()
  const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG'
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  const img = document.createElement('img')
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = data
  })
  return { data, format, width: img.naturalWidth, height: img.naturalHeight }
}

// Color palette — amber theme to match Calendar tab styling
const AMBER: [number, number, number] = [180, 83, 9]            // amber-700
const AMBER_DARK: [number, number, number] = [146, 64, 14]      // amber-800
const AMBER_LIGHT: [number, number, number] = [254, 243, 199]   // amber-100
const DARK: [number, number, number] = [17, 24, 39]             // gray-900
const LABEL_GRAY: [number, number, number] = [75, 85, 99]       // gray-600
const MED: [number, number, number] = [107, 114, 128]           // gray-500

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function countDuration(start: string, end: string, includeWeekends: boolean): number {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const day = cur.getDay()
    if (includeWeekends || (day !== 0 && day !== 6)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(count, 1)
}

export async function generateCalendarPdf(
  monthLabel: string,
  events: CalendarEvent[],
  logoUrl?: string | null
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 20
  const CW = PW - M * 2
  let y = M

  function checkPage(needed = 20) {
    if (y + needed > PH - M) {
      doc.addPage()
      y = M
    }
  }

  function sectionTitle(title: string) {
    checkPage(14)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...AMBER)
    doc.text(title, M, y)
    y += 2.5
    doc.setDrawColor(...AMBER_LIGHT)
    doc.setLineWidth(0.4)
    doc.line(M, y, M + CW, y)
    y += 5
  }

  // ─── HEADER ───────────────────────────────────────────────────────────────
  const LOGO_MAX_W = 40
  const LOGO_MAX_H = 20
  const headerStartY = y
  let logoBottomY = headerStartY
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl)
      const ratio = Math.min(LOGO_MAX_W / logo.width, LOGO_MAX_H / logo.height)
      const drawW = logo.width * ratio
      const drawH = logo.height * ratio
      doc.addImage(logo.data, logo.format, PW - M - drawW, headerStartY, drawW, drawH)
      logoBottomY = headerStartY + drawH
    } catch {
      // skip logo if it fails to load
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...DARK)
  doc.text('Calendar', M, headerStartY + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MED)
  doc.text(monthLabel, M, headerStartY + 14)

  const textBottomY = headerStartY + 16
  y = Math.max(logoBottomY, textBottomY) + 4

  doc.setDrawColor(...AMBER)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 4

  // ─── EVENTS TABLE ────────────────────────────────────────────────────────

  const sorted = [...events].sort((a, b) => a.start_date.localeCompare(b.start_date))

  sectionTitle(`SCHEDULED PROJECTS (${sorted.length})`)

  // Table header
  const COL_PROJECT = M
  const COL_DATES = M + 55
  const COL_DURATION = M + 115
  const COL_CREW = M + 135

  checkPage(8)
  doc.setFillColor(...AMBER_LIGHT)
  doc.rect(M, y - 3, CW, 7, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...AMBER_DARK)
  doc.text('PROJECT', COL_PROJECT + 2, y)
  doc.text('DATES', COL_DATES + 2, y)
  doc.text('DAYS', COL_DURATION + 2, y)
  doc.text('CREW', COL_CREW + 2, y)
  y += 6

  doc.setFontSize(8.5)

  for (let i = 0; i < sorted.length; i++) {
    const evt = sorted[i]
    const rowHeight = evt.notes ? 12 : 6.5
    checkPage(rowHeight + 2)

    // Zebra stripe
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(M, y - 3.5, CW, rowHeight, 'F')
    }

    // Color dot
    if (evt.color) {
      const hex = evt.color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      doc.setFillColor(r, g, b)
      doc.circle(COL_PROJECT + 3.5, y - 1, 1.5, 'F')
    }

    // Project name
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    const nameLines = doc.splitTextToSize(evt.project_name, COL_DATES - COL_PROJECT - 10)
    doc.text(nameLines[0], COL_PROJECT + 8, y)

    // Dates
    const startShort = new Date(evt.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const endShort = new Date(evt.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...LABEL_GRAY)
    doc.text(`${startShort} – ${endShort}`, COL_DATES + 2, y)

    // Duration
    const dur = countDuration(evt.start_date, evt.end_date, evt.include_weekends)
    doc.text(`${dur}${evt.include_weekends ? '' : ' wd'}`, COL_DURATION + 2, y)

    // Crew
    if (evt.crew) {
      const crewLines = doc.splitTextToSize(evt.crew, PW - M - COL_CREW - 4)
      doc.text(crewLines[0], COL_CREW + 2, y)
    }

    // Notes (below)
    if (evt.notes) {
      doc.setFontSize(7.5)
      doc.setTextColor(...MED)
      const noteLines = doc.splitTextToSize(evt.notes, CW - 10)
      doc.text(noteLines[0], COL_PROJECT + 8, y + 5)
      doc.setFontSize(8.5)
    }

    y += rowHeight
  }

  // ─── SUMMARY ─────────────────────────────────────────────────────────────
  if (sorted.length > 0) {
    checkPage(12)
    y += 2
    doc.setDrawColor(...AMBER)
    doc.setLineWidth(0.4)
    doc.line(M, y, M + CW, y)
    y += 6

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...LABEL_GRAY)
    doc.text('TOTAL', M, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MED)
    doc.text(`${sorted.length} project${sorted.length !== 1 ? 's' : ''} scheduled`, M + 25, y)
  }

  // ─── FOOTER ───────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = PH - 10
    doc.setDrawColor(...AMBER_LIGHT)
    doc.setLineWidth(0.4)
    doc.line(M, footerY - 4, PW - M, footerY - 4)

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(
      `Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      M,
      footerY
    )
    if (totalPages > 1) {
      doc.text(`Page ${p} of ${totalPages}`, PW - M, footerY, { align: 'right' })
    }
  }

  const safeMonth = monthLabel.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  doc.save(`calendar-${safeMonth}.pdf`)
}
