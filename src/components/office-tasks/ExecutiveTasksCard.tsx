'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CalendarDaysIcon,
  PlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  MoreVerticalIcon,
} from 'lucide-react'

interface ExecTask {
  id: string
  company_id: string | null
  title: string
  description: string | null
  category: string
  due_date: string
  recurrence: string | null
  end_date: string | null
  status: string
  completed_at: string | null
  completed_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface RowItem {
  key: string
  task: ExecTask
  isProjected: boolean
  effectiveDate: string
}

const DEFAULT_CATEGORIES = ['Filing', 'Tax', 'Insurance', 'License', 'Other']
const RECURRENCE_OPTIONS = [
  { value: 'one_time', label: 'One-time' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'every_2_years', label: 'Every 2 years' },
  { value: 'every_4_years', label: 'Every 4 years' },
] as const

function daysDiff(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

function recurrenceLabel(r: string | null): string {
  if (!r) return ''
  return RECURRENCE_OPTIONS.find(x => x.value === r)?.label ?? r
}

function relativeTime(dateStr: string): { text: string; cls: string } {
  const d = daysDiff(dateStr)
  if (d < 0) return { text: `${-d}d overdue`, cls: 'text-red-600 font-medium' }
  if (d === 0) return { text: 'Due today', cls: 'text-amber-600 font-medium' }
  if (d <= 30) return { text: `${d}d left`, cls: 'text-amber-600 font-medium' }
  if (d <= 365) return { text: `${Math.round(d / 30)}mo`, cls: 'text-gray-500' }
  const yr = Math.floor(d / 365)
  const mo = Math.round((d % 365) / 30)
  return { text: mo > 0 ? `${yr}yr ${mo}mo` : `${yr}yr`, cls: 'text-gray-400' }
}

function calcNextDue(current: string, recurrence: string): string {
  const d = new Date(current + 'T00:00:00')
  switch (recurrence) {
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    case 'every_2_years': d.setFullYear(d.getFullYear() + 2); break
    case 'every_4_years': d.setFullYear(d.getFullYear() + 4); break
  }
  return d.toISOString().split('T')[0]
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtMonYear(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function calcOccurrences(startDate: string, recurrence: string, endDate: string | null, count: number): { date: string; isFinal: boolean }[] {
  const results: { date: string; isFinal: boolean }[] = []
  let current = startDate
  for (let i = 0; i < count; i++) {
    const next = calcNextDue(current, recurrence)
    if (endDate && next > endDate) break
    results.push({ date: next, isFinal: false })
    current = next
  }
  if (results.length > 0 && endDate) {
    const lastDate = results[results.length - 1].date
    const afterLast = calcNextDue(lastDate, recurrence)
    if (afterLast > endDate) {
      results[results.length - 1].isFinal = true
    }
  }
  return results
}

/* ================================================================== */

export default function ExecutiveTasksCard({ userId }: { userId: string }) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<ExecTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<ExecTask | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [longTermOpen, setLongTermOpen] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [occExpId, setOccExpId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const completingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)

  useEffect(() => {
    supabase
      .from('executive_tasks')
      .select('*')
      .order('due_date', { ascending: true })
      .then(({ data }) => {
        setTasks((data as ExecTask[]) ?? [])
        setLoading(false)
        if (data && data.length > 0) {
          const dbCats = [...new Set((data as ExecTask[]).map(t => t.category))]
          setCategories(prev => [...new Set([...prev, ...dbCats])])
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeTasks = useMemo(() => tasks.filter(t => t.status === 'active'), [tasks])

  const projectedRows = useMemo((): RowItem[] => {
    const rows: RowItem[] = []
    for (const task of activeTasks) {
      if (!task.recurrence || task.recurrence === 'one_time') continue
      const nextDate = calcNextDue(task.due_date, task.recurrence)
      if (task.end_date && nextDate > task.end_date) continue
      rows.push({ key: `${task.id}_proj`, task, isProjected: true, effectiveDate: nextDate })
    }
    return rows
  }, [activeTasks])

  const needsAttentionItems = useMemo((): RowItem[] => {
    const real: RowItem[] = activeTasks
      .filter(t => daysDiff(t.due_date) <= 30)
      .map(t => ({ key: t.id, task: t, isProjected: false, effectiveDate: t.due_date }))
    const proj = projectedRows.filter(r => daysDiff(r.effectiveDate) <= 30)
    return [...real, ...proj].sort((a, b) => daysDiff(a.effectiveDate) - daysDiff(b.effectiveDate))
  }, [activeTasks, projectedRows])

  const upcomingItems = useMemo((): RowItem[] => {
    const real: RowItem[] = activeTasks
      .filter(t => { const d = daysDiff(t.due_date); return d > 30 && d <= 365 })
      .map(t => ({ key: t.id, task: t, isProjected: false, effectiveDate: t.due_date }))
    const proj = projectedRows.filter(r => { const d = daysDiff(r.effectiveDate); return d > 30 && d <= 365 })
    return [...real, ...proj].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  }, [activeTasks, projectedRows])

  const longTermItems = useMemo((): RowItem[] => {
    const real: RowItem[] = activeTasks
      .filter(t => daysDiff(t.due_date) > 365)
      .map(t => ({ key: t.id, task: t, isProjected: false, effectiveDate: t.due_date }))
    const proj = projectedRows.filter(r => daysDiff(r.effectiveDate) > 365)
    return [...real, ...proj].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  }, [activeTasks, projectedRows])

  const completedTasks = useMemo(
    () => tasks.filter(t => t.status === 'completed')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
      .slice(0, 10),
    [tasks],
  )

  const overdueCount = needsAttentionItems.filter(r => !r.isProjected && daysDiff(r.effectiveDate) < 0).length
  const dueSoonCount = needsAttentionItems.filter(r => !r.isProjected && daysDiff(r.effectiveDate) >= 0).length

  /* ── CRUD ── */

  async function handleCreate(data: {
    title: string; description: string; category: string; due_date: string; recurrence: string; end_date: string | null
  }) {
    const optimistic: ExecTask = {
      id: crypto.randomUUID(),
      company_id: null,
      title: data.title,
      description: data.description || null,
      category: data.category,
      due_date: data.due_date,
      recurrence: data.recurrence,
      end_date: data.end_date,
      status: 'active',
      completed_at: null,
      completed_by: null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setTasks(prev => [...prev, optimistic])
    setShowModal(false)
    if (!categories.includes(data.category)) {
      setCategories(prev => [...prev, data.category])
    }
    const { data: inserted } = await supabase
      .from('executive_tasks')
      .insert({
        title: data.title,
        description: data.description || null,
        category: data.category,
        due_date: data.due_date,
        recurrence: data.recurrence,
        end_date: data.end_date,
        created_by: userId,
      })
      .select()
      .single()
    if (inserted) setTasks(prev => prev.map(t => t.id === optimistic.id ? inserted as ExecTask : t))
  }

  async function handleUpdate(id: string, data: {
    title: string; description: string; category: string; due_date: string; recurrence: string; end_date: string | null
  }) {
    setTasks(prev => prev.map(t => t.id === id ? {
      ...t, title: data.title, description: data.description || null,
      category: data.category, due_date: data.due_date,
      recurrence: data.recurrence, end_date: data.end_date, updated_at: new Date().toISOString(),
    } : t))
    setEditingTask(null)
    setShowModal(false)
    if (!categories.includes(data.category)) {
      setCategories(prev => [...prev, data.category])
    }
    await supabase
      .from('executive_tasks')
      .update({
        title: data.title, description: data.description || null,
        category: data.category, due_date: data.due_date,
        recurrence: data.recurrence, end_date: data.end_date, updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  }

  async function handleComplete(task: ExecTask) {
    const now = new Date().toISOString()
    setTasks(prev => prev.map(t => t.id === task.id ? {
      ...t, status: 'completed', completed_at: now, completed_by: userId, updated_at: now,
    } : t))
    setOccExpId(null)
    setMenuOpenId(null)
    await supabase
      .from('executive_tasks')
      .update({ status: 'completed', completed_at: now, completed_by: userId, updated_at: now })
      .eq('id', task.id)

    if (task.recurrence && task.recurrence !== 'one_time') {
      const nextDue = calcNextDue(task.due_date, task.recurrence)
      if (task.end_date && nextDue > task.end_date) return
      const next: ExecTask = {
        id: crypto.randomUUID(), company_id: task.company_id,
        title: task.title, description: task.description,
        category: task.category, due_date: nextDue,
        recurrence: task.recurrence, end_date: task.end_date,
        status: 'active',
        completed_at: null, completed_by: null,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setTasks(prev => [...prev, next])
      const { data: inserted } = await supabase
        .from('executive_tasks')
        .insert({
          title: task.title, description: task.description,
          category: task.category, due_date: nextDue,
          recurrence: task.recurrence, end_date: task.end_date,
          company_id: task.company_id,
          created_by: userId,
        })
        .select()
        .single()
      if (inserted) setTasks(prev => prev.map(t => t.id === next.id ? inserted as ExecTask : t))
    }
  }

  async function handleDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    setDeleteConfirmId(null)
    setMenuOpenId(null)
    await supabase.from('executive_tasks').delete().eq('id', id)
  }

  async function handleUncomplete(task: ExecTask) {
    const now = new Date().toISOString()
    setTasks(prev => prev.map(t => t.id === task.id ? {
      ...t, status: 'active', completed_at: null, completed_by: null, updated_at: now,
    } : t))
    await supabase
      .from('executive_tasks')
      .update({ status: 'active', completed_at: null, completed_by: null, updated_at: now })
      .eq('id', task.id)

    if (task.recurrence && task.recurrence !== 'one_time') {
      const nextDue = calcNextDue(task.due_date, task.recurrence)
      const autoCreated = tasks.find(t =>
        t.status === 'active' &&
        t.title === task.title &&
        t.due_date === nextDue &&
        t.recurrence === task.recurrence
      )
      if (autoCreated) {
        setTasks(prev => prev.filter(t => t.id !== autoCreated.id))
        await supabase.from('executive_tasks').delete().eq('id', autoCreated.id)
      }
    }
  }

  function handleAnimatedComplete(task: ExecTask) {
    if (completingId) return
    setCompletingId(task.id)
    setMenuOpenId(null)
    if (completingTimerRef.current) clearTimeout(completingTimerRef.current)
    completingTimerRef.current = setTimeout(() => {
      handleComplete(task)
      setCompletingId(null)
      completingTimerRef.current = null
    }, 1300)
  }

  /* ── Render helpers ── */

  function renderRow(item: RowItem) {
    const { key, task, isProjected, effectiveDate } = item
    const rel = relativeTime(effectiveDate)
    const isRecurring = !!(task.recurrence && task.recurrence !== 'one_time')
    const isOccExp = occExpId === key
    const isMenuOpen = menuOpenId === key
    const isCompleting = completingId === task.id && !isProjected

    const d = daysDiff(effectiveDate)
    let bcClass = 'border-l-gray-200'
    if (d < 0) bcClass = 'border-l-red-500'
    else if (d <= 30) bcClass = 'border-l-amber-500'
    else if (d <= 365) bcClass = 'border-l-gray-300'

    const occs = isRecurring ? calcOccurrences(effectiveDate, task.recurrence!, task.end_date, 3) : []

    return (
      <div
        key={key}
        className={isCompleting ? 'exec-completing' : ''}
      >
        <div
          className={`w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-r-lg border-l-[3px] ${bcClass} hover:bg-gray-100 transition-colors`}
          style={isProjected ? { borderLeftStyle: 'dashed' } : undefined}
        >
          {isRecurring ? (
            <button
              onClick={() => setOccExpId(isOccExp ? null : key)}
              className="flex-shrink-0"
            >
              <ChevronRightIcon
                className={`w-3 h-3 text-gray-300 opacity-40 transition-transform ${isOccExp ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className={`text-sm font-medium truncate relative ${isProjected ? 'text-gray-500' : 'text-gray-900'}`}>
                {task.title}
                {isCompleting && (
                  <span className="exec-strikethrough-line" />
                )}
              </p>
              {isProjected && (
                <span className="inline-flex items-center rounded-full text-[10px] px-1.5 py-[1px] flex-shrink-0 bg-blue-50 text-blue-600 font-medium">
                  Next occurrence
                </span>
              )}
              {!isProjected && isRecurring && (
                <span
                  className="inline-flex items-center rounded-full text-[11px] px-2 py-[1px] flex-shrink-0"
                  style={{ background: 'rgba(239,159,39,0.12)', color: '#BA7517' }}
                >
                  {task.end_date ? `Ends ${fmtMonYear(task.end_date)}` : '∞ Indefinite'}
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${isProjected ? 'text-gray-400' : 'text-gray-500'}`}>
              Due {fmtDate(effectiveDate)}
              {task.recurrence ? ` · ${recurrenceLabel(task.recurrence)}` : ''}
              {' · '}{task.category}
            </p>
          </div>
          <span className={`text-xs flex-shrink-0 ${rel.cls}`}>{rel.text}</span>
          {!isProjected && (
            <button
              onClick={() => handleAnimatedComplete(task)}
              className={`flex-shrink-0 w-[18px] h-[18px] rounded-[3px] flex items-center justify-center transition-all ${
                isCompleting
                  ? 'bg-[#1D9E75] border-[#1D9E75]'
                  : 'border-2 border-gray-400 hover:border-gray-600'
              }`}
            >
              {isCompleting && <CheckIcon className="w-3 h-3 text-white" />}
            </button>
          )}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpenId(isMenuOpen ? null : key)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded"
            >
              <MoreVerticalIcon className="w-4 h-4" />
            </button>
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px]">
                  <button
                    onClick={() => { setEditingTask(task); setShowModal(true); setMenuOpenId(null) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <PencilIcon className="w-3.5 h-3.5" /> Edit
                  </button>
                  {!isProjected && (
                    <button
                      onClick={() => { setDeleteConfirmId(task.id); setMenuOpenId(null) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {isOccExp && isRecurring && occs.length > 0 && (
          <div className="ml-[15px] pl-3 border-l border-dashed border-gray-200 py-1.5 space-y-1">
            {occs.map((occ, i) => {
              const occRel = relativeTime(occ.date)
              return (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded text-[13px]">
                  <span className="text-gray-600">{fmtDate(occ.date)}</span>
                  <span className={`ml-auto text-[11px] ${occRel.cls}`}>{occRel.text}</span>
                </div>
              )
            })}
            <div className="px-2.5 py-1 text-[11px]" style={{ color: '#BA7517' }}>
              {task.end_date
                ? `Ends ${fmtMonYear(task.end_date)}${occs.at(-1)?.isFinal ? ' · Final occurrence' : ''}`
                : '∞ Recurs indefinitely'}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Loading state ── */

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500"><CalendarDaysIcon className="w-5 h-5" /></span>
          <h3 className="text-sm font-semibold text-gray-900">Executive tasks</h3>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  /* ── Main render ── */

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
      <style>{`
        .exec-completing {
          animation: exec-fade-out 0.3s ease 1s forwards;
        }
        .exec-strikethrough-line {
          position: absolute;
          left: 0;
          top: 50%;
          height: 1.5px;
          background: currentColor;
          animation: exec-strikethrough 0.3s ease forwards;
        }
        @keyframes exec-strikethrough {
          from { width: 0; }
          to { width: 100%; }
        }
        @keyframes exec-fade-out {
          from { opacity: 1; max-height: 80px; margin-bottom: 6px; }
          to { opacity: 0; max-height: 0; margin-bottom: 0; overflow: hidden; }
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-amber-500">
          <CalendarDaysIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Executive tasks</h3>
        {overdueCount > 0 && (
          <span className="text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-medium">
            {overdueCount} overdue
          </span>
        )}
        {dueSoonCount > 0 && (
          <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
            {dueSoonCount} due soon
          </span>
        )}
        <button
          onClick={() => { setEditingTask(null); setShowModal(true) }}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm flex-shrink-0"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New task
        </button>
      </div>

      {/* Scrollable content */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto -mx-4 px-4">
        {/* Needs Attention */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Needs attention
          </p>
          {needsAttentionItems.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">All caught up — nothing due soon.</p>
          ) : (
            <div className="space-y-1.5">{needsAttentionItems.map(renderRow)}</div>
          )}
        </div>

        {/* Upcoming */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Upcoming (within 1 year)
          </p>
          {upcomingItems.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">No upcoming tasks.</p>
          ) : (
            <div className="space-y-1.5">{upcomingItems.map(renderRow)}</div>
          )}
        </div>

        {/* Long-term (collapsed by default) */}
        <div>
          <button
            onClick={() => setLongTermOpen(!longTermOpen)}
            className="flex items-center gap-2 w-full text-left"
          >
            {longTermOpen
              ? <ChevronDownIcon className="w-4 h-4 text-gray-400" />
              : <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Long-term (1 year+)
            </span>
            {longTermItems.length > 0 && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                {longTermItems.length}
              </span>
            )}
          </button>
          {longTermOpen && (
            <div className="mt-2 space-y-1.5">
              {longTermItems.length === 0
                ? <p className="text-xs text-gray-400 py-3 pl-6">No long-term tasks.</p>
                : longTermItems.map(renderRow)}
            </div>
          )}
        </div>

        {/* Recently Completed (collapsed by default) */}
        <div>
          <button
            onClick={() => setCompletedOpen(!completedOpen)}
            className="flex items-center gap-2 w-full text-left"
          >
            {completedOpen
              ? <ChevronDownIcon className="w-4 h-4 text-gray-400" />
              : <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Recently completed
            </span>
            {completedTasks.length > 0 && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                {completedTasks.length}
              </span>
            )}
          </button>
          {completedOpen && (
            <div className="mt-2 space-y-1.5">
              {completedTasks.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 pl-6">No completed tasks yet.</p>
              ) : (
                completedTasks.map(task => {
                  const isCompMenuOpen = menuOpenId === `completed_${task.id}`
                  return (
                    <div key={task.id} className="opacity-60">
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-r-lg border-l-[3px] border-l-green-500">
                        <span className="w-3 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate line-through">{task.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Completed{' '}
                            {task.completed_at
                              ? new Date(task.completed_at).toLocaleDateString('en-US', {
                                  month: 'short', day: 'numeric', year: 'numeric',
                                })
                              : ''}
                            {task.recurrence ? ` · ${recurrenceLabel(task.recurrence)}` : ''}
                            {' · '}{task.category}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded flex-shrink-0">
                          Done
                        </span>
                        <button
                          onClick={() => handleUncomplete(task)}
                          className="flex-shrink-0 w-[18px] h-[18px] rounded-[3px] bg-[#1D9E75] flex items-center justify-center"
                        >
                          <CheckIcon className="w-3 h-3 text-white" />
                        </button>
                        <div className="relative flex-shrink-0">
                          <button
                            onClick={() => setMenuOpenId(isCompMenuOpen ? null : `completed_${task.id}`)}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded"
                          >
                            <MoreVerticalIcon className="w-4 h-4" />
                          </button>
                          {isCompMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px]">
                                <button
                                  onClick={() => { setEditingTask(task); setShowModal(true); setMenuOpenId(null) }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                  <PencilIcon className="w-3.5 h-3.5" /> Edit
                                </button>
                                <button
                                  onClick={() => { setDeleteConfirmId(task.id); setMenuOpenId(null) }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2Icon className="w-3.5 h-3.5" /> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <ExecTaskModal
          task={editingTask}
          categories={categories}
          onSave={data => editingTask ? handleUpdate(editingTask.id, data) : handleCreate(data)}
          onClose={() => { setShowModal(false); setEditingTask(null) }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Task</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Modal                                                              */
/* ================================================================== */

function ExecTaskModal({
  task,
  categories,
  onSave,
  onClose,
}: {
  task: ExecTask | null
  categories: string[]
  onSave: (data: {
    title: string; description: string; category: string
    due_date: string; recurrence: string; end_date: string | null
  }) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [category, setCategory] = useState(task?.category ?? 'Filing')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [recurrence, setRecurrence] = useState(task?.recurrence ?? 'yearly')
  const [endsMode, setEndsMode] = useState<'never' | 'on_date'>(task?.end_date ? 'on_date' : 'never')
  const [endDate, setEndDate] = useState(task?.end_date ?? '')
  const [addingCategory, setAddingCategory] = useState(false)
  const [customCategory, setCustomCategory] = useState('')

  const isOneTime = recurrence === 'one_time'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !dueDate) return
    const finalEndDate = isOneTime || endsMode === 'never' ? null : endDate || null
    onSave({ title: title.trim(), description, category, due_date: dueDate, recurrence, end_date: finalEndDate })
  }

  function confirmCustomCategory() {
    const trimmed = customCategory.trim()
    if (trimmed) {
      setCategory(trimmed)
      setAddingCategory(false)
      setCustomCategory('')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {task ? 'Edit Executive Task' : 'New Executive Task'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Annual report — Secretary of State"
              autoFocus
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400 resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              {addingCategory ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmCustomCategory() } }}
                    placeholder="New category..."
                    autoFocus
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 placeholder-gray-400"
                  />
                  <button type="button" onClick={confirmCustomCategory} className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                    <CheckIcon className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => { setAddingCategory(false); setCustomCategory('') }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={e => {
                    if (e.target.value === '__add_new__') { setAddingCategory(true) }
                    else setCategory(e.target.value)
                  }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__add_new__">+ Add new</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
              <select
                value={recurrence}
                onChange={e => setRecurrence(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
              >
                {RECURRENCE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due date *</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
            />
          </div>

          {!isOneTime && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ends</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="ends"
                    checked={endsMode === 'never'}
                    onChange={() => setEndsMode('never')}
                    className="accent-amber-500"
                  />
                  Never
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="ends"
                    checked={endsMode === 'on_date'}
                    onChange={() => setEndsMode('on_date')}
                    className="accent-amber-500"
                  />
                  On date
                </label>
              </div>
              {endsMode === 'on_date' && (
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 bg-white"
                />
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !dueDate}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 rounded-lg transition-colors"
            >
              {task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
