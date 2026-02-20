import { jsPDF } from 'jspdf'
import { DailyReportContent } from '@/types'

/** Fetch an image URL and return a base64 data URL + format string for jsPDF. */
async function urlToBase64(url: string): Promise<{ data: string; format: 'JPEG' | 'PNG' }> {
  const res = await fetch(url)
  const blob = await res.blob()
  const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG'
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ data: reader.result as string, format })
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const AMBER: [number, number, number] = [180, 93, 0]       // amber-700 for text
const AMBER_BG: [number, number, number] = [254, 243, 199]  // amber-100 for backgrounds
const DARK: [number, number, number] = [17, 24, 39]         // gray-900
const MED: [number, number, number] = [107, 114, 128]       // gray-500
const LIGHT_BG: [number, number, number] = [249, 250, 251]  // gray-50

export async function generateReportPdf(
  content: DailyReportContent,
  photoUrls: string[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const PW = doc.internal.pageSize.getWidth()   // 215.9
  const PH = doc.internal.pageSize.getHeight()  // 279.4
  const M = 18      // margin
  const CW = PW - M * 2  // content width ~179.9
  let y = M

  // ─── helpers ──────────────────────────────────────────────────────────────

  function checkPage(needed = 20) {
    if (y + needed > PH - M) {
      doc.addPage()
      y = M
    }
  }

  function sectionBar(title: string) {
    checkPage(14)
    doc.setFillColor(...AMBER_BG)
    doc.rect(M, y, CW, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...AMBER)
    doc.text(title, M + 3, y + 5.5)
    y += 11
  }

  function labelValue(label: string, value: string, xOffset = 0) {
    if (!value) return
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...MED)
    doc.text(label, M + xOffset, y)
    y += 4.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...DARK)
    const lines = doc.splitTextToSize(value, CW - xOffset - 4)
    lines.forEach((line: string) => {
      checkPage(6)
      doc.text(line, M + xOffset, y)
      y += 5.5
    })
    y += 2
  }

  // ─── HEADER ───────────────────────────────────────────────────────────────

  // Title block background
  doc.setFillColor(...LIGHT_BG)
  doc.rect(M, y, CW, 26, 'F')

  // "DAILY FIELD REPORT" – large title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...DARK)
  doc.text('DAILY FIELD REPORT', M + 4, y + 10)

  // Amber accent bar under title text
  doc.setFillColor(...AMBER)
  doc.rect(M + 4, y + 12, 70, 1, 'F')

  // Date – top right
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MED)
  const displayDate = content.date
    ? new Date(content.date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'
  doc.text(displayDate, PW - M - 4, y + 8, { align: 'right' })

  // Project + address
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...MED)
  doc.text('PROJECT', M + 4, y + 19)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...DARK)
  doc.text(content.project_name || '—', M + 22, y + 19)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...MED)
  doc.text('ADDRESS', M + 4, y + 25)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...DARK)
  doc.text(content.address || '—', M + 22, y + 25)

  y += 30

  // ─── CREW ─────────────────────────────────────────────────────────────────

  sectionBar('CREW')

  // Three-column crew row
  const colW = CW / 3
  const crewItems = [
    { label: 'REPORTED BY', value: content.reported_by },
    { label: 'PROJECT FOREMAN', value: content.project_foreman },
    { label: 'WEATHER', value: content.weather },
  ]
  const crewRowY = y
  crewItems.forEach(({ label, value }, i) => {
    const x = M + i * colW
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(label, x, crewRowY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...DARK)
    const lines = doc.splitTextToSize(value || '—', colW - 5)
    lines.forEach((line: string, li: number) => {
      doc.text(line, x, crewRowY + 5 + li * 5)
    })
  })
  y = crewRowY + 16

  // ─── PROGRESS ─────────────────────────────────────────────────────────────

  sectionBar('PROGRESS')

  const progressItems = [
    { label: 'PROGRESS', value: content.progress },
    { label: 'DELAYS', value: content.delays },
    { label: 'SAFETY', value: content.safety },
    { label: 'MATERIALS USED', value: content.materials_used },
    { label: 'EMPLOYEES', value: content.employees },
  ]
  for (const item of progressItems) {
    if (!item.value) continue
    checkPage(18)
    labelValue(item.label, item.value)
    // subtle divider between fields
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.2)
    doc.line(M, y - 1, M + CW, y - 1)
    y += 1
  }

  // ─── PHOTOS ───────────────────────────────────────────────────────────────

  if (photoUrls.length > 0) {
    checkPage(20)
    sectionBar('PHOTOS')

    const gap = 4
    const photoW = (CW - gap) / 2
    const photoH = photoW * 0.75  // 4:3 aspect

    let col = 0
    let rowY = y

    for (const url of photoUrls) {
      try {
        const { data, format } = await urlToBase64(url)
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
    doc.setDrawColor(...AMBER_BG)
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
