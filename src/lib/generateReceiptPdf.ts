import { jsPDF } from 'jspdf'
import { ReceiptContent } from '@/types'

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

// Color palette
const GREEN: [number, number, number] = [22, 101, 52]           // green-800
const GREEN_LIGHT: [number, number, number] = [220, 252, 231]   // green-100
const DARK: [number, number, number] = [17, 24, 39]             // gray-900
const LABEL_GRAY: [number, number, number] = [75, 85, 99]       // gray-600
const MED: [number, number, number] = [107, 114, 128]           // gray-500

export async function generateReceiptPdf(
  content: ReceiptContent,
  photoUrl: string | null,
  logoUrl?: string | null
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 20
  const CW = PW - M * 2
  const LABEL_W = 50
  const VALUE_X = M + LABEL_W + 4
  const VALUE_W = CW - LABEL_W - 6
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
    doc.setTextColor(...GREEN)
    doc.text(title, M, y)
    y += 2.5
    doc.setDrawColor(...GREEN_LIGHT)
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
    const lines = doc.splitTextToSize(value, VALUE_W)
    lines.forEach((line: string, i: number) => {
      if (i > 0) checkPage(5)
      doc.text(line, VALUE_X, y)
      if (i < lines.length - 1) y += 4.5
    })
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
  doc.text('Receipt', M, headerStartY + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MED)
  doc.text(content.vendor_name || '—', M, headerStartY + 14)

  const textBottomY = headerStartY + 16
  y = Math.max(logoBottomY, textBottomY) + 4

  doc.setDrawColor(...GREEN)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 4

  // ─── RECEIPT DETAILS ──────────────────────────────────────────────────
  sectionTitle('RECEIPT DETAILS')

  fieldRow('Vendor / Store', content.vendor_name || '—')

  const displayDate = content.receipt_date
    ? new Date(content.receipt_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'
  fieldRow('Date', displayDate)
  fieldRow('Total Amount', `$${content.total_amount.toFixed(2)}`)
  fieldRow('Category', content.category || '—')

  // ─── RECEIPT PHOTO ────────────────────────────────────────────────────
  if (photoUrl) {
    sectionTitle('RECEIPT IMAGE')
    try {
      const { data, format, width, height } = await loadImage(photoUrl)
      const maxW = CW
      const maxH = 120
      const ratio = Math.min(maxW / width, maxH / height)
      const drawW = width * ratio
      const drawH = height * ratio
      checkPage(drawH + 6)
      doc.addImage(data, format, M, y, drawW, drawH)
      y += drawH + 6
    } catch {
      // skip image if it fails to load
    }
  }

  // ─── FOOTER ───────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = PH - 10
    doc.setDrawColor(...GREEN_LIGHT)
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

  const safeName = (content.vendor_name || 'receipt').replace(/[^a-z0-9]/gi, '-').toLowerCase()
  doc.save(`receipt-${safeName}-${content.receipt_date || 'draft'}.pdf`)
}
