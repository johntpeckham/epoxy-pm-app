'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchCommandCenterData,
  initialsFromName,
  timeAgo,
  type CommandCenterData,
} from '@/components/admin/commandCenterData'

// Color tokens (kept in one place for consistency across the dashboard)
const C = {
  bg: '#1a1a18',
  card: '#222220',
  inner: '#1a1a18',
  border: '#2e2e2c',
  text: '#f0f0ec',
  text2: '#d4d4d0',
  text3: '#6e6e6a',
  text4: '#4a4a48',
  teal: '#5DCAA5',
  green: '#1D9E75',
  gold: '#9e6a1d',
  red: '#8a4040',
}

function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CommandCenterClient() {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [now, setNow] = useState<Date>(() => new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const mountedRef = useRef(true)

  // Initial + polling fetch
  const load = useCallback(async () => {
    try {
      const d = await fetchCommandCenterData()
      if (mountedRef.current) {
        setData(d)
        setNow(new Date())
      }
    } catch (err) {
      console.error('[CommandCenter] fetch failed:', err)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const interval = setInterval(() => {
      void load()
    }, 30_000)
    const tick = setInterval(() => setNow(new Date()), 1_000)
    return () => {
      mountedRef.current = false
      clearInterval(interval)
      clearInterval(tick)
    }
  }, [load])

  // Fullscreen handling
  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // Derived metrics
  const metrics = useMemo(() => {
    if (!data) {
      return {
        calls: 0,
        callsConnected: 0,
        emails: 0,
        appointments: 0,
        proposalsSentToday: 0,
        reports: 0,
        tasksPercent: 0,
      }
    }
    const calls = data.callLogsToday.filter((c) => c.outcome !== 'email_sent' && c.outcome !== 'text_sent')
    const callsConnected = calls.filter((c) => c.outcome === 'connected').length
    const emails = data.callLogsToday.filter((c) => c.outcome === 'email_sent').length

    const todayStr = new Date().toISOString().slice(0, 10)
    const proposalsSentToday = data.proposalsRecent.filter((e) => {
      const sent = (e.status || '').toLowerCase() === 'sent'
      return sent && (e.created_at || '').slice(0, 10) === todayStr
    }).length

    // Task completion % = (completed for today) / (tasks assigned to any active user for today)
    const dow = new Date().getDay()
    const todayDate = todayStr
    const relevantTasks = data.assignedTasksForToday.filter((t) => {
      if (!t.is_active) return false
      if (t.task_type === 'daily') return true
      if (t.task_type === 'weekly') return t.day_of_week === dow
      if (t.task_type === 'one_time') return t.specific_date === todayDate
      return false
    })
    const totalAssignments = relevantTasks.length
    const completedAssignments = data.taskCompletionsToday.filter((c) => c.is_completed).length
    const tasksPercent = totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0

    return {
      calls: calls.length,
      callsConnected,
      emails,
      appointments: data.appointmentsToday.length,
      proposalsSentToday,
      reports: data.reportsToday.length,
      tasksPercent,
    }
  }, [data])

  return (
    <div
      style={{ background: C.bg, color: C.text, minHeight: '100vh' }}
      className="w-full px-6 py-5 font-sans"
    >
      <TopBar
        now={now}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        loadedAt={data?.loadedAt}
      />

      <MetricsRow metrics={metrics} />

      <div
        className="grid gap-3 mt-4"
        style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr' }}
      >
        <SalesmanActivityColumn data={data} />
        <ActiveJobsColumn data={data} />
        <FieldEstimatingColumn data={data} />
        <LiveActivityColumn data={data} />
      </div>

      <DailyPlaybookRow data={data} />
    </div>
  )
}

/* ─────────────────────── Section header ─────────────────────── */

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div
        style={{
          color: C.teal,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        {title}
      </div>
      {typeof count === 'number' && (
        <div style={{ color: C.text4, fontSize: 11 }}>{count}</div>
      )}
    </div>
  )
}

/* ─────────────────────── Salesman activity column ─────────────────────── */

function SalesmanActivityColumn({ data }: { data: CommandCenterData | null }) {
  const rows = useMemo(() => {
    if (!data) return []
    const salesmen = data.profiles.filter((p) => p.role === 'salesman' || p.role === 'admin')
    const loadedAt = new Date(data.loadedAt).getTime()

    return salesmen
      .map((p) => {
        const myCalls = data.callLogsToday.filter((c) => c.created_by === p.id)
        const connected = myCalls.filter((c) => c.outcome === 'connected').length
        const vm = myCalls.filter((c) => c.outcome === 'voicemail').length
        const emails = myCalls.filter((c) => c.outcome === 'email_sent').length
        const callsOnly = myCalls.filter((c) => c.outcome !== 'email_sent' && c.outcome !== 'text_sent').length
        const last = myCalls[0] || null

        let status: 'active' | 'dialer' | 'idle' = 'idle'
        if (last) {
          const diffMin = (loadedAt - new Date(last.call_date).getTime()) / 60000
          if (diffMin < 10) status = 'dialer'
          else if (diffMin < 60) status = 'active'
        }

        return {
          id: p.id,
          name: p.display_name || 'Unnamed',
          status,
          calls: callsOnly,
          connected,
          vm,
          emails,
          last,
        }
      })
      .sort((a, b) => {
        const rank = (s: string) => (s === 'dialer' ? 0 : s === 'active' ? 1 : 2)
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
        return b.calls - a.calls
      })
  }, [data])

  return (
    <div>
      <SectionHeader title="Salesman activity" count={rows.length} />
      <div className="space-y-2">
        {rows.length === 0 && (
          <div style={{ color: C.text4, fontSize: 12 }}>No salesman activity yet.</div>
        )}
        {rows.map((r) => {
          const isIdle = r.status === 'idle'
          const accent =
            r.status === 'dialer' ? C.teal : r.status === 'active' ? C.green : C.border
          const statusLabel =
            r.status === 'dialer' ? 'Dialer' : r.status === 'active' ? 'Active' : 'Idle'

          return (
            <div
              key={r.id}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${accent}`,
                borderRadius: 10,
                padding: '10px 12px',
                opacity: isIdle ? 0.4 : 1,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 9999,
                      background: C.inner,
                      border: `1px solid ${C.border}`,
                      color: C.text2,
                      fontSize: 10,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {initialsFromName(r.name)}
                  </div>
                  <div
                    style={{ color: C.text, fontSize: 13, fontWeight: 500 }}
                    className="truncate"
                  >
                    {r.name}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!isIdle ? (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 9999,
                        background: accent,
                        boxShadow: `0 0 6px 1px ${accent}66`,
                        display: 'inline-block',
                      }}
                    />
                  ) : null}
                  <span
                    style={{
                      color: isIdle ? C.red : accent,
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div
                className="grid mt-2"
                style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}
              >
                <Stat label="Calls" value={r.calls} />
                <Stat label="Conn" value={r.connected} />
                <Stat label="VM" value={r.vm} />
                <Stat label="Email" value={r.emails} />
              </div>

              {r.last && (
                <div
                  className="mt-2 truncate"
                  style={{ color: C.text3, fontSize: 11 }}
                  title={r.last.company_name ?? ''}
                >
                  Last: {r.last.outcome.replace(/_/g, ' ')}
                  {r.last.company_name ? ` · ${r.last.company_name}` : ''} ·{' '}
                  {timeAgo(r.last.call_date)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: C.inner,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '4px 6px',
        textAlign: 'center',
      }}
    >
      <div style={{ color: C.text, fontSize: 13, fontWeight: 500 }}>{value}</div>
      <div style={{ color: C.text4, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  )
}

/* ─────── Placeholders for following sections (filled next) ─────── */

function ActiveJobsColumn({ data }: { data: CommandCenterData | null }) {
  const jobs = useMemo(() => {
    if (!data) return []
    const activeProjects = data.projects.filter((p) => p.status === 'Active')
    const byProject = new Map<string, typeof data.checklistItems>()
    for (const item of data.checklistItems) {
      const arr = byProject.get(item.project_id)
      if (arr) arr.push(item)
      else byProject.set(item.project_id, [item])
    }
    return activeProjects.map((p) => {
      const items = byProject.get(p.id) ?? []
      const project = items.filter((i) => i.group_name === 'Project Checklist')
      const closeout = items.filter((i) => i.group_name === 'Closeout Checklist')
      const other = items.filter(
        (i) => i.group_name !== 'Project Checklist' && i.group_name !== 'Closeout Checklist'
      )
      return {
        project: p,
        items,
        projectCount: {
          done: project.filter((i) => i.is_complete).length,
          total: project.length,
        },
        closeoutCount: {
          done: closeout.filter((i) => i.is_complete).length,
          total: closeout.length,
        },
        other,
      }
    })
  }, [data])

  return (
    <div>
      <SectionHeader title="Active jobs" count={jobs.length} />
      {jobs.length === 0 ? (
        <div style={{ color: C.text4, fontSize: 12 }}>No active jobs.</div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          {jobs.map((j) => (
            <JobCard key={j.project.id} job={j} />
          ))}
        </div>
      )}
    </div>
  )
}

function JobCard({
  job,
}: {
  job: {
    project: { id: string; name: string; client_name: string | null; estimate_number: string | null; status: string }
    items: { id: string; name: string; is_complete: boolean; group_name: string | null }[]
    projectCount: { done: number; total: number }
    closeoutCount: { done: number; total: number }
  }
}) {
  const p = job.project

  // Order: Project checklist first, then others, then Closeout last
  const orderedItems = useMemo(() => {
    const rank = (g: string | null) => {
      if (g === 'Project Checklist') return 0
      if (g === 'Closeout Checklist') return 2
      return 1
    }
    return [...job.items].sort((a, b) => rank(a.group_name) - rank(b.group_name))
  }, [job.items])

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {p.estimate_number && (
              <span style={{ color: C.text3, fontSize: 10 }}>#{p.estimate_number}</span>
            )}
            <span
              style={{ color: C.text, fontSize: 13, fontWeight: 500 }}
              className="truncate"
            >
              {p.name}
            </span>
          </div>
          {p.client_name && (
            <div style={{ color: C.text4, fontSize: 10 }} className="truncate mt-0.5">
              {p.client_name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 9999,
              background: C.green,
              boxShadow: `0 0 6px 1px ${C.green}66`,
              display: 'inline-block',
            }}
          />
          <span style={{ color: C.green, fontSize: 10, fontWeight: 500 }}>Active</span>
        </div>
      </div>

      {orderedItems.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {orderedItems.slice(0, 18).map((item) => {
            const isCloseout = item.group_name === 'Closeout Checklist'
            const accent = isCloseout ? C.teal : C.green
            return (
              <span
                key={item.id}
                title={item.name}
                style={{
                  background: C.inner,
                  border: `1px solid ${item.is_complete ? accent : C.border}`,
                  color: item.is_complete ? C.text2 : C.text4,
                  fontSize: 9,
                  padding: '2px 6px',
                  borderRadius: 4,
                  maxWidth: 110,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.4,
                }}
              >
                {item.name}
              </span>
            )
          })}
          {orderedItems.length > 18 && (
            <span style={{ color: C.text4, fontSize: 9, padding: '2px 4px' }}>
              +{orderedItems.length - 18}
            </span>
          )}
        </div>
      )}

      <div style={{ color: C.text3, fontSize: 10 }}>
        Project: {job.projectCount.done}/{job.projectCount.total} · Closeout:{' '}
        {job.closeoutCount.done}/{job.closeoutCount.total}
      </div>
    </div>
  )
}

function FieldEstimatingColumn({ data }: { data: CommandCenterData | null }) {
  const fieldItems = useMemo(() => {
    if (!data) return [] as { id: string; project: string; author: string; time: string }[]
    return data.reportsToday.slice(0, 8).map((r) => ({
      id: r.id,
      project: r.project_name || 'Unknown project',
      author: r.author_name || 'Unknown',
      time: r.created_at,
    }))
  }, [data])

  const proposalItems = useMemo(() => {
    if (!data) return [] as {
      id: string
      title: string
      status: string
      sub: string
      time: string
    }[]
    const todayStr = new Date().toISOString().slice(0, 10)
    return data.proposalsRecent
      .filter((e) => {
        const s = (e.status || '').toLowerCase()
        if (s === 'draft') return true
        if (s === 'in_progress' || s === 'in progress') return true
        if (s === 'sent' && (e.created_at || '').slice(0, 10) === todayStr) return true
        return false
      })
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        title: e.project_name || `Proposal #${e.estimate_number ?? '—'}`,
        status: e.status || 'Draft',
        sub: e.salesperson || '',
        time: e.created_at,
      }))
  }, [data])

  return (
    <div>
      <SectionHeader title="Field + estimating" />

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '10px 12px',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            color: C.text3,
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 6,
          }}
        >
          Reports filed today
        </div>
        {fieldItems.length === 0 ? (
          <div style={{ color: C.text4, fontSize: 11 }}>No reports filed yet.</div>
        ) : (
          <div className="space-y-1.5">
            {fieldItems.map((f) => (
              <div
                key={f.id}
                style={{
                  background: C.inner,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: '6px 8px',
                }}
              >
                <div
                  style={{ color: C.text, fontSize: 11, fontWeight: 500 }}
                  className="truncate"
                >
                  {f.project}
                </div>
                <div
                  style={{ color: C.text3, fontSize: 10, marginTop: 1 }}
                  className="truncate"
                >
                  {f.author} · {timeAgo(f.time)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            color: C.text3,
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 6,
          }}
        >
          Estimating
        </div>
        {proposalItems.length === 0 ? (
          <div style={{ color: C.text4, fontSize: 11 }}>Nothing in progress.</div>
        ) : (
          <div className="space-y-1.5">
            {proposalItems.map((e) => {
              const s = e.status.toLowerCase()
              const color = s === 'sent' ? C.green : s === 'draft' ? C.text3 : C.gold
              return (
                <div
                  key={e.id}
                  style={{
                    background: C.inner,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      style={{ color: C.text, fontSize: 11, fontWeight: 500 }}
                      className="truncate"
                    >
                      {e.title}
                    </div>
                    <span
                      style={{
                        color,
                        fontSize: 9,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      {e.status}
                    </span>
                  </div>
                  {e.sub && (
                    <div style={{ color: C.text4, fontSize: 10, marginTop: 1 }} className="truncate">
                      {e.sub}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function LiveActivityColumn({ data }: { data: CommandCenterData | null }) {
  const entries = useMemo(() => {
    if (!data) return [] as { id: string; time: string; text: string; dot: 'green' | 'teal' }[]

    const out: { id: string; time: string; text: string; dot: 'green' | 'teal' }[] = []

    for (const c of data.callLogsToday) {
      if (c.outcome === 'connected') {
        out.push({
          id: `call-${c.id}`,
          time: c.call_date,
          dot: 'green',
          text: `${c.user_name || 'Someone'} connected with ${c.company_name || 'a contact'}`,
        })
      } else if (c.outcome === 'email_sent') {
        out.push({
          id: `call-${c.id}`,
          time: c.call_date,
          dot: 'teal',
          text: `${c.user_name || 'Someone'} emailed ${c.company_name || 'a contact'}`,
        })
      }
    }

    for (const a of data.appointmentsToday) {
      out.push({
        id: `appt-${a.id}`,
        time: a.created_at,
        dot: 'teal',
        text: `Appointment set with ${a.company_name || 'a contact'}${a.user_name ? ` by ${a.user_name}` : ''}`,
      })
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    for (const e of data.proposalsRecent) {
      if ((e.status || '').toLowerCase() === 'sent' && (e.created_at || '').slice(0, 10) === todayStr) {
        out.push({
          id: `est-${e.id}`,
          time: e.created_at,
          dot: 'teal',
          text: `Proposal sent — ${e.project_name || `#${e.estimate_number ?? ''}`}`,
        })
      }
    }

    for (const r of data.reportsToday) {
      out.push({
        id: `rpt-${r.id}`,
        time: r.created_at,
        dot: 'green',
        text: `${r.author_name || 'Someone'} filed a report on ${r.project_name || 'a job'}`,
      })
    }

    for (const comp of data.taskCompletionsToday) {
      if (!comp.is_completed || !comp.completed_at) continue
      const user = data.profiles.find((p) => p.id === comp.user_id)
      const task = data.assignedTasksForToday.find((t) => t.id === comp.task_id)
      out.push({
        id: `task-${comp.task_id}-${comp.user_id}`,
        time: comp.completed_at,
        dot: 'green',
        text: `${user?.display_name || 'Someone'} completed ${task?.title ?? 'a work item'}`,
      })
    }

    out.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    return out.slice(0, 15)
  }, [data])

  return (
    <div>
      <SectionHeader title="Live activity" />
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '10px 12px',
        }}
      >
        {entries.length === 0 ? (
          <div style={{ color: C.text4, fontSize: 11 }}>No activity yet.</div>
        ) : (
          <div
            style={{
              position: 'relative',
              paddingLeft: 14,
              borderLeft: `1px solid ${C.border}`,
            }}
            className="space-y-2"
          >
            {entries.map((e) => {
              const color = e.dot === 'green' ? C.green : C.teal
              return (
                <div key={e.id} style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: -19,
                      top: 4,
                      width: 8,
                      height: 8,
                      borderRadius: 9999,
                      background: color,
                      boxShadow: `0 0 6px 1px ${color}66`,
                      display: 'inline-block',
                    }}
                  />
                  <div style={{ color: C.text4, fontSize: 10 }}>{timeAgo(e.time)}</div>
                  <div style={{ color: C.text2, fontSize: 11, lineHeight: 1.35 }}>
                    {e.text}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function DailyPlaybookRow({ data }: { data: CommandCenterData | null }) {
  const rows = useMemo(() => {
    if (!data) return [] as {
      id: string
      name: string
      done: number
      total: number
      percent: number
    }[]

    const dow = new Date().getDay()
    const todayDate = new Date().toISOString().slice(0, 10)

    // Build tasks per user relevant for today
    const tasksByUser = new Map<string, string[]>()
    for (const t of data.assignedTasksForToday) {
      if (!t.is_active) continue
      const applies =
        t.task_type === 'daily' ||
        (t.task_type === 'weekly' && t.day_of_week === dow) ||
        (t.task_type === 'one_time' && t.specific_date === todayDate)
      if (!applies) continue
      const arr = tasksByUser.get(t.assigned_to)
      if (arr) arr.push(t.id)
      else tasksByUser.set(t.assigned_to, [t.id])
    }

    const completionKey = (taskId: string, userId: string) => `${taskId}__${userId}`
    const completedSet = new Set<string>()
    for (const c of data.taskCompletionsToday) {
      if (c.is_completed) completedSet.add(completionKey(c.task_id, c.user_id))
    }

    const out: { id: string; name: string; done: number; total: number; percent: number }[] = []
    for (const [userId, taskIds] of tasksByUser.entries()) {
      const profile = data.profiles.find((p) => p.id === userId)
      const total = taskIds.length
      const done = taskIds.filter((tid) => completedSet.has(completionKey(tid, userId))).length
      const percent = total > 0 ? Math.round((done / total) * 100) : 0
      out.push({
        id: userId,
        name: profile?.display_name || 'Unnamed',
        done,
        total,
        percent,
      })
    }

    return out.sort((a, b) => b.percent - a.percent)
  }, [data])

  return (
    <div className="mt-4">
      <SectionHeader title="Daily playbook" count={rows.length} />
      {rows.length === 0 ? (
        <div style={{ color: C.text4, fontSize: 12 }}>No playbook work items assigned today.</div>
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
        >
          {rows.map((r) => {
            const isDone = r.total > 0 && r.done === r.total
            const isPartial = r.done > 0 && !isDone
            const barColor = isDone ? C.green : isPartial ? C.gold : C.border
            const faded = r.done === 0

            return (
              <div
                key={r.id}
                style={{
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  opacity: faded ? 0.55 : 1,
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 9999,
                      background: C.inner,
                      border: `1px solid ${C.border}`,
                      color: C.text2,
                      fontSize: 10,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {initialsFromName(r.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      style={{ color: C.text, fontSize: 12, fontWeight: 500 }}
                      className="truncate"
                    >
                      {r.name}
                    </div>
                    <div style={{ color: C.text3, fontSize: 10 }}>
                      {r.done}/{r.total} · {r.percent}%
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    height: 5,
                    borderRadius: 4,
                    background: C.inner,
                    border: `1px solid ${C.border}`,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${r.percent}%`,
                      height: '100%',
                      background: barColor,
                      boxShadow: isDone ? `0 0 6px 1px ${C.green}66` : 'none',
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── Top bar ─────────────────────── */

function TopBar({
  now,
  isFullscreen,
  onToggleFullscreen,
  loadedAt,
}: {
  now: Date
  isFullscreen: boolean
  onToggleFullscreen: () => void
  loadedAt: string | undefined
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <div style={{ color: C.text, fontSize: 20, fontWeight: 500, letterSpacing: 0.2 }}>
          Command center
        </div>
        <div style={{ color: C.text3, fontSize: 12, marginTop: 2 }}>
          Peckham Coatings · Live · {formatDateTime(now)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 px-2.5 py-1 rounded-md"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: C.green,
              boxShadow: `0 0 8px 1px ${C.green}66`,
              display: 'inline-block',
            }}
          />
          <span style={{ color: C.text2, fontSize: 12 }}>Live</span>
          {loadedAt && (
            <span style={{ color: C.text4, fontSize: 11 }}>· {timeAgo(loadedAt)}</span>
          )}
        </div>

        <button
          onClick={onToggleFullscreen}
          className="px-3 py-1 rounded-md text-xs font-medium transition"
          style={{
            border: `1px solid ${C.teal}`,
            color: C.teal,
            background: 'transparent',
          }}
        >
          {isFullscreen ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────── Metrics row ─────────────────────── */

interface MetricsRowProps {
  metrics: {
    calls: number
    callsConnected: number
    emails: number
    appointments: number
    proposalsSentToday: number
    reports: number
    tasksPercent: number
  }
}

function MetricsRow({ metrics }: MetricsRowProps) {
  const cards: Array<{ label: string; value: string; sub?: string }> = [
    { label: 'Calls today', value: String(metrics.calls), sub: `${metrics.callsConnected} connected` },
    { label: 'Emails today', value: String(metrics.emails) },
    { label: 'Appointments set', value: String(metrics.appointments) },
    { label: 'Proposals sent', value: String(metrics.proposalsSentToday) },
    { label: 'Reports filed', value: String(metrics.reports) },
    { label: 'Work done', value: `${metrics.tasksPercent}%`, sub: 'Team average' },
  ]

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{ color: C.text, fontSize: 24, fontWeight: 500, lineHeight: 1.1 }}>
            {c.value}
          </div>
          <div style={{ color: C.text3, fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {c.label}
          </div>
          {c.sub && (
            <div style={{ color: C.text4, fontSize: 11, marginTop: 2 }}>{c.sub}</div>
          )}
        </div>
      ))}
    </div>
  )
}
