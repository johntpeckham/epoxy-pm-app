'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react'
import type {
  AssignedTask,
  AssignedTaskCompletion,
  Profile,
} from '@/types'

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  const next = new Date(d)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

type QuickRange =
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_30'
  | 'last_90'
  | 'custom'

function rangeForQuick(q: QuickRange): { start: Date; end: Date } {
  const today = startOfDay(new Date())
  if (q === 'last_30') return { start: addDays(today, -29), end: today }
  if (q === 'last_90') return { start: addDays(today, -89), end: today }
  if (q === 'this_week') {
    // Monday-start week
    const day = today.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const start = addDays(today, diff)
    return { start, end: today }
  }
  if (q === 'last_week') {
    const day = today.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const thisMonday = addDays(today, diff)
    const start = addDays(thisMonday, -7)
    const end = addDays(thisMonday, -1)
    return { start, end }
  }
  if (q === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start, end: today }
  }
  if (q === 'last_month') {
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastMonthEnd = addDays(thisMonthStart, -1)
    const start = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)
    return { start, end: lastMonthEnd }
  }
  return { start: addDays(today, -29), end: today }
}

/* Build an array of Date objects from start..end inclusive */
function daysInRange(start: Date, end: Date): Date[] {
  const out: Date[] = []
  let cur = startOfDay(start)
  const last = startOfDay(end)
  while (cur.getTime() <= last.getTime()) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

function isTaskApplicableOnDate(t: AssignedTask, date: Date): boolean {
  if (!t.is_active) return false
  if (t.task_type === 'daily') return true
  if (t.task_type === 'weekly') return t.day_of_week === date.getDay()
  if (t.task_type === 'one_time')
    return t.specific_date === toDateKey(date)
  return false
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type SortMode = 'rate_desc' | 'name'

interface EmployeeRow {
  profile: Profile
  assigned: number
  completed: number
  missed: number
  rate: number
  streak: number
  taskIds: string[]
}

export default function EmployeeSummaryClient() {
  const supabase = useMemo(() => createClient(), [])
  const [quick, setQuick] = useState<QuickRange>('last_30')
  const initialRange = rangeForQuick('last_30')
  const [customStart, setCustomStart] = useState<string>(
    toDateKey(initialRange.start)
  )
  const [customEnd, setCustomEnd] = useState<string>(
    toDateKey(initialRange.end)
  )
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [tasks, setTasks] = useState<AssignedTask[]>([])
  const [completions, setCompletions] = useState<AssignedTaskCompletion[]>([])
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('rate_desc')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const range = useMemo(() => {
    if (quick === 'custom') {
      return {
        start: startOfDay(new Date(customStart + 'T00:00:00')),
        end: startOfDay(new Date(customEnd + 'T00:00:00')),
      }
    }
    return rangeForQuick(quick)
  }, [quick, customStart, customEnd])

  useEffect(() => {
    if (quick !== 'custom') {
      const r = rangeForQuick(quick)
      setCustomStart(toDateKey(r.start))
      setCustomEnd(toDateKey(r.end))
    }
  }, [quick])

  const load = useCallback(async () => {
    setLoading(true)
    const startKey = toDateKey(range.start)
    const endKey = toDateKey(range.end)
    const [profilesRes, tasksRes, completionsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role, updated_at'),
      supabase.from('assigned_tasks').select('*'),
      supabase
        .from('assigned_task_completions')
        .select('*')
        .gte('completion_date', startKey)
        .lte('completion_date', endKey),
    ])
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])
    if (tasksRes.data) setTasks(tasksRes.data as AssignedTask[])
    if (completionsRes.data)
      setCompletions(completionsRes.data as AssignedTaskCompletion[])
    setLoading(false)
  }, [supabase, range.start, range.end])

  useEffect(() => {
    load()
  }, [load])

  /* Compute per-employee stats */
  const rows: EmployeeRow[] = useMemo(() => {
    const days = daysInRange(range.start, range.end)
    // Map completions by user-task-date
    const compMap = new Map<string, AssignedTaskCompletion>()
    completions.forEach((c) =>
      compMap.set(`${c.user_id}-${c.task_id}-${c.completion_date}`, c)
    )

    return profiles.map((p) => {
      const userTasks = tasks.filter((t) => t.assigned_to === p.id)
      let assigned = 0
      let completed = 0
      let missed = 0 // has a did-not-complete note (is_completed=false & note)
      const taskIds = new Set<string>()

      days.forEach((date) => {
        userTasks.forEach((t) => {
          if (!isTaskApplicableOnDate(t, date)) return
          assigned++
          taskIds.add(t.id)
          const c = compMap.get(`${p.id}-${t.id}-${toDateKey(date)}`)
          if (c?.is_completed) completed++
          else if (c && !c.is_completed && c.note) missed++
        })
      })

      // Streak: longest trailing run (ending on end date) of consecutive days
      // where every applicable task was completed
      let streak = 0
      for (let i = days.length - 1; i >= 0; i--) {
        const date = days[i]
        const applicable = userTasks.filter((t) =>
          isTaskApplicableOnDate(t, date)
        )
        if (applicable.length === 0) {
          // A day with no applicable tasks doesn't break the streak
          continue
        }
        const allDone = applicable.every(
          (t) => compMap.get(`${p.id}-${t.id}-${toDateKey(date)}`)?.is_completed
        )
        if (allDone) streak++
        else break
      }

      const rate = assigned === 0 ? 0 : Math.round((completed / assigned) * 100)
      return {
        profile: p,
        assigned,
        completed,
        missed,
        rate,
        streak,
        taskIds: Array.from(taskIds),
      }
    })
  }, [profiles, tasks, completions, range.start, range.end])

  const rowsWithTasks = rows.filter((r) => r.assigned > 0)

  const sortedRows = useMemo(() => {
    const copy = [...rowsWithTasks]
    if (sortMode === 'name') {
      copy.sort((a, b) =>
        (a.profile.display_name ?? '').localeCompare(
          b.profile.display_name ?? ''
        )
      )
    } else {
      copy.sort((a, b) => b.rate - a.rate)
    }
    return copy
  }, [rowsWithTasks, sortMode])

  const totalAssigned = rowsWithTasks.reduce((s, r) => s + r.assigned, 0)
  const totalCompleted = rowsWithTasks.reduce((s, r) => s + r.completed, 0)
  const totalMissed = rowsWithTasks.reduce((s, r) => s + r.missed, 0)
  const teamRate =
    totalAssigned === 0
      ? 0
      : Math.round((totalCompleted / totalAssigned) * 100)

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <Link
          href="/my-work"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          My Work
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Employee Summary</h1>
      </div>

      {/* Range selector */}
      <div className="px-6 py-4 flex flex-wrap items-center gap-2">
        {(
          [
            ['this_week', 'This week'],
            ['last_week', 'Last week'],
            ['this_month', 'This month'],
            ['last_month', 'Last month'],
            ['last_30', 'Last 30 days'],
            ['last_90', 'Last 90 days'],
            ['custom', 'Custom'],
          ] as [QuickRange, string][]
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setQuick(val)}
            className={`px-3 py-1.5 text-xs rounded-full border transition ${
              quick === val
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-amber-400'
            }`}
          >
            {label}
          </button>
        ))}
        {quick === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-amber-500"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-amber-500"
            />
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="px-6 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Team completion rate" value={`${teamRate}%`} />
        <SummaryCard label="Tasks assigned" value={String(totalAssigned)} />
        <SummaryCard label="Completed" value={String(totalCompleted)} />
        <SummaryCard label="Not completed" value={String(totalMissed)} />
      </div>

      {/* Employee table */}
      <div className="px-6 pb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Employees
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Sort</label>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="text-xs px-2 py-1 border border-gray-200 rounded bg-white focus:outline-none focus:border-amber-500"
            >
              <option value="rate_desc">Completion rate (high → low)</option>
              <option value="name">Name (A → Z)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">Loading…</p>
        ) : sortedRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center bg-white rounded-xl border border-gray-100">
            No assigned tasks for anyone in this period.
          </p>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[2fr_repeat(5,1fr)] gap-4 px-5 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
              <div>Employee</div>
              <div className="text-right">Assigned</div>
              <div className="text-right">Completed</div>
              <div className="text-right">Missed</div>
              <div className="text-right">Rate</div>
              <div className="text-right">Streak</div>
            </div>
            <div className="divide-y divide-gray-50">
              {sortedRows.map((row) => (
                <EmployeeRowView
                  key={row.profile.id}
                  row={row}
                  allTasks={tasks}
                  completions={completions}
                  range={range}
                  expanded={expanded.has(row.profile.id)}
                  onToggle={() => toggleExpand(row.profile.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
    </div>
  )
}

function rateColor(rate: number): string {
  if (rate >= 90) return 'text-green-600'
  if (rate >= 70) return 'text-amber-600'
  return 'text-red-600'
}

function EmployeeRowView({
  row,
  allTasks,
  completions,
  range,
  expanded,
  onToggle,
}: {
  row: EmployeeRow
  allTasks: AssignedTask[]
  completions: AssignedTaskCompletion[]
  range: { start: Date; end: Date }
  expanded: boolean
  onToggle: () => void
}) {
  // Per-task breakdown for the expansion
  const userTasks = allTasks.filter((t) => t.assigned_to === row.profile.id)
  const days = daysInRange(range.start, range.end)
  const compMap = new Map<string, AssignedTaskCompletion>()
  completions.forEach((c) =>
    compMap.set(`${c.user_id}-${c.task_id}-${c.completion_date}`, c)
  )

  const perTask = userTasks
    .map((t) => {
      let assigned = 0
      let completed = 0
      const notes: { date: string; note: string }[] = []
      days.forEach((d) => {
        if (!isTaskApplicableOnDate(t, d)) return
        assigned++
        const c = compMap.get(`${row.profile.id}-${t.id}-${toDateKey(d)}`)
        if (c?.is_completed) completed++
        if (c && !c.is_completed && c.note) {
          notes.push({ date: toDateKey(d), note: c.note })
        }
      })
      return { task: t, assigned, completed, notes }
    })
    .filter((x) => x.assigned > 0)
    .sort((a, b) => a.task.title.localeCompare(b.task.title))

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full md:grid md:grid-cols-[2fr_repeat(5,1fr)] md:gap-4 flex flex-wrap items-center gap-2 px-5 py-3 hover:bg-gray-50 transition text-left"
      >
        <div className="flex items-center gap-2 flex-1">
          {expanded ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-900">
            {row.profile.display_name ?? 'Unknown'}
          </span>
        </div>
        <div className="text-sm text-gray-600 md:text-right">
          <span className="md:hidden text-gray-400 mr-1">Assigned:</span>
          {row.assigned}
        </div>
        <div className="text-sm text-gray-600 md:text-right">
          <span className="md:hidden text-gray-400 mr-1">Done:</span>
          {row.completed}
        </div>
        <div className="text-sm text-gray-600 md:text-right">
          <span className="md:hidden text-gray-400 mr-1">Missed:</span>
          {row.missed}
        </div>
        <div
          className={`text-sm font-semibold md:text-right ${rateColor(row.rate)}`}
        >
          <span className="md:hidden text-gray-400 mr-1 font-normal">
            Rate:
          </span>
          {row.rate}%
        </div>
        <div className="text-sm text-gray-600 md:text-right">
          <span className="md:hidden text-gray-400 mr-1">Streak:</span>
          {row.streak}d
        </div>
      </button>
      {expanded && (
        <div className="px-6 pb-4 bg-gray-50/50 border-t border-gray-100">
          {perTask.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">No applicable tasks.</p>
          ) : (
            <div className="space-y-2 pt-3">
              {perTask.map(({ task, assigned, completed, notes }) => {
                const r = assigned === 0 ? 0 : Math.round((completed / assigned) * 100)
                return (
                  <div
                    key={task.id}
                    className="bg-white border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {task.title}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {task.task_type === 'daily'
                            ? 'Daily'
                            : task.task_type === 'weekly'
                              ? 'Weekly'
                              : 'One-time'}{' '}
                          · {completed} of {assigned} completed
                        </p>
                      </div>
                      <span className={`text-xs font-semibold ${rateColor(r)}`}>
                        {r}%
                      </span>
                    </div>
                    {notes.length > 0 && (
                      <div className="mt-2 border-t border-gray-50 pt-2 space-y-1">
                        {notes.map((n, idx) => (
                          <p
                            key={idx}
                            className="text-[11px] text-gray-500 italic"
                          >
                            {n.date}: “{n.note}”
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
