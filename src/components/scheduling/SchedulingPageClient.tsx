'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  CalendarIcon,
  UserIcon,
  MailIcon,
  MessageSquareIcon,
  SearchIcon,
  CheckIcon,
  XIcon,
  UsersIcon,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

interface ScheduleEmployee {
  employee_id: string
  employee_name: string
  days: boolean[]
}

interface ScheduleJob {
  job_id: string
  job_name: string
  estimate_number: string | null
  address: string | null
  employees: ScheduleEmployee[]
}

interface ScheduleData {
  week_start: string
  jobs: ScheduleJob[]
}

interface PublishedSchedule {
  id: string
  week_start: string
  published_by: string
  published_at: string
  schedule_data: ScheduleData
}

interface Employee {
  id: string
  name: string
}

interface Props {
  thisWeekISO: string
  nextWeekISO: string
  followingWeekISO: string
  publishedSchedules: PublishedSchedule[]
  publisherNames: Record<string, string>
  employees: Employee[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatDateRange(iso: string): string {
  const start = parseISODateLocal(iso)
  const end = addDays(start, 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function formatPublishedAt(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ─── Component ────────────────────────────────────────────────────────────

export default function SchedulingPageClient({
  thisWeekISO,
  nextWeekISO,
  followingWeekISO,
  publishedSchedules,
  publisherNames,
  employees,
}: Props) {
  const router = useRouter()
  const [activeWeekISO, setActiveWeekISO] = useState(thisWeekISO)

  // Toast state
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Modal state
  const [fullScheduleModalOpen, setFullScheduleModalOpen] = useState(false)
  const [individualModalOpen, setIndividualModalOpen] = useState(false)

  // Send Full Schedule modal state
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(() => new Set())

  // Send Individual modal state
  const [individualSearch, setIndividualSearch] = useState('')
  const [selectedIndividualId, setSelectedIndividualId] = useState<string | null>(null)

  const weeks = useMemo(() => [
    { iso: thisWeekISO, label: 'This Week' },
    { iso: nextWeekISO, label: 'Next Week' },
    { iso: followingWeekISO, label: 'Following Week' },
  ], [thisWeekISO, nextWeekISO, followingWeekISO])

  const currentSchedule = useMemo(() => {
    return publishedSchedules.find((ps) => ps.week_start === activeWeekISO) ?? null
  }, [publishedSchedules, activeWeekISO])

  // For the individual schedule modal — filter the schedule to just one employee
  const individualSchedule = useMemo(() => {
    if (!selectedIndividualId || !currentSchedule) return null
    const jobs: ScheduleJob[] = []
    for (const job of currentSchedule.schedule_data.jobs) {
      const emp = job.employees.find((e) => e.employee_id === selectedIndividualId)
      if (emp) {
        jobs.push({ ...job, employees: [emp] })
      }
    }
    return jobs.length > 0 ? jobs : null
  }, [selectedIndividualId, currentSchedule])

  const filteredEmployees = useMemo(() => {
    if (!individualSearch.trim()) return employees
    const q = individualSearch.toLowerCase()
    return employees.filter((e) => e.name.toLowerCase().includes(q))
  }, [employees, individualSearch])

  // ─── Handlers ─────────────────────────────────────────────────────────

  function toggleEmployee(id: string) {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedEmployeeIds(new Set(employees.map((e) => e.id)))
  }

  function deselectAll() {
    setSelectedEmployeeIds(new Set())
  }

  function openFullScheduleModal() {
    setSelectedEmployeeIds(new Set())
    setFullScheduleModalOpen(true)
  }

  function openIndividualModal() {
    setIndividualSearch('')
    setSelectedIndividualId(null)
    setIndividualModalOpen(true)
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Header */}
      <div className="flex-none px-6 pt-5 pb-3 border-b border-gray-200 dark:border-[#333] bg-white dark:bg-[#222] flex items-center gap-4">
        <button
          onClick={() => router.push('/office')}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#333] transition"
          title="Back to Office"
        >
          <ArrowLeftIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <CalendarIcon className="w-5 h-5 text-amber-500" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Scheduling</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openFullScheduleModal}
            disabled={!currentSchedule}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <UsersIcon className="w-4 h-4" />
            Send Full Schedule
          </button>
          <button
            onClick={openIndividualModal}
            disabled={!currentSchedule}
            className="flex items-center gap-1.5 border border-gray-300 dark:border-[#444] bg-gray-800 dark:bg-[#333] text-gray-100 hover:bg-gray-700 dark:hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-lg text-sm font-medium transition"
          >
            <UserIcon className="w-4 h-4" />
            Send Individual Schedule
          </button>
        </div>
      </div>

      {/* Week selector */}
      <div className="flex-none px-6 py-3 bg-white dark:bg-[#222] border-b border-gray-200 dark:border-[#333]">
        <div className="flex items-center gap-2">
          {weeks.map((w) => (
            <button
              key={w.iso}
              onClick={() => setActiveWeekISO(w.iso)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeWeekISO === w.iso
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333]'
              }`}
            >
              {w.label}
            </button>
          ))}
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
            {formatDateRange(activeWeekISO)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {currentSchedule ? (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Published on {formatPublishedAt(currentSchedule.published_at)} by{' '}
              {publisherNames[currentSchedule.published_by] ?? 'Unknown'}
            </p>

            {/* Schedule cards */}
            <div className="space-y-3">
              {currentSchedule.schedule_data.jobs.map((job) => (
                <div
                  key={job.job_id}
                  style={{ background: '#252525', border: '0.5px solid #333', borderRadius: 8 }}
                  className="overflow-hidden"
                >
                  {/* Card header */}
                  <div className="px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white" style={{ fontSize: 15 }}>
                        {job.job_name}
                      </span>
                      <span className="text-gray-500" style={{ fontSize: 12 }}>
                        {job.employees.length} {job.employees.length === 1 ? 'employee' : 'employees'}
                      </span>
                    </div>
                    {(job.estimate_number || job.address) && (
                      <div className="text-gray-500 mt-0.5" style={{ fontSize: 11 }}>
                        {job.estimate_number && <>Est #{job.estimate_number}</>}
                        {job.estimate_number && job.address && <> · </>}
                        {job.address && <>{job.address}</>}
                      </div>
                    )}
                  </div>

                  {/* Employee chips */}
                  <div className="px-4 pb-3">
                    {job.employees.length === 0 ? (
                      <p className="text-gray-500 py-2" style={{ fontSize: 12 }}>
                        No employees assigned
                      </p>
                    ) : (
                      <div className="grid grid-cols-2" style={{ gap: 6 }}>
                        {job.employees.map((emp) => (
                          <div
                            key={emp.employee_id}
                            style={{ background: '#1e1e1e', borderRadius: 6, padding: '8px 10px' }}
                          >
                            <div className="text-gray-200 mb-1" style={{ fontSize: 13 }}>
                              {emp.employee_name}
                            </div>
                            <div className="flex" style={{ gap: 3 }}>
                              {DAY_LABELS.map((label, i) => (
                                <span
                                  key={i}
                                  className="flex items-center justify-center font-semibold"
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: '50%',
                                    fontSize: 9,
                                    backgroundColor: emp.days[i] ? '#d97706' : '#333',
                                    color: emp.days[i] ? '#fff' : '#666',
                                  }}
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CalendarIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
            <h2 className="text-lg font-semibold text-gray-500 dark:text-gray-400 mb-1">
              No schedule published for this week
            </h2>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Use the Scheduler to create assignments and publish the schedule.
            </p>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 dark:bg-[#333] text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* ── Send Full Schedule Modal ── */}
      {fullScheduleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70"
          onClick={() => setFullScheduleModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#222] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#333]">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Send Full Schedule
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatDateRange(activeWeekISO)}
                </p>
              </div>
              <button
                onClick={() => setFullScheduleModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#333] transition"
              >
                <XIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Employee list */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={selectAll}
                  className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition"
                >
                  Select All
                </button>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <button
                  onClick={deselectAll}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition"
                >
                  Deselect All
                </button>
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                  {selectedEmployeeIds.size} selected
                </span>
              </div>
              <div className="space-y-1">
                {employees.map((emp) => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a] cursor-pointer transition"
                  >
                    <div
                      className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition ${
                        selectedEmployeeIds.has(emp.id)
                          ? 'bg-amber-500 border-amber-500'
                          : 'border-gray-300 dark:border-[#444]'
                      }`}
                      style={{ width: 18, height: 18 }}
                    >
                      {selectedEmployeeIds.has(emp.id) && (
                        <CheckIcon className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedEmployeeIds.has(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{emp.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-200 dark:border-[#333]">
              <button
                onClick={() => {
                  setFullScheduleModalOpen(false)
                  showToast('Email sending coming soon')
                }}
                disabled={selectedEmployeeIds.size === 0}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-lg text-sm font-semibold transition"
              >
                <MailIcon className="w-4 h-4" />
                Send via Email
              </button>
              <button
                onClick={() => {
                  setFullScheduleModalOpen(false)
                  showToast('Text sending coming soon')
                }}
                disabled={selectedEmployeeIds.size === 0}
                className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 dark:border-[#444] bg-gray-800 dark:bg-[#333] text-gray-100 hover:bg-gray-700 dark:hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2.5 rounded-lg text-sm font-medium transition"
              >
                <MessageSquareIcon className="w-4 h-4" />
                Send via Text
              </button>
              <button
                onClick={() => setFullScheduleModalOpen(false)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Individual Schedule Modal ── */}
      {individualModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70"
          onClick={() => setIndividualModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-[#222] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-[#333]">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Send Individual Schedule
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatDateRange(activeWeekISO)}
                </p>
              </div>
              <button
                onClick={() => setIndividualModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#333] transition"
              >
                <XIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Employee search */}
            <div className="px-5 py-3 border-b border-gray-200 dark:border-[#333]">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={individualSearch}
                  onChange={(e) => setIndividualSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-[#444] bg-white dark:bg-[#2a2a2a] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                />
              </div>
            </div>

            {/* Employee list + preview */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {!selectedIndividualId ? (
                <div className="space-y-1">
                  {filteredEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => setSelectedIndividualId(emp.id)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a] text-left transition"
                    >
                      <UserIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{emp.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => setSelectedIndividualId(null)}
                    className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 mb-3 transition"
                  >
                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                    Back to employee list
                  </button>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {employees.find((e) => e.id === selectedIndividualId)?.name}
                    </h3>
                  </div>
                  {individualSchedule ? (
                    <div className="space-y-3">
                      {individualSchedule.map((job) => (
                        <div
                          key={job.job_id}
                          className="bg-gray-50 dark:bg-[#2a2a2a] rounded-lg p-3"
                        >
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            {job.job_name}
                          </div>
                          {job.estimate_number && (
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              Est #{job.estimate_number}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-2">
                            {DAY_LABELS.map((label, i) => {
                              const active = job.employees[0]?.days[i]
                              return (
                                <span
                                  key={i}
                                  className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium ${
                                    active
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-gray-200 dark:bg-[#333] text-gray-400 dark:text-gray-500'
                                  }`}
                                >
                                  {label}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      No assignments for this employee this week.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-200 dark:border-[#333]">
              <button
                onClick={() => {
                  setIndividualModalOpen(false)
                  showToast('Email sending coming soon')
                }}
                disabled={!selectedIndividualId}
                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-lg text-sm font-semibold transition"
              >
                <MailIcon className="w-4 h-4" />
                Send via Email
              </button>
              <button
                onClick={() => {
                  setIndividualModalOpen(false)
                  showToast('Text sending coming soon')
                }}
                disabled={!selectedIndividualId}
                className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 dark:border-[#444] bg-gray-800 dark:bg-[#333] text-gray-100 hover:bg-gray-700 dark:hover:bg-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2.5 rounded-lg text-sm font-medium transition"
              >
                <MessageSquareIcon className="w-4 h-4" />
                Send via Text
              </button>
              <button
                onClick={() => setIndividualModalOpen(false)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
