'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  GitBranchIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  HistoryIcon,
  Loader2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type {
  EstimatingProject,
  PipelineStage,
  PipelineHistoryEntry,
  ReminderRule,
} from './types'

interface ProjectPipelineCardProps {
  project: EstimatingProject
  userId: string
  onPatch: (patch: Partial<EstimatingProject>) => void
}

export default function ProjectPipelineCard({
  project,
  userId,
  onPatch,
}: ProjectPipelineCardProps) {
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [history, setHistory] = useState<PipelineHistoryEntry[]>([])
  const [historyDisplayNames, setHistoryDisplayNames] = useState<
    Record<string, string>
  >({})
  const [loading, setLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [confirmStage, setConfirmStage] = useState<PipelineStage | null>(null)
  const [moving, setMoving] = useState(false)

  const fetchStages = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    setStages((data as PipelineStage[]) ?? [])
  }, [])

  const fetchHistory = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('pipeline_history')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    const rows = (data as PipelineHistoryEntry[]) ?? []
    setHistory(rows)

    const userIds = Array.from(
      new Set(rows.map((r) => r.changed_by).filter(Boolean) as string[])
    )
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)
      const map: Record<string, string> = {}
      ;((profs ?? []) as { id: string; display_name: string | null }[]).forEach(
        (p) => {
          map[p.id] = p.display_name ?? 'Someone'
        }
      )
      setHistoryDisplayNames(map)
    }
  }, [project.id])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      await Promise.all([fetchStages(), fetchHistory()])
      if (mounted) setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [fetchStages, fetchHistory])

  const currentIndex = stages.findIndex((s) => s.name === project.pipeline_stage)

  async function triggerEstimateSentReminders(projectId: string) {
    const supabase = createClient()
    const { data: rules } = await supabase
      .from('reminder_rules')
      .select('*')
      .eq('trigger_event', 'estimate_sent')
      .eq('is_active', true)
    const activeRules = (rules as ReminderRule[]) ?? []
    if (activeRules.length === 0) return

    const now = new Date()
    const inserts = activeRules.map((r) => {
      const due = new Date(now)
      due.setDate(due.getDate() + r.days_after)
      const title = r.title_template.replace(/\{project_name\}/g, project.name)
      return {
        project_id: projectId,
        title,
        description: null,
        due_date: due.toISOString(),
        reminder_type: 'auto',
        trigger_event: 'estimate_sent',
        status: 'pending',
        created_by: userId,
      }
    })
    await supabase.from('estimating_reminders').insert(inserts)
  }

  async function completePendingReminders(projectId: string) {
    const supabase = createClient()
    await supabase
      .from('estimating_reminders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('status', 'pending')
  }

  async function moveToStage(stage: PipelineStage) {
    setMoving(true)
    const supabase = createClient()
    const fromStage = project.pipeline_stage
    const toStage = stage.name

    const projectPatch: Partial<EstimatingProject> = { pipeline_stage: toStage }
    if (toStage === 'Won') {
      projectPatch.status = 'completed'
    } else if (toStage === 'Lost') {
      projectPatch.status = 'on_hold'
    }

    const { error: updErr } = await supabase
      .from('estimating_projects')
      .update(projectPatch)
      .eq('id', project.id)
    if (updErr) {
      console.error('[Pipeline] Update failed:', updErr)
      setMoving(false)
      return
    }

    await supabase.from('pipeline_history').insert({
      project_id: project.id,
      from_stage: fromStage,
      to_stage: toStage,
      changed_by: userId,
    })

    if (toStage === 'Estimate Sent') {
      await triggerEstimateSentReminders(project.id)
    }
    if (toStage === 'Won' || toStage === 'Lost') {
      await completePendingReminders(project.id)
    }

    onPatch(projectPatch)
    await fetchHistory()
    setMoving(false)
    setConfirmStage(null)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <GitBranchIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">Pipeline</h3>
        </div>
        <div className="py-6 flex items-center justify-center text-gray-400">
          <Loader2Icon className="w-4 h-4 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-amber-500">
            <GitBranchIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 flex-1">Pipeline</h3>
        </div>

        {stages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No pipeline stages configured.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
            <div className="flex items-center gap-1 min-w-max">
              {stages.map((stage, idx) => {
                const isCurrent = idx === currentIndex
                const isCompleted = currentIndex >= 0 && idx < currentIndex
                return (
                  <div key={stage.id} className="flex items-center">
                    <StagePill
                      stage={stage}
                      isCurrent={isCurrent}
                      isCompleted={isCompleted}
                      onClick={() => setConfirmStage(stage)}
                    />
                    {idx < stages.length - 1 && (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-gray-300 mx-0.5 flex-shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition"
          >
            <HistoryIcon className="w-3.5 h-3.5" />
            Stage history
            {history.length > 0 && (
              <span className="text-gray-400">({history.length})</span>
            )}
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform ${
                historyOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-1">
              {history.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">No stage changes yet.</p>
              ) : (
                <>
                  {(historyExpanded ? history : history.slice(0, 5)).map((h) => (
                    <div
                      key={h.id}
                      className="text-xs text-gray-600 py-1 px-2 bg-gray-50 rounded"
                    >
                      <span className="font-medium text-gray-900">
                        {h.changed_by
                          ? historyDisplayNames[h.changed_by] ?? 'Someone'
                          : 'System'}
                      </span>
                      {h.from_stage ? (
                        <> moved from <span className="font-medium">{h.from_stage}</span> to </>
                      ) : (
                        <> set stage to </>
                      )}
                      <span className="font-medium">{h.to_stage}</span>
                      <span className="text-gray-400">
                        {' — '}
                        {new Date(h.created_at).toLocaleDateString()}{' '}
                        {new Date(h.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                  {history.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setHistoryExpanded((v) => !v)}
                      className="text-xs font-medium text-amber-600 hover:text-amber-700 mt-1"
                    >
                      {historyExpanded ? 'Show less' : `Show all (${history.length})`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmStage && (
        <ConfirmDialog
          title={`Move to ${confirmStage.name}?`}
          message={`This will update the project's pipeline stage to "${confirmStage.name}" and log the change.`}
          confirmLabel={`Move to ${confirmStage.name}`}
          variant="default"
          loading={moving}
          onConfirm={() => moveToStage(confirmStage)}
          onCancel={() => (moving ? null : setConfirmStage(null))}
        />
      )}
    </>
  )
}

function StagePill({
  stage,
  isCurrent,
  isCompleted,
  onClick,
}: {
  stage: PipelineStage
  isCurrent: boolean
  isCompleted: boolean
  onClick: () => void
}) {
  const baseClass =
    'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition focus:outline-none'

  if (isCurrent) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} border-2 font-semibold shadow-sm`}
        style={{
          borderColor: stage.color,
          color: stage.color,
          backgroundColor: hexWithAlpha(stage.color, 0.1),
        }}
      >
        {stage.name}
      </button>
    )
  }
  if (isCompleted) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} text-white hover:opacity-90`}
        style={{ backgroundColor: stage.color }}
      >
        <CheckIcon className="w-3 h-3" />
        {stage.name}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClass} border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50`}
    >
      {stage.name}
    </button>
  )
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
