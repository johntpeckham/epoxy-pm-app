import { jsPDF } from 'jspdf'

// ── Types ─────────────────────────────────────────────────────────────────
export interface PdfScheduleJob {
  job_id: string
  job_name: string
  proposal_number: string | null
  address: string | null
  employees: {
    employee_id: string
    employee_name: string
    days: boolean[]
  }[]
}

export interface PdfCompanyInfo {
  dba?: string | null
  legal_name?: string | null
  company_address?: string | null
  phone?: string | null
  email?: string | null
  cslb_licenses?: { number: string; classification: string }[] | null
}

// ── Palette (matches generateSchedulePdf) ────────────────────────────────
const DARK: [number, number, number] = [17, 24, 39]
const LABEL_GRAY: [number, number, number] = [75, 85, 99]
const MED: [number, number, number] = [107, 114, 128]
const BORDER: [number, number, number] = [209, 213, 219]
const HEADER_BG: [number, number, number] = [243, 244, 246]
const ROW_ALT: [number, number, number] = [249, 250, 251]

const DAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Date helpers ─────────────────────────────────────────────────────────
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function formatShortMD(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

function summarizeDays(days: boolean[]): string {
  const active = days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
  if (active.length === 0) return ''
  if (active.length === 7) return 'All week'
  const ranges: string[] = []
  let rangeStart = active[0]
  let rangeEnd = active[0]
  for (let k = 1; k < active.length; k++) {
    if (active[k] === rangeEnd + 1) {
      rangeEnd = active[k]
    } else {
      ranges.push(
        rangeStart === rangeEnd
          ? DAY_LABELS_SHORT[rangeStart]
          : `${DAY_LABELS_SHORT[rangeStart]}-${DAY_LABELS_SHORT[rangeEnd]}`
      )
      rangeStart = active[k]
      rangeEnd = active[k]
    }
  }
  ranges.push(
    rangeStart === rangeEnd
      ? DAY_LABELS_SHORT[rangeStart]
      : `${DAY_LABELS_SHORT[rangeStart]}-${DAY_LABELS_SHORT[rangeEnd]}`
  )
  return ranges.join(', ')
}

function countDays(days: boolean[]): number {
  return days.reduce((n, v) => n + (v ? 1 : 0), 0)
}

// ── Image loader ─────────────────────────────────────────────────────────
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

// ── Shared letterhead renderer ───────────────────────────────────────────
function renderLetterhead(
  doc: jsPDF,
  ci: PdfCompanyInfo,
  M: number,
  startY: number,
): { companyIdentity: string; y: number } {
  let companyIdentity: string
  if (ci.legal_name && ci.dba && ci.legal_name.toLowerCase() !== ci.dba.toLowerCase()) {
    companyIdentity = `${ci.legal_name} DBA ${ci.dba}`
  } else {
    companyIdentity = ci.dba || ci.legal_name || 'Peckham Coatings'
  }
  const addressLine = ci.company_address ? ci.company_address.replace(/\n/g, ', ') : null
  const contactParts: string[] = []
  if (ci.phone) contactParts.push(ci.phone)
  if (ci.email) contactParts.push(ci.email)
  const contactLine = contactParts.length > 0 ? contactParts.join(' | ') : null
  let cslbLine: string | null = null
  if (ci.cslb_licenses && ci.cslb_licenses.length > 0) {
    const parts = ci.cslb_licenses.map((l) => {
      const code = l.classification.includes(' - ') ? l.classification.split(' - ')[0].trim() : l.classification.trim()
      return `#${l.number} (${code})`
    })
    cslbLine = `CSLB Lic. ${parts.join(', ')}`
  }

  let headerY = startY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...DARK)
  doc.text(companyIdentity, M, headerY)
  headerY += 5

  if (addressLine) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(addressLine, M, headerY)
    headerY += 3.5
  }
  if (contactLine) {
    doc.setFontSize(9)
    doc.setTextColor(...LABEL_GRAY)
    doc.text(contactLine, M, headerY)
    headerY += 3.5
  }
  if (cslbLine) {
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(cslbLine, M, headerY)
    headerY += 3.5
  }

  return { companyIdentity, y: Math.max(headerY, startY + 22) + 3 }
}

// ══════════════════════════════════════════════════════════════════════════
// Full crew schedule PDF
// ══════════════════════════════════════════════════════════════════════════
export async function generateFullSchedulePdf(
  weekStartISO: string,
  jobs: PdfScheduleJob[],
  allEmployees: { id: string; name: string }[],
  companyInfo?: PdfCompanyInfo | null,
  logoUrl?: string | null,
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 15
  const CW = PW - M * 2
  let y = M

  function checkPage(needed = 20) {
    if (y + needed > PH - 15) {
      doc.addPage()
      y = M
    }
  }

  // Logo
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl)
      const ratio = Math.min(40 / logo.width, 20 / logo.height)
      doc.addImage(logo.data, logo.format, PW - M - logo.width * ratio, y, logo.width * ratio, logo.height * ratio)
    } catch { /* skip */ }
  }

  // Letterhead
  const ci = companyInfo ?? {}
  const { companyIdentity, y: afterHeader } = renderLetterhead(doc, ci, M, y)
  y = afterHeader

  // Divider
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(M, y, M + CW, y)
  y += 6

  // Title
  const weekStart = parseISODate(weekStartISO)
  const weekEnd = addDays(weekStart, 6)
  const year = weekStart.getFullYear()
  const rangeText = `Week of ${formatMonthDay(weekStart)} – ${formatMonthDay(weekEnd)}, ${year}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...DARK)
  doc.text('WEEKLY CREW SCHEDULE', PW / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...LABEL_GRAY)
  doc.text(rangeText, PW / 2, y, { align: 'center' })
  y += 8

  // Column widths
  const PROJECT_COL_W = CW * 0.25
  const DAY_COL_W = (CW - PROJECT_COL_W) / 7

  function drawTableHeader() {
    const rowH = 8
    doc.setFillColor(...HEADER_BG)
    doc.rect(M, y, CW, rowH, 'F')
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.4)
    doc.line(M, y, M + CW, y)
    doc.line(M, y + rowH, M + CW, y + rowH)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    for (let i = 0; i <= 7; i++) {
      const x = M + PROJECT_COL_W + i * DAY_COL_W
      doc.line(x, y, x, y + rowH)
    }
    doc.line(M, y, M, y + rowH)
    doc.line(M + CW, y, M + CW, y + rowH)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text('Project', M + 2, y + 5.5)
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i)
      const label = `${DAY_LABELS_SHORT[i]} ${formatShortMD(d)}`
      const x = M + PROJECT_COL_W + i * DAY_COL_W + DAY_COL_W / 2
      doc.text(label, x, y + 5.5, { align: 'center' })
    }
    y += rowH
  }

  drawTableHeader()

  const PROJECT_PAD = 2
  const CELL_PAD = 1.5
  const CELL_LINE_H = 3.3
  const PROJECT_LINE_H = 3.5
  const MIN_ROW_H = 10

  let rowIndex = 0
  for (const job of jobs) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const nameLines = doc.splitTextToSize(job.job_name || 'Untitled', PROJECT_COL_W - PROJECT_PAD * 2) as string[]
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    const metaLines: string[] = []
    if (job.proposal_number) metaLines.push(`Proposal #${job.proposal_number}`)
    if (job.address) {
      const addrLines = doc.splitTextToSize(job.address, PROJECT_COL_W - PROJECT_PAD * 2) as string[]
      metaLines.push(...addrLines)
    }
    const projectCellH = nameLines.length * PROJECT_LINE_H + metaLines.length * 3

    const dayCells: string[][] = []
    let maxDayLines = 1
    for (let d = 0; d < 7; d++) {
      const names = job.employees.filter((e) => e.days[d]).map((e) => firstName(e.employee_name))
      if (names.length === 0) {
        dayCells.push(['—'])
      } else {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const wrapped = doc.splitTextToSize(names.join(', '), DAY_COL_W - CELL_PAD * 2) as string[]
        dayCells.push(wrapped)
        if (wrapped.length > maxDayLines) maxDayLines = wrapped.length
      }
    }

    const dayCellH = Math.max(maxDayLines * CELL_LINE_H + CELL_PAD * 2, MIN_ROW_H)
    const rowH = Math.max(projectCellH + PROJECT_PAD * 2, dayCellH)

    if (y + rowH > PH - 20) {
      doc.addPage()
      y = M
      drawTableHeader()
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(...ROW_ALT)
      doc.rect(M, y, CW, rowH, 'F')
    }

    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.line(M, y + rowH, M + CW, y + rowH)
    for (let i = 0; i <= 7; i++) {
      const x = M + PROJECT_COL_W + i * DAY_COL_W
      doc.line(x, y, x, y + rowH)
    }
    doc.line(M, y, M, y + rowH)
    doc.line(M + CW, y, M + CW, y + rowH)

    let py = y + PROJECT_PAD + PROJECT_LINE_H
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    for (const line of nameLines) {
      doc.text(line, M + PROJECT_PAD, py)
      py += PROJECT_LINE_H
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    for (const line of metaLines) {
      doc.text(line, M + PROJECT_PAD, py)
      py += 3
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    for (let d = 0; d < 7; d++) {
      const lines = dayCells[d]
      const x = M + PROJECT_COL_W + d * DAY_COL_W
      let cy = y + CELL_PAD + CELL_LINE_H
      for (const line of lines) {
        if (line === '—') doc.setTextColor(...MED)
        else doc.setTextColor(...DARK)
        doc.text(line, x + DAY_COL_W / 2, cy, { align: 'center' })
        cy += CELL_LINE_H
      }
    }

    y += rowH
    rowIndex++
  }

  if (jobs.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...MED)
    doc.text('No jobs in this schedule.', M + 2, y + 6)
    y += 12
  }

  y += 8

  // Employee assignments summary
  checkPage(20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('Employee Assignments', M, y)
  y += 5

  const byEmployeeId = new Map<string, { name: string; items: { projectName: string; days: boolean[] }[] }>()
  for (const job of jobs) {
    for (const emp of job.employees) {
      const entry = byEmployeeId.get(emp.employee_id) ?? { name: emp.employee_name, items: [] }
      entry.items.push({ projectName: job.job_name, days: emp.days })
      byEmployeeId.set(emp.employee_id, entry)
    }
  }
  const summaryEntries = Array.from(byEmployeeId.values()).sort((a, b) => a.name.localeCompare(b.name))

  if (summaryEntries.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...LABEL_GRAY)
    doc.text('No employees assigned.', M + 2, y)
    y += 5
  } else {
    for (const entry of summaryEntries) {
      checkPage(6)
      const unionDays = [false, false, false, false, false, false, false]
      for (const item of entry.items) {
        for (let i = 0; i < 7; i++) if (item.days[i]) unionDays[i] = true
      }
      const totalDays = countDays(unionDays)
      const perProject = entry.items
        .filter((a) => countDays(a.days) > 0)
        .map((a) => `${a.projectName} (${summarizeDays(a.days)})`)
        .join('; ')
      const line = `${entry.name} — ${totalDays} day${totalDays === 1 ? '' : 's'}: ${perProject}`
      const wrapped = doc.splitTextToSize(line, CW - 4) as string[]
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...DARK)
      for (const wline of wrapped) {
        checkPage(5)
        doc.text(wline, M + 2, y)
        y += 4
      }
    }
  }
  y += 3

  // Unassigned employees
  const assignedIds = new Set(byEmployeeId.keys())
  const unassigned = allEmployees
    .filter((e) => !assignedIds.has(e.id))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))

  if (unassigned.length > 0) {
    checkPage(8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    doc.text('Unassigned:', M, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...LABEL_GRAY)
    const wrapped = doc.splitTextToSize(unassigned.join(', '), CW - 24) as string[]
    let ty = y
    for (const wline of wrapped) {
      checkPage(5)
      doc.text(wline, M + 22, ty)
      ty += 4
    }
    y = ty + 2
  }

  // Footer
  const generated = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(`${companyIdentity} — Weekly Crew Schedule`, M, PH - 8)
    doc.text(`Generated ${generated}`, PW / 2, PH - 8, { align: 'center' })
    doc.text(`Page ${i} of ${pageCount}`, PW - M, PH - 8, { align: 'right' })
  }

  return { blob: doc.output('blob'), filename: `Crew-Schedule-${weekStartISO}.pdf` }
}

// ══════════════════════════════════════════════════════════════════════════
// Individual employee schedule PDF
// ══════════════════════════════════════════════════════════════════════════
export async function generateIndividualSchedulePdf(
  weekStartISO: string,
  employeeName: string,
  jobs: PdfScheduleJob[],
  companyInfo?: PdfCompanyInfo | null,
  logoUrl?: string | null,
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 15
  const CW = PW - M * 2
  let y = M

  // Logo
  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl)
      const ratio = Math.min(40 / logo.width, 20 / logo.height)
      doc.addImage(logo.data, logo.format, PW - M - logo.width * ratio, y, logo.width * ratio, logo.height * ratio)
    } catch { /* skip */ }
  }

  // Letterhead
  const ci = companyInfo ?? {}
  const { companyIdentity, y: afterHeader } = renderLetterhead(doc, ci, M, y)
  y = afterHeader

  // Divider
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(M, y, M + CW, y)
  y += 6

  // Title
  const weekStart = parseISODate(weekStartISO)
  const weekEnd = addDays(weekStart, 6)
  const year = weekStart.getFullYear()
  const rangeText = `Week of ${formatMonthDay(weekStart)} – ${formatMonthDay(weekEnd)}, ${year}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...DARK)
  doc.text(`${employeeName} — Weekly Schedule`, PW / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...LABEL_GRAY)
  doc.text(rangeText, PW / 2, y, { align: 'center' })
  y += 10

  // Table
  const JOB_COL_W = CW * 0.35
  const DAY_COL_W = (CW - JOB_COL_W) / 7

  // Header
  const headerH = 8
  doc.setFillColor(...HEADER_BG)
  doc.rect(M, y, CW, headerH, 'F')
  doc.setDrawColor(...DARK)
  doc.setLineWidth(0.4)
  doc.line(M, y, M + CW, y)
  doc.line(M, y + headerH, M + CW, y + headerH)
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.2)
  for (let i = 0; i <= 7; i++) {
    const x = M + JOB_COL_W + i * DAY_COL_W
    doc.line(x, y, x, y + headerH)
  }
  doc.line(M, y, M, y + headerH)
  doc.line(M + CW, y, M + CW, y + headerH)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text('Job', M + 2, y + 5.5)
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    const label = `${DAY_LABELS_SHORT[i]} ${formatShortMD(d)}`
    const x = M + JOB_COL_W + i * DAY_COL_W + DAY_COL_W / 2
    doc.text(label, x, y + 5.5, { align: 'center' })
  }
  y += headerH

  let rowIndex = 0
  for (const job of jobs) {
    const emp = job.employees[0]
    if (!emp) continue

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const nameLines = doc.splitTextToSize(job.job_name || 'Untitled', JOB_COL_W - 4) as string[]
    const metaLines: string[] = []
    if (job.proposal_number) metaLines.push(`Proposal #${job.proposal_number}`)
    if (job.address) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      const addrLines = doc.splitTextToSize(job.address, JOB_COL_W - 4) as string[]
      metaLines.push(...addrLines)
    }

    const rowH = Math.max(nameLines.length * 3.5 + metaLines.length * 3 + 4, 10)

    if (y + rowH > PH - 20) {
      doc.addPage()
      y = M
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(...ROW_ALT)
      doc.rect(M, y, CW, rowH, 'F')
    }

    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.line(M, y + rowH, M + CW, y + rowH)
    for (let i = 0; i <= 7; i++) {
      const x = M + JOB_COL_W + i * DAY_COL_W
      doc.line(x, y, x, y + rowH)
    }
    doc.line(M, y, M, y + rowH)
    doc.line(M + CW, y, M + CW, y + rowH)

    let py = y + 2 + 3.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...DARK)
    for (const line of nameLines) {
      doc.text(line, M + 2, py)
      py += 3.5
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    for (const line of metaLines) {
      doc.text(line, M + 2, py)
      py += 3
    }

    // Day checkmarks
    doc.setFontSize(10)
    for (let d = 0; d < 7; d++) {
      const x = M + JOB_COL_W + d * DAY_COL_W + DAY_COL_W / 2
      if (emp.days[d]) {
        doc.setTextColor(...DARK)
        doc.text('✓', x, y + rowH / 2 + 1.5, { align: 'center' })
      } else {
        doc.setTextColor(...MED)
        doc.text('—', x, y + rowH / 2 + 1.5, { align: 'center' })
      }
    }

    y += rowH
    rowIndex++
  }

  if (jobs.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...MED)
    doc.text('No assignments for this week.', M + 2, y + 6)
    y += 12
  }

  // Summary
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('Summary', M, y)
  y += 5

  const unionDays = [false, false, false, false, false, false, false]
  for (const job of jobs) {
    const emp = job.employees[0]
    if (emp) for (let i = 0; i < 7; i++) if (emp.days[i]) unionDays[i] = true
  }
  const totalDays = countDays(unionDays)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text(`Total days scheduled: ${totalDays}`, M + 2, y)
  y += 4
  doc.text(`Days: ${summarizeDays(unionDays) || 'None'}`, M + 2, y)
  y += 4
  doc.text(`Jobs: ${jobs.length}`, M + 2, y)

  // Footer
  const generated = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(`${companyIdentity} — ${employeeName} Schedule`, M, PH - 8)
    doc.text(`Generated ${generated}`, PW / 2, PH - 8, { align: 'center' })
    doc.text(`Page ${i} of ${pageCount}`, PW - M, PH - 8, { align: 'right' })
  }

  const safeName = employeeName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')
  return { blob: doc.output('blob'), filename: `${safeName}-Schedule-${weekStartISO}.pdf` }
}
