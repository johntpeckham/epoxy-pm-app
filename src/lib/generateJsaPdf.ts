import { jsPDF } from 'jspdf'
import { JsaReportContent } from '@/types'

// Color palette — matches existing generateReportPdf styles
const AMBER: [number, number, number] = [180, 83, 9]
const AMBER_LIGHT: [number, number, number] = [254, 243, 199]
const DARK: [number, number, number] = [17, 24, 39]
const LABEL_GRAY: [number, number, number] = [75, 85, 99]
const MED: [number, number, number] = [107, 114, 128]

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

export async function generateJsaPdf(
  content: JsaReportContent,
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
    doc.setTextColor(...AMBER)
    doc.text(title, M, y)
    y += 2.5
    doc.setDrawColor(...AMBER_LIGHT)
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

  function paragraphBlock(label: string, value: string) {
    if (!value) return
    checkPage(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...DARK)
    doc.text(label, M, y)
    y += 5
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
  doc.text('Job Safety Analysis', M, headerStartY + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MED)
  doc.text(content.projectName || '—', M, headerStartY + 14)

  const textBottomY = headerStartY + 16
  y = Math.max(logoBottomY, textBottomY) + 4

  doc.setDrawColor(...AMBER)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 4

  // ─── PROJECT DETAILS ──────────────────────────────────────────────────
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
  fieldRow('Project', content.projectName || '—')
  fieldRow('Address', content.address || '—')
  fieldRow('Weather', content.weather || '—')

  // ─── PERSONNEL ────────────────────────────────────────────────────────
  sectionTitle('PERSONNEL')

  fieldRow('Prepared By', content.preparedBy || '—')
  fieldRow('Site Supervisor', content.siteSupervisor || '—')
  fieldRow('Competent Person', content.competentPerson || '—')

  // ─── TASK SECTIONS ────────────────────────────────────────────────────
  if (content.tasks && content.tasks.length > 0) {
    for (const task of content.tasks) {
      sectionTitle(`TASK: ${task.name.toUpperCase()}`)
      paragraphBlock('Hazards', task.hazards || '')
      paragraphBlock('Precautions', task.precautions || '')
      paragraphBlock('PPE Required', task.ppe || '')
    }
  }

  // ─── EMPLOYEE ACKNOWLEDGMENT & SIGNATURES ──────────────────────────
  checkPage(50)
  y += 8
  sectionTitle('EMPLOYEE ACKNOWLEDGMENT & SIGNATURES')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text(
    'I acknowledge that the Job Safety Analysis has been reviewed with me, I understand the hazards and required controls, and I agree to follow all safety procedures outlined.',
    M,
    y,
    { maxWidth: CW }
  )
  y += 14

  const filledSigs = (content.signatures ?? []).filter((s) => s.name || s.signature)

  if (filledSigs.length > 0) {
    const SIG_IMG_W = 60
    const SIG_IMG_H = 20

    for (const sig of filledSigs) {
      checkPage(SIG_IMG_H + 14)
      // Draw the signature image
      if (sig.signature) {
        try {
          doc.addImage(sig.signature, 'PNG', M, y, SIG_IMG_W, SIG_IMG_H)
        } catch {
          // skip if image fails
        }
      }
      // Underline
      doc.setDrawColor(...LABEL_GRAY)
      doc.setLineWidth(0.3)
      doc.line(M, y + SIG_IMG_H + 1, M + SIG_IMG_W, y + SIG_IMG_H + 1)
      // Name label
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...DARK)
      doc.text(sig.name, M, y + SIG_IMG_H + 5.5)
      y += SIG_IMG_H + 12
    }
  } else {
    // Fallback: blank signature lines if no digital signatures
    const sigLineWidth = (CW - 10) / 2
    const sigLabels = ['Prepared By', 'Site Supervisor', 'Competent Person', 'Employee']

    for (let i = 0; i < sigLabels.length; i += 2) {
      checkPage(20)
      doc.setDrawColor(...LABEL_GRAY)
      doc.setLineWidth(0.3)
      doc.line(M, y + 8, M + sigLineWidth, y + 8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...LABEL_GRAY)
      doc.text(sigLabels[i], M, y + 12)
      doc.text('Date: _______________', M, y + 16)

      if (i + 1 < sigLabels.length) {
        const rightX = M + sigLineWidth + 10
        doc.line(rightX, y + 8, rightX + sigLineWidth, y + 8)
        doc.text(sigLabels[i + 1], rightX, y + 12)
        doc.text('Date: _______________', rightX, y + 16)
      }

      y += 24
    }
  }

  // ─── FOOTER ───────────────────────────────────────────────────────────
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

  const safeName = (content.projectName || 'jsa-report').replace(/[^a-z0-9]/gi, '-').toLowerCase()
  doc.save(`jsa-report-${safeName}-${content.date || 'draft'}.pdf`)
}
