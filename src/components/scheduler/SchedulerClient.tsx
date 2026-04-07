'use client'

import { useMemo } from 'react'
import type { EmployeeProfile } from '@/types'
import { CalendarRangeIcon, MonitorIcon } from 'lucide-react'

interface Props {
  userId: string
  employees: EmployeeProfile[]
}

// ── Date helpers ────────────────────────────────────────────────────────────
function startOfWeekMonday(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  const day = r.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + diff)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7)
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function rangeLabel(start: Date): string {
  const end = addDays(start, 6)
  return `${formatShort(start)} – ${formatShort(end)}`
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Employee grouping ───────────────────────────────────────────────────────
const ROLE_ORDER = ['Foreman', 'Laborer', 'Crew']

function groupEmployees(employees: EmployeeProfile[]): Array<{ label: string; members: EmployeeProfile[] }> {
  const buckets = new Map<string, EmployeeProfile[]>()
  for (const e of employees) {
    const key = (e.role || 'Other').trim()
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(e)
  }
  const knownKeys = Array.from(buckets.keys())
  // Sort so ROLE_ORDER items come first in that order, then the rest alphabetically
  knownKeys.sort((a, b) => {
    const ia = ROLE_ORDER.findIndex((r) => r.toLowerCase() === a.toLowerCase())
    const ib = ROLE_ORDER.findIndex((r) => r.toLowerCase() === b.toLowerCase())
    const ra = ia === -1 ? 99 : ia
    const rb = ib === -1 ? 99 : ib
    if (ra !== rb) return ra - rb
    return a.localeCompare(b)
  })
  return knownKeys.map((key) => ({
    label: pluralizeGroupLabel(key),
    members: buckets.get(key)!,
  }))
}

function pluralizeGroupLabel(role: string): string {
  const t = role.trim()
  if (!t) return 'OTHER'
  const upper = t.toUpperCase()
  // Simple pluralization for common cases
  if (upper === 'FOREMAN') return 'FOREMAN'
  if (upper.endsWith('S')) return upper
  return `${upper}S`
}

// ── Component ───────────────────────────────────────────────────────────────
export default function SchedulerClient({ employees }: Props) {
  // Weeks
  const { thisWeek, nextWeek, followingWeek } = useMemo(() => {
    const today = new Date()
    const thisWeek = startOfWeekMonday(today)
    return {
      thisWeek,
      nextWeek: addWeeks(thisWeek, 1),
      followingWeek: addWeeks(thisWeek, 2),
    }
  }, [])

  const employeeGroups = useMemo(() => groupEmployees(employees), [employees])

  return (
    <div className="h-full w-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Mobile: show unsupported message */}
      <div className="lg:hidden flex-1 flex flex-col items-center justify-center p-6 text-center">
        <MonitorIcon className="w-10 h-10 text-gray-300 mb-3" />
        <h2 className="text-lg font-semibold text-gray-700 mb-1">Scheduler is optimized for desktop</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Open this page on a larger screen to build weekly crew schedules.
        </p>
      </div>

      {/* Desktop layout */}
      <div className="hidden lg:flex flex-col h-full w-full">
        {/* Page header */}
        <div className="flex-none px-6 pt-5 pb-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <CalendarRangeIcon className="w-5 h-5 text-amber-500" />
            <h1 className="text-lg font-semibold text-gray-900">Scheduler</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Build next week&apos;s crew schedule by dragging employees into job buckets.
          </p>
        </div>

        {/* TOP: Three-week calendar strip */}
        <div className="flex-none px-6 py-4 bg-white border-b border-gray-200">
          <div className="space-y-2">
            <WeekRow label="This Week" weekStart={thisWeek} tone="muted" />
            <WeekRow label="Next Week" weekStart={nextWeek} tone="highlight" />
            <WeekRow label="Following Week" weekStart={followingWeek} tone="muted" />
          </div>
        </div>

        {/* MIDDLE: Scheduling area */}
        <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
          <div className="h-full min-h-[240px] rounded-xl border-2 border-dashed border-gray-200 bg-gray-100/60 flex items-center justify-center">
            <div className="text-center px-6">
              <CalendarRangeIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">
                Drag employees to job buckets to build the schedule
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Job buckets for active projects will appear here in Phase 2.
              </p>
            </div>
          </div>
        </div>

        {/* BOTTOM: Employee cards strip */}
        <div className="flex-none border-t border-gray-200 bg-white" style={{ height: '22vh', minHeight: 180 }}>
          <div className="h-full overflow-y-auto px-6 py-3">
            {employeeGroups.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-gray-400">No employees found. Add employees in Settings → Employee Management.</p>
              </div>
            ) : (
              <div className="flex gap-6 h-full">
                {employeeGroups.map((group) => (
                  <div key={group.label} className="flex flex-col min-w-0 flex-shrink-0">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
                      {group.label}
                    </h3>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {group.members.map((emp) => (
                        <EmployeeCard key={emp.id} employee={emp} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Week row ────────────────────────────────────────────────────────────────
function WeekRow({
  label,
  weekStart,
  tone,
}: {
  label: string
  weekStart: Date
  tone: 'muted' | 'highlight'
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const highlight = tone === 'highlight'
  return (
    <div
      className={`flex items-stretch rounded-lg border ${
        highlight
          ? 'border-amber-300 bg-amber-50/60 shadow-sm'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div
        className={`flex-none w-36 px-3 py-2 flex flex-col justify-center border-r ${
          highlight ? 'border-amber-200' : 'border-gray-100'
        }`}
      >
        <p className={`text-[11px] font-bold uppercase tracking-wider ${highlight ? 'text-amber-700' : 'text-gray-500'}`}>
          {label}
        </p>
        <p className={`text-xs ${highlight ? 'text-amber-900' : 'text-gray-500'}`}>
          {rangeLabel(weekStart)}
        </p>
      </div>
      <div className="flex-1 grid grid-cols-7">
        {days.map((d, i) => {
          const isWeekend = i >= 5
          return (
            <div
              key={i}
              className={`px-2 py-2 border-r last:border-r-0 ${
                highlight ? 'border-amber-100' : 'border-gray-100'
              } ${isWeekend ? 'bg-gray-50/60' : ''}`}
            >
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${
                highlight ? 'text-amber-700' : 'text-gray-400'
              }`}>
                {DAY_LABELS[i]}
              </p>
              <p className={`text-sm font-semibold ${highlight ? 'text-gray-900' : 'text-gray-600'}`}>
                {d.getDate()}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Employee card ───────────────────────────────────────────────────────────
function EmployeeCard({ employee }: { employee: EmployeeProfile }) {
  const name = employee.name || 'Unnamed'
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || '?'
  return (
    <div
      className="w-[130px] h-[60px] flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-amber-300 cursor-grab select-none flex-shrink-0 transition"
      title={name}
    >
      <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
        {employee.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={employee.photo_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] font-bold text-gray-500">{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{name}</p>
        {employee.role && (
          <p className="text-[10px] text-gray-400 truncate leading-tight">{employee.role}</p>
        )}
      </div>
    </div>
  )
}
