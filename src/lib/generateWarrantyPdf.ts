import { jsPDF } from 'jspdf'

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

// Black and white palette — matches existing report branding
const DARK: [number, number, number] = [17, 24, 39]          // gray-900
const LABEL_GRAY: [number, number, number] = [75, 85, 99]    // gray-600
const MED: [number, number, number] = [107, 114, 128]        // gray-500
const AMBER: [number, number, number] = [180, 83, 9]         // amber-700
const AMBER_LIGHT: [number, number, number] = [254, 243, 199] // amber-100

export async function generateWarrantyPdf(
  title: string,
  bodyText: string,
  signatureName: string | null,
  logoUrl?: string | null
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const PW = doc.internal.pageSize.getWidth()   // 215.9
  const PH = doc.internal.pageSize.getHeight()  // 279.4
  const M = 20
  const CW = PW - M * 2
  let y = M

  function checkPage(needed = 20) {
    if (y + needed > PH - M) {
      doc.addPage()
      y = M
    }
  }

  // ─── Header ──────────────────────────────────────────────────────────────

  // Company logo — top right (same pattern as generateReportPdf)
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl)
      const LOGO_MAX_W = 40
      const LOGO_MAX_H = 20
      const ratio = Math.min(LOGO_MAX_W / logo.width, LOGO_MAX_H / logo.height)
      const drawW = logo.width * ratio
      const drawH = logo.height * ratio
      doc.addImage(logo.data, logo.format, PW - M - drawW, y, drawW, drawH)
    } catch {
      // skip logo if it fails
    }
  }

  // Company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...DARK)
  doc.text('Peckham Coatings', M, y + 8)

  // Warranty title
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MED)
  doc.text(title, M, y + 14)

  y += 20

  // Amber separator line
  doc.setDrawColor(...AMBER)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 10

  // ─── Body Text ───────────────────────────────────────────────────────────

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)

  // Split body text into paragraphs and render with word wrapping
  const paragraphs = bodyText.split('\n')
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()

    if (!trimmed) {
      y += 4
      continue
    }

    // Check if this looks like a section header (ALL CAPS or ends with :)
    const isHeader = trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !/\d{4}/.test(trimmed)

    if (isHeader) {
      checkPage(14)
      y += 3
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...AMBER)
      doc.text(trimmed, M, y)
      y += 2
      doc.setDrawColor(...AMBER_LIGHT)
      doc.setLineWidth(0.3)
      doc.line(M, y, M + CW, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...DARK)
      continue
    }

    // Regular paragraph — word wrap
    const lines = doc.splitTextToSize(trimmed, CW) as string[]
    for (const line of lines) {
      checkPage(8)
      doc.text(line, M, y)
      y += 5
    }
    y += 2
  }

  // ─── Signature ───────────────────────────────────────────────────────────

  if (signatureName) {
    checkPage(35)
    y += 15

    // Signature line
    const SIG_LINE_W = 80
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.3)
    doc.line(M, y, M + SIG_LINE_W, y)
    y += 2

    // Signature in cursive style — use helvetica italic as approximation
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(16)
    doc.setTextColor(...DARK)
    doc.text(signatureName, M, y + 6)
    y += 10

    // Typed name below
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(signatureName, M, y)
    y += 5

    // Date
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    doc.text(`Date: ${today}`, M, y)
  }

  // ─── Footer ──────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(
      `Peckham Coatings — ${title}`,
      M,
      PH - 10
    )
    doc.text(
      `Page ${i} of ${pageCount}`,
      PW - M,
      PH - 10,
      { align: 'right' }
    )
  }

  const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)
  const filename = `${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`
  return { blob: doc.output('blob'), filename }
}
