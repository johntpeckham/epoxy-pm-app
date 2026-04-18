'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import type {
  AssignedTask,
  AssignedTaskCompletion,
  Profile,
} from '@/types'

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function tasksForUserOnDate(
  tasks: AssignedTask[],
  userId: string,
  date: Date
): AssignedTask[] {
  const dayOfWeek = date.getDay()
  const dateKey = toDateKey(date)
  const dayOfMonth = date.getDate()
  return tasks
    .filter((t) => t.is_active && t.assigned_to === userId)
    .filter((t) => {
      if (t.task_type === 'daily') return true
      if (t.task_type === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5
      if (t.task_type === 'weekly') return t.day_of_week === dayOfWeek
      if (t.task_type === 'monthly') return t.day_of_month === dayOfMonth
      if (t.task_type === 'one_time') return t.specific_date === dateKey
      return false
    })
}

interface Props {
  currentUserId: string
}

export default function TeamTasksSection({ currentUserId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toDateKey(new Date())
  )
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [tasks, setTasks] = useState<AssignedTask[]>([])
  const [completions, setCompletions] = useState<AssignedTaskCompletion[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [profilesRes, tasksRes, completionsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role, updated_at'),
      supabase.from('assigned_tasks').select('*').eq('is_active', true),
      supabase
        .from('assigned_task_completions')
        .select('*')
        .eq('completion_date', selectedDate),
    ])
    if (profilesRes.data) setProfiles(profilesRes.data as Profile[])
    if (tasksRes.data) setTasks(tasksRes.data as AssignedTask[])
    if (completionsRes.data)
      setCompletions(completionsRes.data as AssignedTaskCompletion[])
    setLoading(false)
  }, [supabase, selectedDate])

  useEffect(() => {
    load()
  }, [load])

  const completionByUserTask = useMemo(() => {
    const m = new Map<string, AssignedTaskCompletion>()
    completions.forEach((c) => m.set(`${c.user_id}-${c.task_id}`, c))
    return m
  }, [completions])

  const dateObj = new Date(selectedDate + 'T00:00:00')

  // Only include users who have at least one task on that date
  const usersWithTasks = useMemo(() => {
    return profiles
      .map((p) => {
        const userTasks = tasksForUserOnDate(tasks, p.id, dateObj)
        return { profile: p, tasks: userTasks }
      })
      .filter((x) => x.tasks.length > 0)
      .sort((a, b) =>
        (a.profile.display_name ?? '').localeCompare(b.profile.display_name ?? '')
      )
  }, [profiles, tasks, dateObj])

  function toggleExpand(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-amber-500"
        />
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-3 text-center">Loading…</p>
      ) : usersWithTasks.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center">
          No team playbook work items for this date
        </p>
      ) : (
        <div className="space-y-1">
          {usersWithTasks.map(({ profile, tasks: userTasks }) => {
            const completed = userTasks.filter(
              (t) => completionByUserTask.get(`${profile.id}-${t.id}`)?.is_completed
            ).length
            const total = userTasks.length
            const isExpanded = expanded.has(profile.id)
            const isYou = profile.id === currentUserId
            return (
              <div
                key={profile.id}
                className="border border-gray-100 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(profile.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-xs font-medium text-gray-900 flex-1 text-left">
                    {profile.display_name ?? 'Unknown'}
                    {isYou && (
                      <span className="ml-1.5 text-[10px] text-gray-400">(you)</span>
                    )}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${
                      completed === total
                        ? 'text-green-600'
                        : completed === 0
                          ? 'text-gray-400'
                          : 'text-amber-600'
                    }`}
                  >
                    {completed} of {total} completed
                  </span>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-gray-50 border-t border-gray-100 bg-gray-50/50">
                    {userTasks.map((t) => {
                      const c = completionByUserTask.get(`${profile.id}-${t.id}`)
                      const isDone = !!c?.is_completed
                      return (
                        <div
                          key={t.id}
                          className={`px-3 py-2 flex items-start gap-2 ${
                            !isDone ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <span
                            className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                              isDone ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-xs ${
                                isDone
                                  ? 'text-gray-500 line-through'
                                  : 'text-gray-900 font-medium'
                              }`}
                            >
                              {t.title}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {t.task_type === 'one_time' ? 'One-time' : t.task_type === 'weekdays' ? 'Weekdays' : t.task_type.charAt(0).toUpperCase() + t.task_type.slice(1)}
                            </p>
                            {c?.note && (
                              <p className="text-[11px] text-gray-500 italic mt-0.5">
                                {isDone ? 'Note' : 'Not completed'}: {c.note}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
