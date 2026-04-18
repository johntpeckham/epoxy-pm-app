'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeftIcon,
  LoaderIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ChevronDownIcon,
} from 'lucide-react'
import { Project, TimecardContent } from '@/types'

interface Employee {
  id: string
  name: string
  is_active: boolean
}

interface TimesheetReportClientProps {
  projects: Project[]
  employees: Employee[]
}

interface TimecardRow {
  id: string
  project_id: string
  created_at: string
  content: TimecardContent
  project_name: string
}

interface FlatEntry {
  timecardId: string
  date: string
  projectName: string
  projectId: string
  employeeName: string
  timeIn: string
  timeOut: string
  lunchMinutes: number
  totalHours: number
  driveTime: number | null
}

function getDefaultStartDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function getDefaultEndDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function TimesheetReportClient({ projects, employees }: TimesheetReportClientProps) {
  const router = useRouter()
  const supabase = createClient()

  const [startDate, setStartDate] = useState(getDefaultStartDate)
  const [endDate, setEndDate] = useState(getDefaultEndDate)
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<FlatEntry[] | null>(null)
  const [hasGenerated, setHasGenerated] = useState(false)

  const totalHours = useMemo(() => {
    if (!results) return 0
    return results.reduce((sum, e) => sum + e.totalHours, 0)
  }, [results])

  const employeeGroups = useMemo(() => {
    if (!results || results.length === 0) return []
    const map = new Map<string, { entries: FlatEntry[]; total: number }>()
    for (const entry of results) {
      const key = entry.employeeName
      if (!map.has(key)) map.set(key, { entries: [], total: 0 })
      const group = map.get(key)!
      group.entries.push(entry)
      group.total += entry.totalHours
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [results])

  async function handleGenerate() {
    setLoading(true)
    setHasGenerated(true)

    let query = supabase
      .from('feed_posts')
      .select('id, project_id, created_at, content, projects(name)')
      .eq('post_type', 'timecard')
      .order('created_at', { ascending: false })

    if (selectedProject) {
      query = query.eq('project_id', selectedProject)
    }

    const { data: posts, error } = await query

    if (error) {
      console.error('Error fetching timecards:', error)
      setResults([])
      setLoading(false)
      return
    }

    const timecards: TimecardRow[] = (posts ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      project_id: row.project_id as string,
      created_at: row.created_at as string,
      content: row.content as TimecardContent,
      project_name:
        ((row.projects as { name: string } | null)?.name) ?? 'Unknown Project',
    }))

    const flat: FlatEntry[] = []

    for (const tc of timecards) {
      const date = tc.content.date || tc.created_at.slice(0, 10)

      if (date < startDate || date > endDate) continue

      for (const entry of tc.content.entries) {
        if (selectedEmployee && entry.employee_name !== selectedEmployee) continue

        flat.push({
          timecardId: tc.id,
          date,
          projectName: tc.project_name,
          projectId: tc.project_id,
          employeeName: entry.employee_name,
          timeIn: entry.time_in,
          timeOut: entry.time_out,
          lunchMinutes: entry.lunch_minutes,
          totalHours: entry.total_hours,
          driveTime: entry.drive_time ?? null,
        })
      }
    }

    flat.sort((a, b) => b.date.localeCompare(a.date))
    setResults(flat)
    setLoading(false)
  }

  async function handleExportPdf() {
    if (!results || results.length === 0) return

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
    const PW = doc.internal.pageSize.getWidth()
    const PH = doc.internal.pageSize.getHeight()
    const M = 15
    const CW = PW - M * 2
    let y = M

    function checkPage(needed = 15) {
      if (y + needed > PH - M) {
        doc.addPage()
        y = M
      }
    }

    doc.setFontSize(16)
    doc.setTextColor(17, 24, 39)
    doc.text('Timesheet Report', M, y)
    y += 7

    doc.setFontSize(9)
    doc.setTextColor(107, 114, 128)
    const filterParts = [`${formatDate(startDate)} – ${formatDate(endDate)}`]
    if (selectedEmployee) filterParts.push(`Employee: ${selectedEmployee}`)
    if (selectedProject) {
      const proj = projects.find(p => p.id === selectedProject)
      if (proj) filterParts.push(`Job: ${proj.name}`)
    }
    doc.text(filterParts.join('  |  '), M, y)
    y += 4
    doc.text(`Total hours: ${totalHours.toFixed(2)}  |  ${results.length} entries`, M, y)
    y += 8

    const cols = [
      { label: 'Employee', width: CW * 0.2 },
      { label: 'Job/Project', width: CW * 0.25 },
      { label: 'Date', width: CW * 0.12 },
      { label: 'Time In', width: CW * 0.1 },
      { label: 'Time Out', width: CW * 0.1 },
      { label: 'Lunch (min)', width: CW * 0.1 },
      { label: 'Hours', width: CW * 0.08 },
      { label: 'Drive', width: CW * 0.05 },
    ]

    doc.setFillColor(245, 245, 245)
    doc.rect(M, y, CW, 7, 'F')
    doc.setFontSize(8)
    doc.setTextColor(75, 85, 99)
    let xPos = M + 2
    for (const col of cols) {
      doc.text(col.label, xPos, y + 5)
      xPos += col.width
    }
    y += 9

    doc.setTextColor(17, 24, 39)
    for (const entry of results) {
      checkPage(7)
      xPos = M + 2
      doc.setFontSize(8)
      const values = [
        entry.employeeName,
        entry.projectName,
        formatDate(entry.date),
        formatTime(entry.timeIn),
        formatTime(entry.timeOut),
        String(entry.lunchMinutes),
        entry.totalHours.toFixed(2),
        entry.driveTime != null ? entry.driveTime.toFixed(1) : '',
      ]
      for (let i = 0; i < cols.length; i++) {
        const text = values[i]
        const maxWidth = cols[i].width - 2
        const truncated = doc.getTextWidth(text) > maxWidth
          ? text.slice(0, Math.floor(text.length * maxWidth / doc.getTextWidth(text))) + '...'
          : text
        doc.text(truncated, xPos, y + 4)
        xPos += cols[i].width
      }
      y += 6
    }

    checkPage(10)
    y += 2
    doc.setFillColor(254, 243, 199)
    doc.rect(M, y, CW, 7, 'F')
    doc.setFontSize(9)
    doc.setTextColor(180, 83, 9)
    doc.text(`Total Hours: ${totalHours.toFixed(2)}`, M + 2, y + 5)

    doc.save(`Timesheet_Report_${startDate}_to_${endDate}.pdf`)
  }

  async function handleExportExcel() {
    if (!results || results.length === 0) return

    const XLSX = await import('xlsx')
    const headerRows = [
      ['Timesheet Report'],
      [`Date Range: ${formatDate(startDate)} – ${formatDate(endDate)}`],
      [
        selectedEmployee ? `Employee: ${selectedEmployee}` : 'All Employees',
        selectedProject
          ? `Job: ${projects.find(p => p.id === selectedProject)?.name ?? ''}`
          : 'All Jobs',
      ].filter(Boolean),
      [],
    ]

    const dataRows = [
      ['Employee', 'Job/Project', 'Date', 'Time In', 'Time Out', 'Lunch (min)', 'Hours', 'Drive Time'],
      ...results.map(e => [
        e.employeeName,
        e.projectName,
        e.date,
        formatTime(e.timeIn),
        formatTime(e.timeOut),
        e.lunchMinutes,
        e.totalHours,
        e.driveTime ?? '',
      ]),
      [],
      ['', '', '', '', '', 'Total:', totalHours.toFixed(2), ''],
    ]

    const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows])

    ws['!cols'] = [
      { wch: 22 },
      { wch: 28 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Timesheet Report')
    XLSX.writeFile(wb, `Timesheet_Report_${startDate}_to_${endDate}.xlsx`)
  }

  const uniqueEmployeeNames = useMemo(() => {
    const names = employees.filter(e => e.is_active).map(e => e.name)
    return Array.from(new Set(names)).sort()
  }, [employees])

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/reports')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5 text-gray-600 dark:text-[#a0a0a0]" />
        </button>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-[#e5e5e5]">Timesheet Report</h1>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#242424] border border-gray-200/80 dark:border-[#2a2a2a] rounded-lg p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Start date */}
          <div>
            <label className="block text-[12px] font-medium text-gray-500 dark:text-[#a0a0a0] mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-[13px] text-gray-900 dark:text-[#e5e5e5] bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* End date */}
          <div>
            <label className="block text-[12px] font-medium text-gray-500 dark:text-[#a0a0a0] mb-1">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-[13px] text-gray-900 dark:text-[#e5e5e5] bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#3a3a3a] rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Employee filter */}
          <div>
            <label className="block text-[12px] font-medium text-gray-500 dark:text-[#a0a0a0] mb-1">Employee</label>
            <div className="relative">
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-3 py-2 text-[13px] text-gray-900 dark:text-[#e5e5e5] bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#3a3a3a] rounded-md appearance-none focus:outline-none focus:ring-1 focus:ring-amber-500 pr-8"
              >
                <option value="">All employees</option>
                {uniqueEmployeeNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Job/Project filter */}
          <div>
            <label className="block text-[12px] font-medium text-gray-500 dark:text-[#a0a0a0] mb-1">Job / Project</label>
            <div className="relative">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 text-[13px] text-gray-900 dark:text-[#e5e5e5] bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#3a3a3a] rounded-md appearance-none focus:outline-none focus:ring-1 focus:ring-amber-500 pr-8"
              >
                <option value="">All jobs</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[13px] font-medium rounded-md transition-colors flex items-center gap-2"
          >
            {loading && <LoaderIcon className="w-4 h-4 animate-spin" />}
            Generate Report
          </button>
        </div>
      </div>

      {/* Results area */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <LoaderIcon className="w-6 h-6 text-amber-600 animate-spin" />
        </div>
      )}

      {!loading && hasGenerated && results && results.length === 0 && (
        <div className="bg-white dark:bg-[#242424] border border-gray-200/80 dark:border-[#2a2a2a] rounded-lg p-12 text-center">
          <p className="text-[14px] text-gray-500 dark:text-[#a0a0a0]">No timesheet entries found for the selected filters</p>
        </div>
      )}

      {!loading && results && results.length > 0 && (
        <div className="bg-white dark:bg-[#242424] border border-gray-200/80 dark:border-[#2a2a2a] rounded-lg overflow-hidden">
          {/* Export buttons */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/80 dark:border-[#2a2a2a]">
            <p className="text-[13px] text-gray-500 dark:text-[#a0a0a0]">
              {results.length} {results.length === 1 ? 'entry' : 'entries'} &middot; {totalHours.toFixed(2)} total hours
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-700 dark:text-[#ccc] bg-gray-50 dark:bg-[#333] border border-gray-200 dark:border-[#444] rounded-md hover:bg-gray-100 dark:hover:bg-[#3a3a3a] transition-colors"
              >
                <FileTextIcon className="w-3.5 h-3.5" />
                Export PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-700 dark:text-[#ccc] bg-gray-50 dark:bg-[#333] border border-gray-200 dark:border-[#444] rounded-md hover:bg-gray-100 dark:hover:bg-[#3a3a3a] transition-colors"
              >
                <FileSpreadsheetIcon className="w-3.5 h-3.5" />
                Export Excel
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#2a2a2a] border-b border-gray-200/80 dark:border-[#333]">
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Job / Project</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Time In</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Time Out</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Lunch</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-medium text-gray-500 dark:text-[#888] uppercase tracking-wider">Hours</th>
                </tr>
              </thead>
              <tbody>
                {selectedEmployee ? (
                  <>
                    {results.map((entry, i) => (
                      <tr key={`${entry.timecardId}-${i}`} className="border-b border-gray-100 dark:border-[#2a2a2a] hover:bg-gray-50/50 dark:hover:bg-[#2a2a2a]/50">
                        <td className="px-4 py-2.5 text-gray-900 dark:text-[#e5e5e5]">{entry.employeeName}</td>
                        <td className="px-4 py-2.5 text-gray-700 dark:text-[#ccc]">{entry.projectName}</td>
                        <td className="px-4 py-2.5 text-gray-700 dark:text-[#ccc]">{formatDate(entry.date)}</td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-[#aaa]">{formatTime(entry.timeIn)}</td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-[#aaa]">{formatTime(entry.timeOut)}</td>
                        <td className="px-4 py-2.5 text-gray-600 dark:text-[#aaa]">{entry.lunchMinutes} min</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900 dark:text-[#e5e5e5]">{entry.totalHours.toFixed(2)}</td>
                      </tr>
                    ))}
                  </>
                ) : (
                  employeeGroups.map((group) => (
                    <GroupRows key={group.name} group={group} />
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-amber-50 dark:bg-amber-900/20">
                  <td colSpan={6} className="px-4 py-3 text-[13px] font-semibold text-amber-800 dark:text-amber-400">
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] font-semibold text-amber-800 dark:text-amber-400">
                    {totalHours.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupRows({ group }: { group: { name: string; entries: FlatEntry[]; total: number } }) {
  return (
    <>
      {group.entries.map((entry, i) => (
        <tr key={`${entry.timecardId}-${i}`} className="border-b border-gray-100 dark:border-[#2a2a2a] hover:bg-gray-50/50 dark:hover:bg-[#2a2a2a]/50">
          {i === 0 ? (
            <td rowSpan={group.entries.length + 1} className="px-4 py-2.5 text-gray-900 dark:text-[#e5e5e5] font-medium align-top border-r border-gray-100 dark:border-[#2a2a2a]">
              {group.name}
            </td>
          ) : null}
          <td className="px-4 py-2.5 text-gray-700 dark:text-[#ccc]">{entry.projectName}</td>
          <td className="px-4 py-2.5 text-gray-700 dark:text-[#ccc]">{formatDate(entry.date)}</td>
          <td className="px-4 py-2.5 text-gray-600 dark:text-[#aaa]">{formatTime(entry.timeIn)}</td>
          <td className="px-4 py-2.5 text-gray-600 dark:text-[#aaa]">{formatTime(entry.timeOut)}</td>
          <td className="px-4 py-2.5 text-gray-600 dark:text-[#aaa]">{entry.lunchMinutes} min</td>
          <td className="px-4 py-2.5 text-right font-medium text-gray-900 dark:text-[#e5e5e5]">{entry.totalHours.toFixed(2)}</td>
        </tr>
      ))}
      <tr className="border-b border-gray-200 dark:border-[#333] bg-gray-50/50 dark:bg-[#2a2a2a]/30">
        <td colSpan={5} className="px-4 py-2 text-right text-[12px] font-medium text-gray-500 dark:text-[#888]">
          Subtotal — {group.name}
        </td>
        <td className="px-4 py-2 text-right text-[12px] font-semibold text-gray-700 dark:text-[#ccc]">
          {group.total.toFixed(2)}
        </td>
      </tr>
    </>
  )
}
