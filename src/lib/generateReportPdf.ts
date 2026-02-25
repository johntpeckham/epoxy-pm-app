import { jsPDF } from 'jspdf'
import { DailyReportContent } from '@/types'

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
  // Get natural dimensions to preserve aspect ratio
  const img = document.createElement('img')
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = data
  })
  return { data, format, width: img.naturalWidth, height: img.naturalHeight }
}

// Color palette — matches ProjectReportModal form styles
const AMBER: [number, number, number] = [180, 83, 9]          // amber-700  (section titles + header line)
const AMBER_LIGHT: [number, number, number] = [254, 243, 199] // amber-100  (section border)
const DARK: [number, number, number] = [17, 24, 39]           // gray-900   (values / title)
const LABEL_GRAY: [number, number, number] = [75, 85, 99]     // gray-600   (field labels)
const MED: [number, number, number] = [107, 114, 128]         // gray-500   (footer / meta)

export async function generateReportPdf(
  content: DailyReportContent,
  photoUrls: string[],
  logoUrl?: string | null
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const PW = doc.internal.pageSize.getWidth()   // 215.9
  const PH = doc.internal.pageSize.getHeight()  // 279.4
  const M = 20      // page margin
  const CW = PW - M * 2  // content width
  const LABEL_W = 50 // label column width for fieldRow
  const VALUE_X = M + LABEL_W + 4
  const VALUE_W = CW - LABEL_W - 6
  let y = M

  // ─── helpers ──────────────────────────────────────────────────────────────

  function checkPage(needed = 20) {
    if (y + needed > PH - M) {
      doc.addPage()
      y = M
    }
  }

  /** Section header — uppercase amber-700 text with amber-100 bottom border
   *  (matches ProjectReportModal: text-amber-700 border-b border-amber-100). */
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

  /** Two-column field row — label right-aligned, value left-aligned.
   *  Used for short fields (Date, Project, Address, Crew fields). */
  function fieldRow(label: string, value: string) {
    if (!value) return
    checkPage(10)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(label, M + LABEL_W - 2, y, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...DARK)
    const lines = doc.splitTextToSize(value, VALUE_W)
    lines.forEach((line: string, i: number) => {
      if (i > 0) checkPage(5)
      doc.text(line, VALUE_X, y)
      if (i < lines.length - 1) y += 4.5
    })
    y += 6
  }

  /** Paragraph block — bold label above, then wrapped value text below.
   *  Used for long-form fields (Progress, Delays, Safety, etc). */
  function paragraphBlock(label: string, value: string) {
    if (!value) return
    checkPage(14)

    // Bold label header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK)
    doc.text(label, M, y)
    y += 5

    // Wrapped value text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...DARK)
    const lines = doc.splitTextToSize(value, CW)
    lines.forEach((line: string) => {
      checkPage(5)
      doc.text(line, M, y)
      y += 4.5
    })
    y += 4
  }

  // ─── HEADER ───────────────────────────────────────────────────────────────
  // Title left, logo right (preserving aspect ratio), amber separator

  // Company logo – top right, preserving aspect ratio within 40×20mm
  // (matches ProjectReportModal: h-[75px] w-auto max-w-[150px] object-contain)
  const LOGO_MAX_W = 40  // ~150px
  const LOGO_MAX_H = 20  // ~75px
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl)
      const ratio = Math.min(LOGO_MAX_W / logo.width, LOGO_MAX_H / logo.height)
      const drawW = logo.width * ratio
      const drawH = logo.height * ratio
      doc.addImage(logo.data, logo.format, PW - M - drawW, y, drawW, drawH)
    } catch {
      // skip logo if it fails to load
    }
  }

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...DARK)
  doc.text('Daily Field Report', M, y + 8)

  // Project name subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MED)
  doc.text(content.project_name || '—', M, y + 14)

  y += 18

  // Amber horizontal separator
  doc.setDrawColor(...AMBER)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 4

  // ─── PROJECT DETAILS ────────────────────────────────────────────────────

  sectionTitle('PROJECT DETAILS')

  const displayDate = content.date
    ? new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

  fieldRow('Date', displayDate)
  fieldRow('Project', content.project_name || '—')
  fieldRow('Address', content.address || '—')

  // ─── CREW ─────────────────────────────────────────────────────────────────

  sectionTitle('CREW')

  fieldRow('Reported By', content.reported_by || '—')
  fieldRow('Project Foreman', content.project_foreman || '—')
  fieldRow('Weather', content.weather || '—')

  // ─── WORK SUMMARY ──────────────────────────────────────────────────────

  sectionTitle('WORK SUMMARY')

  paragraphBlock('Progress', content.progress || '')
  paragraphBlock('Delays', content.delays || '')
  paragraphBlock('Safety', content.safety || '')
  paragraphBlock('Materials Used', content.materials_used || '')
  paragraphBlock('Employees', content.employees || '')

  // ─── PHOTOS ───────────────────────────────────────────────────────────────

  if (photoUrls.length > 0) {
    sectionTitle('PHOTOS')

    const gap = 4
    const photoW = (CW - gap) / 2
    const photoH = photoW * 0.75  // 4:3 aspect

    let col = 0
    let rowY = y

    for (const url of photoUrls) {
      try {
        const { data, format } = await loadImage(url)
        const x = M + col * (photoW + gap)

        checkPage(photoH + 6)
        if (col === 0) rowY = y

        doc.addImage(data, format, x, rowY, photoW, photoH)

        col++
        if (col === 2) {
          col = 0
          y = rowY + photoH + gap
          rowY = y
        }
      } catch {
        // skip images that fail to load
      }
    }
    if (col > 0) {
      y = rowY + photoH + gap
    }
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

  const safeName = (content.project_name || 'report').replace(/[^a-z0-9]/gi, '-').toLowerCase()
  doc.save(`daily-report-${safeName}-${content.date || 'draft'}.pdf`)
}
