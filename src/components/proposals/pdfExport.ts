import jsPDF from 'jspdf'
import type { MaterialSystemRow } from './types'

interface PdfData {
  proposalNumber: number
  date: string
  customerName: string
  customerCompany: string
  customerAddress: string
  projectName: string
  description: string
  salesperson: string
  lineItems: { description: string; ft: number | null; rate: number | null; amount: number }[]
  materialSystems: MaterialSystemRow[]
  subtotal: number
  tax: number
  total: number
  terms: string
  companyName: string
  companyAddress: string
  companyWebsite: string
  logoBase64: string | null
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function exportProposalPdf(data: PdfData): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 50
  const contentWidth = pageWidth - margin * 2
  let y = margin

  // ─── Company header ───
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(data.companyName, margin, y)
  y += 16
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(data.companyAddress, margin, y)
  y += 12
  doc.text(data.companyWebsite, margin, y)

  // ─── Logo (top-right) ───
  let logoBottomY = margin + 4
  if (data.logoBase64) {
    try {
      const format = data.logoBase64.includes('image/png') ? 'PNG' : 'JPEG'
      const logoMaxW = 130
      const logoMaxH = 60
      doc.addImage(data.logoBase64, format, pageWidth - margin - logoMaxW, margin - 10, logoMaxW, logoMaxH, undefined, 'FAST')
      logoBottomY = margin - 10 + logoMaxH
    } catch {
      // If image fails to load, skip logo
    }
  }

  // ─── "Proposal" title ───
  const titleY = Math.max(logoBottomY + 8, margin + 4)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(217, 119, 6) // amber-600
  doc.text('Proposal', pageWidth - margin, titleY, { align: 'right' })

  y += 28
  doc.setTextColor(0, 0, 0)

  // ─── Address + Proposal info ───
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(150, 150, 150)
  doc.text('ADDRESS', margin, y)
  doc.text('PROPOSAL #', pageWidth - margin - 100, y)
  y += 12
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(data.customerName, margin, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(217, 119, 6)
  doc.text(String(data.proposalNumber), pageWidth - margin, y, { align: 'right' })
  y += 13
  doc.setTextColor(100, 100, 100)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (data.customerCompany) {
    doc.text(data.customerCompany, margin, y)
    y += 12
  }

  // Date
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(150, 150, 150)
  doc.text('DATE', pageWidth - margin - 100, y)
  y += 12
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(data.date, pageWidth - margin, y, { align: 'right' })

  y += 20

  // ─── Project info row ───
  doc.setFillColor(255, 251, 235) // amber-50
  doc.rect(margin, y, contentWidth, 36, 'F')
  doc.setDrawColor(253, 230, 138) // amber-200
  doc.line(margin, y, margin + contentWidth, y)
  doc.line(margin, y + 36, margin + contentWidth, y + 36)

  const colW = contentWidth / 3
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(146, 64, 14) // amber-800
  doc.text('PROJECT NAME', margin + 6, y + 12)
  doc.text('DESCRIPTION', margin + colW + 6, y + 12)
  doc.text('SALES PERSON', margin + colW * 2 + 6, y + 12)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)
  doc.text(data.projectName || '', margin + 6, y + 26)
  doc.text(data.description || '', margin + colW + 6, y + 26)
  doc.text(data.salesperson || '', margin + colW * 2 + 6, y + 26)

  y += 48

  // ─── Line items table ───
  const descColW = contentWidth - 60 - 70 - 80
  const colFtX = margin + descColW
  const colRateX = colFtX + 60
  // Header
  doc.setDrawColor(217, 119, 6)
  doc.setLineWidth(1.5)
  doc.line(margin, y + 14, margin + contentWidth, y + 14)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(146, 64, 14)
  doc.text('PROJECT / DESCRIPTION', margin, y + 10)
  doc.text('FT', colFtX + 30, y + 10, { align: 'right' })
  doc.text('RATE', colRateX + 50, y + 10, { align: 'right' })
  doc.text('AMOUNT', margin + contentWidth, y + 10, { align: 'right' })

  y += 20
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  for (const item of data.lineItems) {
    // Check if we need a new page
    if (y > 700) {
      doc.addPage()
      y = margin
    }

    // Wrap description text
    const lines = doc.splitTextToSize(item.description || '', descColW - 12)
    const rowH = Math.max(lines.length * 12, 18)

    doc.text(lines, margin, y + 11)
    if (item.ft) {
      doc.text(String(item.ft), colFtX + 30, y + 11, { align: 'right' })
    }
    if (item.rate) {
      doc.text(fmtMoney(item.rate), colRateX + 50, y + 11, { align: 'right' })
    }
    doc.text(fmtMoney(item.amount), margin + contentWidth, y + 11, { align: 'right' })

    y += rowH + 4
    doc.setDrawColor(230, 230, 230)
    doc.setLineWidth(0.5)
    doc.line(margin, y, margin + contentWidth, y)
    y += 4
  }

  y += 8

  // ─── Totals ───
  const totalsX = margin + contentWidth - 200

  doc.setFontSize(9)
  doc.text('Subtotal', totalsX, y + 12)
  doc.text(fmtMoney(data.subtotal), margin + contentWidth, y + 12, { align: 'right' })
  y += 18
  doc.text('Tax', totalsX, y + 12)
  doc.text(fmtMoney(data.tax), margin + contentWidth, y + 12, { align: 'right' })
  y += 18
  doc.setDrawColor(200, 200, 200)
  doc.line(totalsX, y, margin + contentWidth, y)
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Total', totalsX, y + 14)
  doc.text(fmtMoney(data.total), margin + contentWidth, y + 14, { align: 'right' })

  y += 32

  // ─── Material Systems ───
  if (data.materialSystems && data.materialSystems.length > 0) {
    if (y > 620) {
      doc.addPage()
      y = margin
    }

    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(146, 64, 14) // amber-800
    doc.text('MATERIAL SYSTEMS', margin, y)
    y += 14

    for (const ms of data.materialSystems) {
      if (y > 660) {
        doc.addPage()
        y = margin
      }

      // System name header
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(0, 0, 0)
      doc.text(ms.systemName || '', margin, y + 10)
      y += 16

      // Material items table
      if (ms.items && ms.items.length > 0) {
        const msColW = contentWidth / 3
        doc.setDrawColor(217, 119, 6)
        doc.setLineWidth(0.5)
        doc.line(margin, y, margin + contentWidth, y)
        y += 2

        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(146, 64, 14)
        doc.text('MATERIAL', margin, y + 8)
        doc.text('THICKNESS', margin + msColW, y + 8)
        doc.text('COVERAGE RATE', margin + msColW * 2, y + 8)
        y += 14

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(0, 0, 0)

        for (const item of ms.items) {
          if (y > 700) {
            doc.addPage()
            y = margin
          }
          doc.text(item.material_name || '', margin, y + 10)
          doc.text(item.thickness || '', margin + msColW, y + 10)
          doc.text(item.coverage_rate || '', margin + msColW * 2, y + 10)
          y += 14
          if (item.item_notes) {
            doc.setFontSize(7)
            doc.setFont('helvetica', 'italic')
            doc.setTextColor(130, 130, 130)
            doc.text(item.item_notes, margin + 4, y + 6)
            y += 10
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.setTextColor(0, 0, 0)
          }
          doc.setDrawColor(230, 230, 230)
          doc.setLineWidth(0.5)
          doc.line(margin, y, margin + contentWidth, y)
          y += 2
        }
      }

      // Notes
      if (ms.notes) {
        y += 4
        doc.setFontSize(7)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(100, 100, 100)
        const noteLines = doc.splitTextToSize(ms.notes, contentWidth)
        for (const line of noteLines) {
          if (y > 700) {
            doc.addPage()
            y = margin
          }
          doc.text(line, margin, y + 8)
          y += 10
        }
      }

      y += 8
    }

    y += 4
  }

  // ─── Terms ───
  if (y > 620) {
    doc.addPage()
    y = margin
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text('TERMS AND CONDITIONS', margin, y)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(80, 80, 80)
  const termLines = doc.splitTextToSize(data.terms || '', contentWidth)
  for (const line of termLines) {
    if (y > 740) {
      doc.addPage()
      y = margin
    }
    doc.text(line, margin, y)
    y += 9
  }

  y += 16

  // ─── Signature line ───
  if (y > 710) {
    doc.addPage()
    y = margin
  }

  doc.setFontSize(9)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.text('If you accept these terms, please sign below.', margin, y)
  y += 24
  doc.text('Accepted By _________________________', margin, y)
  doc.text('Accepted Date _________________________', margin + contentWidth / 2, y)

  // Return blob + filename
  const filename = `Proposal-${data.proposalNumber}-${data.customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
  return { blob: doc.output('blob'), filename }
}
