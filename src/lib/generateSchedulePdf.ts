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

// ── Types ─────────────────────────────────────────────────────────────────
type DayFlags = [boolean, boolean, boolean, boolean, boolean, boolean, boolean]

export interface ScheduleAssignment {
  employee_id: string
  employee_name: string
  project_id: string
  project_name: string
  days: DayFlags
}

export interface ScheduleProject {
  id: string
  name: string
  proposal_number?: string | null
  address?: string | null
}

export interface ScheduleCompanyInfo {
  dba?: string | null
  legal_name?: string | null
  company_address?: string | null
  phone?: string | null
  email?: string | null
  cslb_licenses?: { number: string; classification: string }[] | null
}

// ── Palette (matches warranty/reports) ────────────────────────────────────
const DARK: [number, number, number] = [17, 24, 39]
const LABEL_GRAY: [number, number, number] = [75, 85, 99]
const MED: [number, number, number] = [107, 114, 128]
const BORDER: [number, number, number] = [209, 213, 219] // gray-300
const HEADER_BG: [number, number, number] = [243, 244, 246] // gray-100
const ROW_ALT: [number, number, number] = [249, 250, 251] // gray-50
const AMBER: [number, number, number] = [180, 83, 9]
const RED: [number, number, number] = [185, 28, 28]

const DAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_LABELS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// ── Date helpers ──────────────────────────────────────────────────────────
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

// ── Employee-summary helpers ──────────────────────────────────────────────
function firstName(full: string): string {
  const parts = full.trim().split(/\s+/)
  return parts[0] || full
}

/** Collapse a 7-day boolean array to a human string like "Mon-Fri" or "Mon, Wed-Fri" */
function summarizeDays(days: DayFlags): string {
  const active = days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0) as number[]
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

function countDays(days: DayFlags): number {
  return days.reduce((n, v) => n + (v ? 1 : 0), 0)
}

// ── Double-book detection ────────────────────────────────────────────────
interface ScheduleConflict {
  employeeName: string
  dayIndex: number
  projectNames: string[]
}

function findAllConflicts(assignments: ScheduleAssignment[]): ScheduleConflict[] {
  // Group by employee
  const byEmployee = new Map<string, ScheduleAssignment[]>()
  for (const a of assignments) {
    if (!byEmployee.has(a.employee_id)) byEmployee.set(a.employee_id, [])
    byEmployee.get(a.employee_id)!.push(a)
  }
  const out: ScheduleConflict[] = []
  byEmployee.forEach((list) => {
    if (list.length < 2) return
    for (let d = 0; d < 7; d++) {
      const projects = list.filter((a) => a.days[d]).map((a) => a.project_name)
      if (projects.length > 1) {
        out.push({
          employeeName: list[0].employee_name,
          dayIndex: d,
          projectNames: projects,
        })
      }
    }
  })
  return out
}

// ── Main generator ────────────────────────────────────────────────────────
export async function generateSchedulePdf(
  weekStartISO: string,
  assignments: ScheduleAssignment[],
  projects: ScheduleProject[],
  allEmployees: Array<{ id: string; name: string }>,
  companyInfo?: ScheduleCompanyInfo | null,
  logoUrl?: string | null
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

  const PW = doc.internal.pageSize.getWidth() // 279.4
  const PH = doc.internal.pageSize.getHeight() // 215.9
  const M = 15
  const CW = PW - M * 2
  let y = M

  function checkPage(needed = 20) {
    if (y + needed > PH - 15) {
      doc.addPage()
      y = M
    }
  }

  // ── Letterhead ─────────────────────────────────────────────────────────
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
      // skip
    }
  }

  const ci = companyInfo ?? {}
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

  let headerY = y + 8
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

  y = Math.max(headerY, y + 22) + 3

  // Divider
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.4)
  doc.line(M, y, M + CW, y)
  y += 6

  // ── Title + date range ────────────────────────────────────────────────
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

  // ── Schedule table ────────────────────────────────────────────────────
  // Derive display projects: include all active projects in `projects`, then
  // append any referenced in assignments that aren't in active list.
  const projectOrder: ScheduleProject[] = [...projects]
  const knownIds = new Set(projects.map((p) => p.id))
  for (const a of assignments) {
    if (!knownIds.has(a.project_id)) {
      knownIds.add(a.project_id)
      projectOrder.push({ id: a.project_id, name: a.project_name })
    }
  }

  // Build cell data: rows of [projectLabelLines, 7 × employeeLines]
  const assignmentsByProject = new Map<string, ScheduleAssignment[]>()
  for (const a of assignments) {
    if (!assignmentsByProject.has(a.project_id)) assignmentsByProject.set(a.project_id, [])
    assignmentsByProject.get(a.project_id)!.push(a)
  }

  // Only include projects that either are active OR have at least one assignment
  const visibleProjects = projectOrder.filter(
    (p) => projects.some((ap) => ap.id === p.id) || (assignmentsByProject.get(p.id)?.length ?? 0) > 0
  )

  // Column widths: project col 25%, 7 day cols split 75%
  const PROJECT_COL_W = CW * 0.25
  const DAY_COL_W = (CW - PROJECT_COL_W) / 7

  // Day column header cells
  function drawTableHeader() {
    const rowH = 8
    // Background fill
    doc.setFillColor(...HEADER_BG)
    doc.rect(M, y, CW, rowH, 'F')
    // Top + bottom borders (thicker)
    doc.setDrawColor(...DARK)
    doc.setLineWidth(0.4)
    doc.line(M, y, M + CW, y)
    doc.line(M, y + rowH, M + CW, y + rowH)
    // Vertical separators
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    for (let i = 0; i <= 7; i++) {
      const x = M + PROJECT_COL_W + i * DAY_COL_W
      doc.line(x, y, x, y + rowH)
    }
    doc.line(M, y, M, y + rowH)
    doc.line(M + CW, y, M + CW, y + rowH)

    // Labels
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

  // Measure + draw each row
  const PROJECT_PAD = 2
  const CELL_PAD = 1.5
  const CELL_LINE_H = 3.3
  const PROJECT_LINE_H = 3.5
  const MIN_ROW_H = 10

  let rowIndex = 0
  for (const project of visibleProjects) {
    const projectAssignments = assignmentsByProject.get(project.id) ?? []
    const isInactive = !projects.some((p) => p.id === project.id)

    // Build project cell lines (name wrapped, then proposal #, then address)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const nameLines = doc.splitTextToSize(project.name || 'Untitled', PROJECT_COL_W - PROJECT_PAD * 2) as string[]
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    const metaLines: string[] = []
    if (project.proposal_number) metaLines.push(`Proposal #${project.proposal_number}`)
    if (project.address) {
      const addrLines = doc.splitTextToSize(project.address, PROJECT_COL_W - PROJECT_PAD * 2) as string[]
      metaLines.push(...addrLines)
    }
    if (isInactive) metaLines.push('(Inactive)')

    const projectCellH = nameLines.length * PROJECT_LINE_H + metaLines.length * 3

    // Build day cell contents
    const dayCells: string[][] = []
    let maxDayLines = 1
    for (let d = 0; d < 7; d++) {
      const names: string[] = []
      for (const a of projectAssignments) {
        if (a.days[d]) names.push(firstName(a.employee_name))
      }
      if (names.length === 0) {
        dayCells.push(['—'])
      } else {
        // Join and wrap
        const joined = names.join(', ')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        const wrapped = doc.splitTextToSize(joined, DAY_COL_W - CELL_PAD * 2) as string[]
        dayCells.push(wrapped)
        if (wrapped.length > maxDayLines) maxDayLines = wrapped.length
      }
    }

    const dayCellH = Math.max(maxDayLines * CELL_LINE_H + CELL_PAD * 2, MIN_ROW_H)
    const rowH = Math.max(projectCellH + PROJECT_PAD * 2, dayCellH)

    // Page-break check — repeat header on new page
    if (y + rowH > PH - 20) {
      doc.addPage()
      y = M
      drawTableHeader()
    }

    // Alt row fill
    if (rowIndex % 2 === 1) {
      doc.setFillColor(...ROW_ALT)
      doc.rect(M, y, CW, rowH, 'F')
    }

    // Borders
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.2)
    doc.line(M, y + rowH, M + CW, y + rowH)
    for (let i = 0; i <= 7; i++) {
      const x = M + PROJECT_COL_W + i * DAY_COL_W
      doc.line(x, y, x, y + rowH)
    }
    doc.line(M, y, M, y + rowH)
    doc.line(M + CW, y, M + CW, y + rowH)

    // Draw project name + meta
    let py = y + PROJECT_PAD + PROJECT_LINE_H
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...(isInactive ? MED : DARK))
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

    // Draw day cells
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    for (let d = 0; d < 7; d++) {
      const lines = dayCells[d]
      const x = M + PROJECT_COL_W + d * DAY_COL_W
      let cy = y + CELL_PAD + CELL_LINE_H
      for (const line of lines) {
        const isDash = line === '—'
        if (isDash) doc.setTextColor(...MED)
        else doc.setTextColor(...DARK)
        doc.text(line, x + DAY_COL_W / 2, cy, { align: 'center' })
        cy += CELL_LINE_H
      }
    }

    y += rowH
    rowIndex++
  }

  if (visibleProjects.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(...MED)
    doc.text('No active projects or assignments.', M + 2, y + 6)
    y += 12
  }

  y += 8

  // ── Employee Assignments summary ──────────────────────────────────────
  checkPage(20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text('Employee Assignments', M, y)
  y += 5

  // Group assignments by employee
  const byEmployeeId = new Map<string, { name: string; items: ScheduleAssignment[] }>()
  for (const a of assignments) {
    const entry = byEmployeeId.get(a.employee_id) ?? { name: a.employee_name, items: [] }
    entry.items.push(a)
    byEmployeeId.set(a.employee_id, entry)
  }
  const summaryEntries = Array.from(byEmployeeId.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...LABEL_GRAY)

  if (summaryEntries.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.text('No employees assigned.', M + 2, y)
    y += 5
  } else {
    for (const entry of summaryEntries) {
      checkPage(6)
      // Total unique days across all of this employee's assignments
      const unionDays: DayFlags = [false, false, false, false, false, false, false]
      for (const a of entry.items) {
        for (let i = 0; i < 7; i++) if (a.days[i]) unionDays[i] = true
      }
      const totalDays = countDays(unionDays)

      const perProject = entry.items
        .filter((a) => countDays(a.days) > 0)
        .map((a) => `${a.project_name} (${summarizeDays(a.days)})`)
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

  // ── Unassigned employees ──────────────────────────────────────────────
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
    const text = unassigned.join(', ')
    const wrapped = doc.splitTextToSize(text, CW - 24) as string[]
    let ty = y
    for (let i = 0; i < wrapped.length; i++) {
      checkPage(5)
      doc.text(wrapped[i], M + 22, ty)
      ty += 4
    }
    y = ty + 2
  }

  // ── Schedule conflicts ────────────────────────────────────────────────
  const conflicts = findAllConflicts(assignments)
  if (conflicts.length > 0) {
    y += 3
    checkPage(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...RED)
    doc.text('Schedule Conflicts', M, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...AMBER)
    for (const c of conflicts) {
      checkPage(5)
      const line = `${c.employeeName} — double-booked on ${DAY_LABELS_LONG[c.dayIndex]}: ${c.projectNames.join(', ')}`
      const wrapped = doc.splitTextToSize(line, CW - 4) as string[]
      for (const wline of wrapped) {
        checkPage(5)
        doc.text(wline, M + 2, y)
        y += 4
      }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────
  const generated = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...MED)
    doc.text(
      `${companyIdentity} — Weekly Crew Schedule`,
      M,
      PH - 8
    )
    doc.text(`Generated ${generated}`, PW / 2, PH - 8, { align: 'center' })
    doc.text(`Page ${i} of ${pageCount}`, PW - M, PH - 8, { align: 'right' })
  }

  const filename = `Crew-Schedule-${weekStartISO}.pdf`
  return { blob: doc.output('blob'), filename }
}
