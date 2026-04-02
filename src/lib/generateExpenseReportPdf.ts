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

// Color palette — matches existing report PDF styles (green theme for receipts/expenses)
const GREEN: [number, number, number] = [22, 101, 52]           // green-800
const GREEN_LIGHT: [number, number, number] = [220, 252, 231]   // green-100
const DARK: [number, number, number] = [17, 24, 39]             // gray-900
const LABEL_GRAY: [number, number, number] = [75, 85, 99]       // gray-600
const MED: [number, number, number] = [107, 114, 128]           // gray-500

interface ExpenseRow {
  content: ReceiptContent
}

export async function generateExpenseReportPdf(
  projectName: string,
  expenses: ExpenseRow[],
  logoUrl?: string | null
): Promise<{ blob: Blob; filename: string }> {
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
    doc.setTextColor(...GREEN)
    doc.text(title, M, y)
    y += 2.5
    doc.setDrawColor(...GREEN_LIGHT)
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
  doc.text('Expense Report', M, headerStartY + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MED)
  doc.text(projectName, M, headerStartY + 14)

  const textBottomY = headerStartY + 16
  y = Math.max(logoBottomY, textBottomY) + 4

  doc.setDrawColor(...GREEN)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 4

  // ─── DATE RANGE ────────────────────────────────────────────────────────
  const dates = expenses
    .map((e) => e.content.receipt_date)
    .filter(Boolean)
    .sort()

  if (dates.length > 0) {
    const formatDate = (d: string) =>
      new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    const rangeText = dates.length === 1
      ? formatDate(dates[0])
      : `${formatDate(dates[0])} — ${formatDate(dates[dates.length - 1])}`

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MED)
    doc.text(rangeText, M, y + 3)
    y += 8
  }

  // ─── EXPENSES TABLE ────────────────────────────────────────────────────
  sectionTitle('EXPENSES')

  // Table header
  const COL_DATE = M
  const COL_VENDOR = M + 28
  const COL_CATEGORY = M + 85
  const COL_NOTES = M + 115
  const COL_AMOUNT = M + CW

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...LABEL_GRAY)
  doc.text('DATE', COL_DATE, y)
  doc.text('VENDOR', COL_VENDOR, y)
  doc.text('CATEGORY', COL_CATEGORY, y)
  doc.text('AMOUNT', COL_AMOUNT, y, { align: 'right' })
  y += 2
  doc.setDrawColor(...GREEN_LIGHT)
  doc.setLineWidth(0.3)
  doc.line(M, y, M + CW, y)
  y += 4

  // Sort expenses by date
  const sorted = [...expenses].sort((a, b) =>
    (a.content.receipt_date || '').localeCompare(b.content.receipt_date || '')
  )

  let total = 0
  for (const expense of sorted) {
    checkPage(8)
    const c = expense.content

    const displayDate = c.receipt_date
      ? new Date(c.receipt_date + 'T12:00:00').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
        })
      : '—'

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK)

    doc.text(displayDate, COL_DATE, y)

    // Truncate vendor name if too long
    const vendorText = c.vendor_name || '—'
    const vendorLines = doc.splitTextToSize(vendorText, COL_CATEGORY - COL_VENDOR - 4)
    doc.text(vendorLines[0], COL_VENDOR, y)

    doc.setFontSize(8)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(c.category || '—', COL_CATEGORY, y)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK)
    doc.text(`$${c.total_amount.toFixed(2)}`, COL_AMOUNT, y, { align: 'right' })

    total += c.total_amount
    y += 6
  }

  // ─── TOTAL ─────────────────────────────────────────────────────────────
  checkPage(12)
  y += 2
  doc.setDrawColor(...GREEN)
  doc.setLineWidth(0.4)
  doc.line(M, y, M + CW, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...LABEL_GRAY)
  doc.text('TOTAL', COL_DATE, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text(`$${total.toFixed(2)}`, COL_AMOUNT, y, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MED)
  doc.text(`${expenses.length} expense${expenses.length !== 1 ? 's' : ''}`, COL_VENDOR, y)

  // ─── FOOTER ────────────────────────────────────────────────────────────
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

  const safeName = (projectName || 'expenses').replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const filename = `expense-report-${safeName}.pdf`
  return { blob: doc.output('blob'), filename }
}
