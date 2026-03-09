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

// Color palette (blue theme — matches existing timecard PDF)
const BLUE: [number, number, number] = [37, 99, 235]          // blue-600
const BLUE_DARK: [number, number, number] = [30, 64, 175]     // blue-800
const BLUE_LIGHT: [number, number, number] = [219, 234, 254]  // blue-100
const DARK: [number, number, number] = [17, 24, 39]           // gray-900
const LABEL_GRAY: [number, number, number] = [75, 85, 99]     // gray-600
const MED: [number, number, number] = [107, 114, 128]         // gray-500

interface WeekTimecard {
  content: TimecardContent
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Get day index (0=Mon … 6=Sun) from a date string */
function dayIndex(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() // 0=Sun … 6=Sat
  return day === 0 ? 6 : day - 1
}

/** Format week range like "Mar 2 – Mar 8, 2026" */
function formatWeekRange(weekMonday: string): string {
  const start = new Date(weekMonday + 'T12:00:00')
  const end = new Date(weekMonday + 'T12:00:00')
  end.setDate(end.getDate() + 6)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

export async function generateWeeklyTimesheetPdf(
  projectName: string,
  weekMonday: string,
  timecards: WeekTimecard[],
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
  doc.text('Weekly Timesheet Report', M, headerStartY + 8)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MED)
  doc.text(projectName, M, headerStartY + 14)

  doc.setFontSize(9)
  doc.text(formatWeekRange(weekMonday), M, headerStartY + 19)

  const textBottomY = headerStartY + 21
  y = Math.max(logoBottomY, textBottomY) + 4

  doc.setDrawColor(...BLUE)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + CW, y)
  y += 4

  // ─── PAGE 1: WEEKLY SUMMARY ─────────────────────────────────────────────

  // Aggregate hours per employee per day
  const employeeMap = new Map<string, number[]>()

  for (const tc of timecards) {
    const di = dayIndex(tc.content.date)
    for (const entry of tc.content.entries) {
      let days = employeeMap.get(entry.employee_name)
      if (!days) {
        days = [0, 0, 0, 0, 0, 0, 0]
        employeeMap.set(entry.employee_name, days)
      }
      days[di] += entry.total_hours
    }
  }

  const employees = Array.from(employeeMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))

  sectionTitle('WEEKLY SUMMARY')

  // Table header
  const nameColW = 48
  const dayColW = (CW - nameColW - 20) / 7 // 7 days + total column (20mm)
  const colXName = M
  const colXDays = DAY_NAMES.map((_, i) => M + nameColW + i * dayColW)
  const colXTotal = M + nameColW + 7 * dayColW

  checkPage(8)
  doc.setFillColor(...BLUE_LIGHT)
  doc.rect(M, y - 3, CW, 7, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...BLUE_DARK)
  doc.text('EMPLOYEE', colXName + 2, y)
  for (let i = 0; i < DAY_NAMES.length; i++) {
    doc.text(DAY_NAMES[i].toUpperCase(), colXDays[i] + 1, y)
  }
  doc.text('TOTAL', colXTotal + 1, y)
  y += 6

  // Employee rows
  doc.setFontSize(8)
  let grandTotalHours = 0

  for (let i = 0; i < employees.length; i++) {
    checkPage(8)
    const [name, days] = employees[i]
    const total = days.reduce((s, h) => s + h, 0)
    grandTotalHours += total

    // Zebra stripe
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(M, y - 3.5, CW, 6.5, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK)
    const truncName = doc.splitTextToSize(name, nameColW - 4)
    doc.text(truncName[0], colXName + 2, y)

    doc.setTextColor(...LABEL_GRAY)
    for (let d = 0; d < 7; d++) {
      doc.text(days[d] > 0 ? days[d].toFixed(2) : '—', colXDays[d] + 1, y)
    }

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(total.toFixed(2), colXTotal + 1, y)

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
  doc.setFontSize(9)
  doc.setTextColor(...BLUE_DARK)
  doc.text('GRAND TOTAL', colXName + 2, y + 2.5)
  doc.text(`${grandTotalHours.toFixed(2)} hours`, colXTotal + 1, y + 2.5)
  y += 10

  // ─── PAGES 2+: DAILY BREAKDOWN ─────────────────────────────────────────

  // Group timecards by day
  const dayTimecards = new Map<number, WeekTimecard[]>()
  for (const tc of timecards) {
    const di = dayIndex(tc.content.date)
    const existing = dayTimecards.get(di) ?? []
    existing.push(tc)
    dayTimecards.set(di, existing)
  }

  // Iterate Mon–Sun, skip empty days
  for (let d = 0; d < 7; d++) {
    const dayTcs = dayTimecards.get(d)
    if (!dayTcs || dayTcs.length === 0) continue

    // Collect all entries for this day across all timecards
    const allEntries = dayTcs.flatMap((tc) => tc.content.entries)
    if (allEntries.length === 0) continue

    const dayDate = new Date(weekMonday + 'T12:00:00')
    dayDate.setDate(dayDate.getDate() + d)
    const displayDate = dayDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    sectionTitle(displayDate.toUpperCase())

    // Table header (matches existing timecard PDF)
    const colX = [M, M + 55, M + 80, M + 105, M + 130]

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

    doc.setFontSize(9)
    let dayTotal = 0

    for (let i = 0; i < allEntries.length; i++) {
      checkPage(8)
      const entry = allEntries[i]

      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252)
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

      dayTotal += entry.total_hours
      y += 6
    }

    // Day total
    checkPage(10)
    y += 1
    doc.setDrawColor(...BLUE)
    doc.setLineWidth(0.4)
    doc.line(M, y - 3, M + CW, y - 3)
    doc.setFillColor(...BLUE_LIGHT)
    doc.rect(M, y - 2, CW, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...BLUE_DARK)
    doc.text('DAY TOTAL', colX[0] + 2, y + 2.5)
    doc.text(`${dayTotal.toFixed(2)} hours`, colX[4] + 2, y + 2.5)
    y += 10
  }

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

  const safeName = (projectName || 'timesheet').replace(/[^a-z0-9]/gi, '-').toLowerCase()
  doc.save(`weekly-timesheet-${safeName}-${weekMonday}.pdf`)
}
