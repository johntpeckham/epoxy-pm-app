import { jsPDF } from 'jspdf'
import { TimecardContent } from '@/types'

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

// Color palette (blue theme for timecards)
const BLUE: [number, number, number] = [37, 99, 235]          // blue-600
const BLUE_DARK: [number, number, number] = [30, 64, 175]     // blue-800
const BLUE_LIGHT: [number, number, number] = [219, 234, 254]  // blue-100
const DARK: [number, number, number] = [17, 24, 39]           // gray-900
const LABEL_GRAY: [number, number, number] = [75, 85, 99]     // gray-600
const MED: [number, number, number] = [107, 114, 128]         // gray-500

export async function generateTimecardPdf(
  content: TimecardContent,
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
    doc.setTextColor(...BLUE)
    doc.text(title, M, y)
    y += 2.5
    doc.setDrawColor(...BLUE_LIGHT)
    doc.setLineWidth(0.4)
    doc.line(M, y, M + CW, y)
    y += 5
  }

  function fieldRow(label: string, value: string) {
    if (!value) return
    checkPage(10)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(label, M, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...DARK)
    doc.text(value, M + 54, y)
    y += 6
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
  doc.text('Timecard', M, headerStartY + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MED)
  doc.text(content.project_name || '—', M, headerStartY + 14)

  const textBottomY = headerStartY + 16
  y = Math.max(logoBottomY, textBottomY) + 4

  doc.setDrawColor(...BLUE)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 4

  // ─── PROJECT DETAILS ──────────────────────────────────────────────────
  sectionTitle('TIMECARD DETAILS')

  const displayDate = content.date
    ? new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

  fieldRow('Project Name', content.project_name || '—')
  fieldRow('Date', displayDate)
  fieldRow('Address', content.address || '—')
  fieldRow('Employees', `${content.entries.length}`)
  fieldRow('Grand Total', `${content.grand_total_hours.toFixed(2)} hours`)

  // ─── EMPLOYEE TABLE ────────────────────────────────────────────────────
  sectionTitle('EMPLOYEE TIME LOG')

  const colX = [M, M + 55, M + 80, M + 105, M + 130, M + CW]
  const colW = [55, 25, 25, 25, CW - 130]

  // Table header
  checkPage(8)
  doc.setFillColor(...BLUE_LIGHT)
  doc.rect(M, y - 3, CW, 7, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...BLUE_DARK)
  doc.text('EMPLOYEE', colX[0] + 2, y)
  doc.text('TIME IN', colX[1] + 2, y)
  doc.text('TIME OUT', colX[2] + 2, y)
  doc.text('LUNCH', colX[3] + 2, y)
  doc.text('HOURS', colX[4] + 2, y)
  y += 6

  // Table rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  for (let i = 0; i < content.entries.length; i++) {
    checkPage(8)
    const entry = content.entries[i]

    // Zebra stripe
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252) // gray-50
      doc.rect(M, y - 3.5, CW, 6.5, 'F')
    }

    doc.setTextColor(...DARK)
    doc.setFont('helvetica', 'normal')
    doc.text(entry.employee_name, colX[0] + 2, y)

    doc.setTextColor(...LABEL_GRAY)
    doc.text(entry.time_in, colX[1] + 2, y)
    doc.text(entry.time_out, colX[2] + 2, y)
    doc.text(`${entry.lunch_minutes} min`, colX[3] + 2, y)

    doc.setTextColor(...DARK)
    doc.setFont('helvetica', 'bold')
    doc.text(entry.total_hours.toFixed(2), colX[4] + 2, y)

    y += 6
  }

  // Grand total row
  checkPage(10)
  y += 1
  doc.setDrawColor(...BLUE)
  doc.setLineWidth(0.4)
  doc.line(M, y - 3, M + CW, y - 3)
  doc.setFillColor(...BLUE_LIGHT)
  doc.rect(M, y - 2, CW, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BLUE_DARK)
  doc.text('GRAND TOTAL', colX[0] + 2, y + 2.5)
  doc.text(`${content.grand_total_hours.toFixed(2)} hours`, colX[4] + 2, y + 2.5)
  y += 10

  // ─── FOOTER ───────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = PH - 10
    doc.setDrawColor(...BLUE_LIGHT)
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

  const safeName = (content.project_name || 'timecard').replace(/[^a-z0-9]/gi, '-').toLowerCase()
  doc.save(`timecard-${safeName}-${content.date || 'draft'}.pdf`)
}
