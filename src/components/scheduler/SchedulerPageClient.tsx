'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeftIcon, ChevronRightIcon, AlertTriangleIcon, XIcon, GripVerticalIcon } from 'lucide-react'
import type { Project, EmployeeProfile } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface Assignment {
  id: string
  project_id: string
  employee_id: string
  assigned_date: string
  created_at?: string
}

interface BucketPosition {
  id: string
  project_id: string
  position_x: number
  position_y: number
  updated_at?: string
}

interface ConflictInfo {
  employee: EmployeeProfile
  existingProject: Project
  targetProject: Project
  date: string
  pendingProjectId: string
  pendingEmployeeId: string
  pendingDate: string
}

interface SchedulerPageClientProps {
  initialProjects: Project[]
  initialEmployees: EmployeeProfile[]
  initialAssignments: Assignment[]
  initialBucketPositions: BucketPosition[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date
}

function getWeekDays(monday: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  return days
}

function formatShortDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

function formatDateNum(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dateOverlaps(start: string, end: string, day: string): boolean {
  return day >= start && day <= end
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SchedulerPageClient({
  initialProjects,
  initialEmployees,
  initialAssignments,
  initialBucketPositions,
}: SchedulerPageClientProps) {
  const supabase = createClient()

  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [bucketPositions, setBucketPositions] = useState<BucketPosition[]>(initialBucketPositions)
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [syncToCrew, setSyncToCrew] = useState(false)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [dragEmployee, setDragEmployee] = useState<EmployeeProfile | null>(null)

  // Dragging bucket state
  const [draggingBucketId, setDraggingBucketId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const gridRef = useRef<HTMLDivElement>(null)

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const weekDayStrs = useMemo(() => weekDays.map(d => toDateStr(d)), [weekDays])

  // Filter projects that overlap with the current week
  const weekProjects = useMemo(() => {
    const weekStartStr = weekDayStrs[0]
    const weekEndStr = weekDayStrs[6]
    return initialProjects.filter(p =>
      p.start_date && p.end_date &&
      p.start_date <= weekEndStr && p.end_date >= weekStartStr
    )
  }, [initialProjects, weekDayStrs])

  // Map of project positions
  const positionMap = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {}
    bucketPositions.forEach(bp => {
      map[bp.project_id] = { x: bp.position_x, y: bp.position_y }
    })
    return map
  }, [bucketPositions])

  // ── Week navigation ────────────────────────────────────────────────────

  function prevWeek() {
    setWeekStart(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return d
    })
  }

  function nextWeek() {
    setWeekStart(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      return d
    })
  }

  function goToday() {
    setWeekStart(getMonday(new Date()))
  }

  // ── Employee drag handlers ─────────────────────────────────────────────

  function handleEmployeeDragStart(e: React.DragEvent, emp: EmployeeProfile) {
    setDragEmployee(emp)
    e.dataTransfer.setData('text/plain', emp.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleDropOnDay(projectId: string, dateStr: string) {
    if (!dragEmployee) return
    checkAndAssign(dragEmployee, projectId, dateStr)
    setDragEmployee(null)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  // ── Assignment logic ───────────────────────────────────────────────────

  function checkAndAssign(employee: EmployeeProfile, projectId: string, dateStr: string) {
    // Already assigned to this project on this day?
    const existing = assignments.find(
      a => a.employee_id === employee.id && a.assigned_date === dateStr && a.project_id === projectId
    )
    if (existing) return

    // Check conflicts with other projects
    const conflictAssignment = assignments.find(
      a => a.employee_id === employee.id && a.assigned_date === dateStr && a.project_id !== projectId
    )

    if (conflictAssignment) {
      const existingProject = initialProjects.find(p => p.id === conflictAssignment.project_id)
      const targetProject = initialProjects.find(p => p.id === projectId)
      if (existingProject && targetProject) {
        setConflict({
          employee,
          existingProject,
          targetProject,
          date: dateStr,
          pendingProjectId: projectId,
          pendingEmployeeId: employee.id,
          pendingDate: dateStr,
        })
        return
      }
    }

    doAssign(employee.id, projectId, dateStr)
  }

  async function doAssign(employeeId: string, projectId: string, dateStr: string) {
    const tempId = `temp-${Date.now()}`
    const newAssignment: Assignment = {
      id: tempId,
      project_id: projectId,
      employee_id: employeeId,
      assigned_date: dateStr,
    }
    setAssignments(prev => [...prev, newAssignment])

    const { data, error } = await supabase
      .from('scheduler_assignments')
      .insert({ project_id: projectId, employee_id: employeeId, assigned_date: dateStr })
      .select()
      .single()

    if (error) {
      console.error('Failed to assign:', error)
      setAssignments(prev => prev.filter(a => a.id !== tempId))
    } else if (data) {
      setAssignments(prev => prev.map(a => a.id === tempId ? data as Assignment : a))
    }

    // Sync to crew if enabled
    if (syncToCrew) {
      const proj = initialProjects.find(p => p.id === projectId)
      if (proj) {
        const emp = initialEmployees.find(e => e.id === employeeId)
        if (emp) {
          const currentCrew = proj.crew ? proj.crew.split(',').map(s => s.trim()).filter(Boolean) : []
          if (!currentCrew.includes(emp.name)) {
            const newCrew = [...currentCrew, emp.name].join(', ')
            await supabase.from('projects').update({ crew: newCrew }).eq('id', projectId)
          }
        }
      }
    }
  }

  async function removeAssignment(assignmentId: string) {
    const assignment = assignments.find(a => a.id === assignmentId)
    setAssignments(prev => prev.filter(a => a.id !== assignmentId))

    if (assignment && !assignment.id.startsWith('temp-')) {
      await supabase.from('scheduler_assignments').delete().eq('id', assignmentId)
    }

    // Sync to crew if enabled — remove from crew if no more assignments for this employee on this project
    if (syncToCrew && assignment) {
      const remaining = assignments.filter(
        a => a.id !== assignmentId && a.project_id === assignment.project_id && a.employee_id === assignment.employee_id
      )
      if (remaining.length === 0) {
        const proj = initialProjects.find(p => p.id === assignment.project_id)
        const emp = initialEmployees.find(e => e.id === assignment.employee_id)
        if (proj && emp) {
          const currentCrew = proj.crew ? proj.crew.split(',').map(s => s.trim()).filter(Boolean) : []
          const newCrew = currentCrew.filter(n => n !== emp.name).join(', ')
          await supabase.from('projects').update({ crew: newCrew || null }).eq('id', proj.id)
        }
      }
    }
  }

  function handleConflictAssign() {
    if (!conflict) return
    doAssign(conflict.pendingEmployeeId, conflict.pendingProjectId, conflict.pendingDate)
    setConflict(null)
  }

  // ── Bucket dragging ────────────────────────────────────────────────────

  const handleBucketMouseDown = useCallback((e: React.MouseEvent, projectId: string) => {
    e.preventDefault()
    const rect = (e.currentTarget.closest('[data-bucket]') as HTMLElement)?.getBoundingClientRect()
    if (!rect) return
    setDraggingBucketId(projectId)
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  useEffect(() => {
    if (!draggingBucketId) return

    function handleMouseMove(e: MouseEvent) {
      if (!gridRef.current || !draggingBucketId) return
      const gridRect = gridRef.current.getBoundingClientRect()
      const x = Math.max(0, e.clientX - gridRect.left - dragOffset.x)
      const y = Math.max(0, e.clientY - gridRect.top - dragOffset.y + gridRef.current.scrollTop)

      setBucketPositions(prev => {
        const existing = prev.find(bp => bp.project_id === draggingBucketId)
        if (existing) {
          return prev.map(bp =>
            bp.project_id === draggingBucketId
              ? { ...bp, position_x: Math.round(x), position_y: Math.round(y) }
              : bp
          )
        }
        return [...prev, { id: `temp-${draggingBucketId}`, project_id: draggingBucketId, position_x: Math.round(x), position_y: Math.round(y) }]
      })
    }

    function handleMouseUp() {
      if (!draggingBucketId) return
      const pos = bucketPositions.find(bp => bp.project_id === draggingBucketId)
      if (pos) {
        saveBucketPosition(draggingBucketId, pos.position_x, pos.position_y)
      }
      setDraggingBucketId(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingBucketId, dragOffset, bucketPositions]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveBucketPosition(projectId: string, x: number, y: number) {
    const { data, error } = await supabase
      .from('scheduler_bucket_positions')
      .upsert({ project_id: projectId, position_x: x, position_y: y, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
      .select()
      .single()

    if (!error && data) {
      setBucketPositions(prev => {
        const filtered = prev.filter(bp => bp.project_id !== projectId)
        return [...filtered, data as BucketPosition]
      })
    }
  }

  // ── Auto-layout for new buckets without positions ──────────────────────

  function getBucketPosition(projectId: string, index: number): { x: number; y: number } {
    const saved = positionMap[projectId]
    if (saved) return saved
    // Auto grid layout: 2 columns, 320px wide with 16px gap
    const col = index % 2
    const row = Math.floor(index / 2)
    return { x: col * 340, y: row * 260 }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const todayStr = toDateStr(new Date())

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Conflict Banner */}
      {conflict && (
        <div className="flex-none bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-3">
          <AlertTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <span className="font-semibold">{conflict.employee.name}</span> is already scheduled for{' '}
            <span className="font-semibold">{conflict.existingProject.name}</span> on{' '}
            {new Date(conflict.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}.
            Assign anyway?
          </p>
          <button
            onClick={handleConflictAssign}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold rounded-lg transition"
          >
            Assign Anyway
          </button>
          <button
            onClick={() => setConflict(null)}
            className="px-3 py-1.5 border border-amber-300 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-100 transition"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ── Left Sidebar: Employees ──────────────────────────────────── */}
        <div className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
          <div className="flex-none px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Employees</h2>
            <p className="text-xs text-gray-400 mt-0.5">Drag onto a day to assign</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {initialEmployees.map(emp => (
              <div
                key={emp.id}
                draggable
                onDragStart={(e) => handleEmployeeDragStart(e, emp)}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-grab active:cursor-grabbing hover:border-gray-300 hover:bg-gray-100 transition select-none"
              >
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt={emp.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-gray-500">{getInitials(emp.name)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{emp.name}</p>
                  {emp.role && <p className="text-xs text-gray-500 truncate">{emp.role}</p>}
                </div>
              </div>
            ))}
            {initialEmployees.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No employees found</p>
            )}
          </div>
        </div>

        {/* ── Right Main Area ──────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar */}
          <div className="flex-none px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Scheduler</h1>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <span className="whitespace-nowrap">Sync to Job Crew:</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={syncToCrew}
                  onClick={() => setSyncToCrew(!syncToCrew)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${syncToCrew ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${syncToCrew ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-xs font-medium">{syncToCrew ? 'On' : 'Off'}</span>
              </label>
            </div>
          </div>

          {/* Mini Calendar Week View */}
          <div className="flex-none px-4 py-3 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3">
              <button onClick={prevWeek} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition">
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button onClick={goToday} className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition">
                Today
              </button>
              <button onClick={nextWeek} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition">
                <ChevronRightIcon className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-gray-700 ml-2">
                {weekDays[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – {weekDays[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1 mt-2">
              {weekDays.map((day, i) => {
                const dayStr = weekDayStrs[i]
                const isToday = dayStr === todayStr
                const hasJobs = weekProjects.some(p => p.start_date && p.end_date && dateOverlaps(p.start_date, p.end_date, dayStr))
                return (
                  <div
                    key={dayStr}
                    className={`text-center py-1.5 rounded-md text-xs ${
                      isToday
                        ? 'bg-amber-500 text-white font-bold'
                        : 'text-gray-600'
                    }`}
                  >
                    <div className="font-medium">{formatShortDay(day)}</div>
                    <div className={isToday ? 'text-white/80' : 'text-gray-400'}>{day.getDate()}</div>
                    {hasJobs && !isToday && (
                      <div className="mx-auto mt-0.5 w-1 h-1 rounded-full bg-amber-400" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Job Grid Workspace */}
          <div
            ref={gridRef}
            className="flex-1 overflow-auto relative"
            style={{
              backgroundSize: '20px 20px',
              backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
              backgroundColor: '#fafafa',
            }}
          >
            <div className="relative" style={{ minHeight: '800px', minWidth: '700px' }}>
              {weekProjects.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-gray-400 text-sm">No jobs scheduled for this week</p>
                </div>
              )}

              {weekProjects.map((proj, idx) => {
                const pos = getBucketPosition(proj.id, idx)
                const color = proj.color || '#f59e0b'
                const activeDays = weekDayStrs.filter(d =>
                  proj.start_date && proj.end_date && dateOverlaps(proj.start_date, proj.end_date, d)
                )

                return (
                  <div
                    key={proj.id}
                    data-bucket
                    className={`absolute bg-white rounded-xl shadow-sm border-2 transition-shadow ${
                      draggingBucketId === proj.id ? 'shadow-lg z-50' : 'shadow-sm z-10'
                    }`}
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: 320,
                      borderColor: color,
                      userSelect: draggingBucketId === proj.id ? 'none' : undefined,
                    }}
                  >
                    {/* Bucket Header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 border-b rounded-t-xl cursor-grab active:cursor-grabbing"
                      style={{ borderColor: color + '33', backgroundColor: color + '0D' }}
                      onMouseDown={(e) => handleBucketMouseDown(e, proj.id)}
                    >
                      <GripVerticalIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{proj.name}</p>
                        <p className="text-xs text-gray-500 truncate">{proj.client_name}</p>
                      </div>
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                    </div>

                    {/* Date range */}
                    <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">
                      {proj.start_date && new Date(proj.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' – '}
                      {proj.end_date && new Date(proj.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <span className="ml-2 text-gray-300">
                        {activeDays.map(d => formatShortDay(new Date(d + 'T12:00:00'))).join(' ')}
                      </span>
                    </div>

                    {/* Day Drop Zones */}
                    <div className="p-2 space-y-1">
                      {activeDays.map(dayStr => {
                        const dayAssignments = assignments.filter(
                          a => a.project_id === proj.id && a.assigned_date === dayStr
                        )
                        const dayLabel = new Date(dayStr + 'T12:00:00')

                        return (
                          <div
                            key={dayStr}
                            onDragOver={handleDragOver}
                            onDrop={(e) => { e.preventDefault(); handleDropOnDay(proj.id, dayStr) }}
                            className="flex items-start gap-2 p-1.5 rounded-md border border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition min-h-[36px]"
                          >
                            <span className="text-[10px] font-semibold text-gray-400 uppercase w-8 flex-shrink-0 pt-1">
                              {formatShortDay(dayLabel)}
                            </span>
                            <div className="flex flex-wrap gap-1 flex-1 min-h-[24px]">
                              {dayAssignments.map(a => {
                                const emp = initialEmployees.find(e => e.id === a.employee_id)
                                if (!emp) return null
                                return (
                                  <div
                                    key={a.id}
                                    className="flex items-center gap-1 bg-gray-100 rounded-full pl-1 pr-0.5 py-0.5 text-[10px] font-medium text-gray-700"
                                  >
                                    <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                      {emp.photo_url ? (
                                        <img src={emp.photo_url} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <span className="text-[8px] font-bold text-gray-500">{getInitials(emp.name)}</span>
                                      )}
                                    </div>
                                    <span className="truncate max-w-[80px]">{emp.name.split(' ')[0]}</span>
                                    <button
                                      onClick={() => removeAssignment(a.id)}
                                      className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0"
                                    >
                                      <XIcon className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                )
                              })}
                              {dayAssignments.length === 0 && (
                                <span className="text-[10px] text-gray-300 pt-1">Drop here</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {activeDays.length === 0 && (
                        <p className="text-xs text-gray-300 text-center py-2">No active days this week</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
