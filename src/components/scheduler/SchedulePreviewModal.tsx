'use client'

import { useEffect } from 'react'
import {
  XIcon,
  DownloadIcon,
  PrinterIcon,
  Loader2Icon,
  AlertTriangleIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────
type DayFlags = [boolean, boolean, boolean, boolean, boolean, boolean, boolean]

export interface PreviewAssignment {
  employee_id: string
  employee_name: string
  project_id: string
  project_name: string
  days: DayFlags
}

export interface PreviewProject {
  id: string
  name: string
  estimate_number?: string | null
  address?: string | null
  start_date?: string | null
  end_date?: string | null
}

export interface PreviewCompanyInfo {
  dba?: string | null
  legal_name?: string | null
  company_address?: string | null
  phone?: string | null
  email?: string | null
  cslb_licenses?: { number: string; classification: string }[] | null
}

interface Props {
  weekStartISO: string
  thisWeekISO: string
  nextWeekISO: string
  followingWeekISO: string
  assignments: PreviewAssignment[]
  /** Active projects (used for table rows + Gantt bars) */
  projects: PreviewProject[]
  /** Full employee roster — used to compute the Unassigned list */
  employees: Array<{ id: string; name: string }>
  companyInfo: PreviewCompanyInfo | null
  logoUrl: string | null
  onClose: () => void
  onDownload: () => void | Promise<void>
  downloading: boolean
}

// ─── Helpers (kept local — mirror generateSchedulePdf so the rendered
// preview matches the downloaded PDF) ─────────────────────────────────────
const DAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_LABELS_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

function parseISODateLocal(iso: string): Date {
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

function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function rangeLabel(start: Date): string {
  const end = addDays(start, 6)
  return `${formatShort(start)} – ${formatShort(end)}`
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

interface JobBar {
  project: PreviewProject
  startDay: number
  endDay: number
}

function computeBarsForWeek(
  weekStart: Date,
  projects: PreviewProject[]
): JobBar[] {
  const weekEnd = addDays(weekStart, 6)
  const bars: JobBar[] = []
  for (const project of projects) {
    if (!project.start_date || !project.end_date) continue
    const start = parseISODateLocal(project.start_date)
    const end = parseISODateLocal(project.end_date)
    if (end < weekStart || start > weekEnd) continue
    const clampedStart = start < weekStart ? weekStart : start
    const clampedEnd = end > weekEnd ? weekEnd : end
    const startDay = Math.max(0, Math.min(6, daysBetween(weekStart, clampedStart)))
    const endDay = Math.max(0, Math.min(6, daysBetween(weekStart, clampedEnd)))
    bars.push({ project, startDay, endDay })
  }
  bars.sort((a, b) => {
    if (a.startDay !== b.startDay) return a.startDay - b.startDay
    if (a.endDay !== b.endDay) return b.endDay - a.endDay
    return a.project.name.localeCompare(b.project.name)
  })
  return bars
}

const JOB_COLOR_PALETTE = [
  '#d97706',
  '#4a6fa5',
  '#7c6b9e',
  '#3f8a7e',
  '#6b7c4a',
  '#b05a4a',
  '#4682b4',
  '#9c7c4a',
]

function colorForProjectId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i)
    hash |= 0
  }
  return JOB_COLOR_PALETTE[Math.abs(hash) % JOB_COLOR_PALETTE.length]
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

function summarizeDays(days: DayFlags): string {
  const active = days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0) as number[]
  if (active.length === 0) return ''
  if (active.length === 7) return 'All week'
  const ranges: string[] = []
  let s = active[0]
  let e = active[0]
  for (let k = 1; k < active.length; k++) {
    if (active[k] === e + 1) {
      e = active[k]
    } else {
      ranges.push(
        s === e
          ? DAY_LABELS_SHORT[s]
          : `${DAY_LABELS_SHORT[s]}-${DAY_LABELS_SHORT[e]}`
      )
      s = active[k]
      e = active[k]
    }
  }
  ranges.push(
    s === e ? DAY_LABELS_SHORT[s] : `${DAY_LABELS_SHORT[s]}-${DAY_LABELS_SHORT[e]}`
  )
  return ranges.join(', ')
}

function countDays(days: DayFlags): number {
  return days.reduce((n, v) => n + (v ? 1 : 0), 0)
}

interface ScheduleConflict {
  employeeName: string
  dayIndex: number
  projectNames: string[]
}

function findAllConflicts(
  assignments: PreviewAssignment[]
): ScheduleConflict[] {
  const byEmployee = new Map<string, PreviewAssignment[]>()
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

// ─── Component ────────────────────────────────────────────────────────────
export default function SchedulePreviewModal({
  weekStartISO,
  thisWeekISO,
  nextWeekISO,
  followingWeekISO,
  assignments,
  projects,
  employees,
  companyInfo,
  logoUrl,
  onClose,
  onDownload,
  downloading,
}: Props) {
  // Esc to close (unless we're mid-download)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !downloading) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, downloading])

  function handlePrint() {
    window.print()
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const weekStart = parseISODateLocal(weekStartISO)
  const weekEnd = addDays(weekStart, 6)
  const year = weekStart.getFullYear()
  const rangeText = `Week of ${formatMonthDay(weekStart)} – ${formatMonthDay(weekEnd)}, ${year}`

  // Letterhead
  const ci = companyInfo ?? {}
  let companyIdentity: string
  if (
    ci.legal_name &&
    ci.dba &&
    ci.legal_name.toLowerCase() !== ci.dba.toLowerCase()
  ) {
    companyIdentity = `${ci.legal_name} DBA ${ci.dba}`
  } else {
    companyIdentity = ci.dba || ci.legal_name || 'Peckham Coatings'
  }
  const addressLine = ci.company_address
    ? ci.company_address.replace(/\n/g, ', ')
    : null
  const contactParts: string[] = []
  if (ci.phone) contactParts.push(ci.phone)
  if (ci.email) contactParts.push(ci.email)
  const contactLine = contactParts.length > 0 ? contactParts.join(' | ') : null
  let cslbLine: string | null = null
  if (ci.cslb_licenses && ci.cslb_licenses.length > 0) {
    const parts = ci.cslb_licenses.map((l) => {
      const code = l.classification.includes(' - ')
        ? l.classification.split(' - ')[0].trim()
        : l.classification.trim()
      return `#${l.number} (${code})`
    })
    cslbLine = `CSLB Lic. ${parts.join(', ')}`
  }

  // Build visible projects: active + any referenced in assignments
  const projectOrder: PreviewProject[] = [...projects]
  const knownIds = new Set(projects.map((p) => p.id))
  for (const a of assignments) {
    if (!knownIds.has(a.project_id)) {
      knownIds.add(a.project_id)
      projectOrder.push({ id: a.project_id, name: a.project_name })
    }
  }
  const assignmentsByProject = new Map<string, PreviewAssignment[]>()
  for (const a of assignments) {
    if (!assignmentsByProject.has(a.project_id))
      assignmentsByProject.set(a.project_id, [])
    assignmentsByProject.get(a.project_id)!.push(a)
  }
  const visibleProjects = projectOrder.filter(
    (p) =>
      projects.some((ap) => ap.id === p.id) ||
      (assignmentsByProject.get(p.id)?.length ?? 0) > 0
  )

  // Employee summary
  const byEmployeeId = new Map<
    string,
    { name: string; items: PreviewAssignment[] }
  >()
  for (const a of assignments) {
    const entry = byEmployeeId.get(a.employee_id) ?? {
      name: a.employee_name,
      items: [],
    }
    entry.items.push(a)
    byEmployeeId.set(a.employee_id, entry)
  }
  const summaryEntries = Array.from(byEmployeeId.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  // Unassigned
  const assignedIds = new Set(byEmployeeId.keys())
  const unassigned = employees
    .filter((e) => !assignedIds.has(e.id))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))

  // Conflicts
  const conflicts = findAllConflicts(assignments)

  // 3-week Gantt rows
  const ganttWeeks = [
    { label: 'This Week', iso: thisWeekISO, date: parseISODateLocal(thisWeekISO) },
    { label: 'Next Week', iso: nextWeekISO, date: parseISODateLocal(nextWeekISO) },
    {
      label: 'Following Week',
      iso: followingWeekISO,
      date: parseISODateLocal(followingWeekISO),
    },
  ].map((w) => ({ ...w, bars: computeBarsForWeek(w.date, projects) }))

  return (
    <div
      className="schedule-preview-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !downloading) onClose()
      }}
    >
      {/* Print stylesheet — only the .schedule-print-paper is visible during
          window.print(), so the printed page matches the PDF download. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .schedule-print-paper, .schedule-print-paper * { visibility: visible !important; }
          .schedule-print-paper .no-print { display: none !important; }
          .schedule-print-paper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0.5in !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
          }
          .schedule-preview-overlay {
            position: static !important;
            background: white !important;
            display: block !important;
            padding: 0 !important;
          }
          @page { size: letter landscape; margin: 0.25in; }
        }
      `}</style>

      <div
        className="bg-[#1e1e1e] border border-[#3a3a3a] rounded-xl shadow-2xl flex flex-col w-full max-w-6xl"
        style={{ maxHeight: '95vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (not printed) */}
        <div className="flex-none flex items-center justify-between gap-3 px-5 py-3 border-b border-[#3a3a3a]">
          <h2 className="text-base font-semibold text-[#e5e5e5]">
            Schedule Preview
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-[#4a4a4a] bg-[#2a2a2a] text-[#c0c0c0] hover:bg-[#3a3a3a] hover:border-[#5a5a5a] transition disabled:opacity-50"
            >
              <PrinterIcon className="w-4 h-4" />
              Print
            </button>
            <button
              type="button"
              onClick={() => void onDownload()}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white shadow-sm transition disabled:opacity-50"
            >
              {downloading ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                <DownloadIcon className="w-4 h-4" />
              )}
              {downloading ? 'Generating…' : 'Download'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={downloading}
              className="p-2 rounded-lg text-[#9a9a9a] hover:text-[#e5e5e5] hover:bg-[#2a2a2a] transition disabled:opacity-50"
              aria-label="Close preview"
              title="Close"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable paper area */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#0f0f0f] p-6">
          <div
            className="schedule-print-paper mx-auto bg-white text-gray-900 shadow-lg rounded"
            style={{ maxWidth: '11in', padding: '0.5in' }}
          >
            {/* Letterhead */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-gray-300">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 leading-tight">
                  {companyIdentity}
                </h1>
                {addressLine && (
                  <p className="text-xs text-gray-600 mt-0.5">{addressLine}</p>
                )}
                {contactLine && (
                  <p className="text-xs text-gray-600 mt-0.5">{contactLine}</p>
                )}
                {cslbLine && (
                  <p className="text-[10px] text-gray-500 mt-0.5">{cslbLine}</p>
                )}
              </div>
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-12 w-auto object-contain flex-shrink-0"
                />
              )}
            </div>

            {/* Title + range */}
            <div className="text-center mt-4 mb-4">
              <h2 className="text-lg font-bold tracking-wide text-gray-900">
                WEEKLY CREW SCHEDULE
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">{rangeText}</p>
            </div>

            {/* 3-week Gantt context strip — screen-only (hidden in print to
                match the downloaded PDF, which contains the table only). */}
            <div className="mb-5 no-print">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-2">
                3-Week Outlook
              </h3>
              <div className="space-y-1">
                {ganttWeeks.map((w) => {
                  const isActive = w.iso === weekStartISO
                  const days = Array.from({ length: 7 }, (_, i) =>
                    addDays(w.date, i)
                  )
                  return (
                    <div
                      key={w.iso}
                      className={`border rounded overflow-hidden ${
                        isActive
                          ? 'border-amber-400 bg-amber-50/60'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      <div
                        className="grid items-stretch"
                        style={{
                          gridTemplateColumns:
                            '120px repeat(7, minmax(0, 1fr))',
                        }}
                      >
                        <div className="px-2 py-0.5 border-r border-gray-200 flex items-center">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isActive ? 'text-amber-700' : 'text-gray-600'
                            }`}
                          >
                            {w.label}
                          </span>
                        </div>
                        {days.map((d, i) => (
                          <div
                            key={i}
                            className="px-1 py-0.5 border-r border-gray-100 last:border-r-0"
                          >
                            <span
                              className={`block text-[9px] font-medium ${
                                isActive ? 'text-amber-700' : 'text-gray-500'
                              }`}
                            >
                              {DAY_LABELS_SHORT[i]} {d.getDate()}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div
                        className="grid gap-y-px py-0.5 border-t border-gray-200"
                        style={{
                          gridTemplateColumns:
                            '120px repeat(7, minmax(0, 1fr))',
                          gridAutoRows: '15px',
                          minHeight: '17px',
                        }}
                      >
                        <div
                          className={`flex items-center px-2 text-[9px] ${
                            isActive ? 'text-amber-700' : 'text-gray-500'
                          }`}
                          style={{ gridColumn: 1, gridRow: 1 }}
                        >
                          {rangeLabel(w.date)}
                        </div>
                        {w.bars.length === 0 && (
                          <div
                            className="flex items-center px-2 text-[9px] italic text-gray-400"
                            style={{ gridColumn: '2 / 9', gridRow: 1 }}
                          >
                            No active projects this week
                          </div>
                        )}
                        {w.bars.map((bar, idx) => {
                          const barLabel = bar.project.estimate_number
                            ? `${bar.project.name} — Est #${bar.project.estimate_number}`
                            : bar.project.name
                          return (
                            <div
                              key={`${bar.project.id}-${idx}`}
                              className="mx-0.5 flex items-center min-w-0 px-1.5 text-[9px] font-semibold truncate text-white"
                              style={{
                                gridColumn: `${bar.startDay + 2} / ${
                                  bar.endDay + 3
                                }`,
                                gridRow: idx + 1,
                                backgroundColor: colorForProjectId(
                                  bar.project.id
                                ),
                                borderRadius: '2px',
                                height: '13px',
                              }}
                              title={barLabel}
                            >
                              {barLabel}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Schedule table */}
            <div className="mb-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-2">
                Daily Assignments
              </h3>
              <table
                className="w-full border-collapse text-xs"
                style={{ tableLayout: 'fixed' }}
              >
                <colgroup>
                  <col style={{ width: '22%' }} />
                  {Array.from({ length: 7 }).map((_, i) => (
                    <col key={i} style={{ width: `${78 / 7}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-2 text-left text-xs font-bold text-gray-900">
                      Project
                    </th>
                    {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(
                      (d, i) => (
                        <th
                          key={i}
                          className="border border-gray-300 px-1 py-2 text-center text-xs font-bold text-gray-900"
                        >
                          {DAY_LABELS_SHORT[i]} {d.getMonth() + 1}/{d.getDate()}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleProjects.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="border border-gray-300 px-2 py-4 text-center text-xs italic text-gray-500"
                      >
                        No active projects or assignments.
                      </td>
                    </tr>
                  ) : (
                    visibleProjects.map((project, rowIdx) => {
                      const isInactive = !projects.some((p) => p.id === project.id)
                      const projectAssignments =
                        assignmentsByProject.get(project.id) ?? []
                      return (
                        <tr
                          key={project.id}
                          className={rowIdx % 2 === 1 ? 'bg-gray-50' : 'bg-white'}
                        >
                          <td className="border border-gray-300 px-2 py-1.5 align-top">
                            <p
                              className={`text-xs font-bold leading-tight ${
                                isInactive ? 'text-gray-500' : 'text-gray-900'
                              }`}
                            >
                              {project.name || 'Untitled'}
                            </p>
                            {project.estimate_number && (
                              <p className="text-[10px] text-gray-500 leading-tight mt-0.5">
                                Est #{project.estimate_number}
                              </p>
                            )}
                            {project.address && (
                              <p className="text-[10px] text-gray-500 leading-tight">
                                {project.address}
                              </p>
                            )}
                            {project.start_date && project.end_date && (
                              <p className="text-[10px] text-gray-500 leading-tight">
                                {formatShort(parseISODateLocal(project.start_date))}{' '}
                                – {formatShort(parseISODateLocal(project.end_date))}
                              </p>
                            )}
                            {isInactive && (
                              <p className="text-[10px] text-gray-500 leading-tight italic">
                                (Inactive)
                              </p>
                            )}
                          </td>
                          {Array.from({ length: 7 }).map((_, d) => {
                            const names = projectAssignments
                              .filter((a) => a.days[d])
                              .map((a) => firstName(a.employee_name))
                            return (
                              <td
                                key={d}
                                className="border border-gray-300 px-1 py-1.5 align-top text-center text-[11px] text-gray-900"
                              >
                                {names.length === 0 ? (
                                  <span className="text-gray-400">—</span>
                                ) : (
                                  names.join(', ')
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Employee Assignments summary */}
            <div className="mb-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-2">
                Employee Assignments
              </h3>
              {summaryEntries.length === 0 ? (
                <p className="text-xs italic text-gray-500">
                  No employees assigned.
                </p>
              ) : (
                <ul className="space-y-1">
                  {summaryEntries.map((entry) => {
                    const unionDays: DayFlags = [
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                    ]
                    for (const a of entry.items) {
                      for (let i = 0; i < 7; i++)
                        if (a.days[i]) unionDays[i] = true
                    }
                    const totalDays = countDays(unionDays)
                    const perProject = entry.items
                      .filter((a) => countDays(a.days) > 0)
                      .map((a) => `${a.project_name} (${summarizeDays(a.days)})`)
                      .join('; ')
                    return (
                      <li key={entry.name} className="text-xs text-gray-900">
                        <span className="font-semibold">{entry.name}</span>{' '}
                        <span className="text-gray-600">
                          — {totalDays} day{totalDays === 1 ? '' : 's'}
                          {perProject ? `: ${perProject}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Unassigned */}
            {unassigned.length > 0 && (
              <div className="mb-4">
                <span className="text-xs font-bold text-gray-900">
                  Unassigned:{' '}
                </span>
                <span className="text-xs text-gray-600">
                  {unassigned.join(', ')}
                </span>
              </div>
            )}

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <div className="mb-4 pt-3 border-t border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangleIcon className="w-4 h-4 text-red-600" />
                  <h3 className="text-sm font-bold text-red-700">
                    Schedule Conflicts
                  </h3>
                </div>
                <ul className="space-y-1">
                  {conflicts.map((c, i) => (
                    <li key={i} className="text-xs text-amber-700">
                      <span className="font-semibold text-gray-900">
                        {c.employeeName}
                      </span>{' '}
                      — double-booked on {DAY_LABELS_LONG[c.dayIndex]}:{' '}
                      {c.projectNames.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 pt-3 border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-500">
              <span>{companyIdentity} — Weekly Crew Schedule</span>
              <span>
                Generated{' '}
                {new Date().toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
