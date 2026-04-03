'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutGridIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  CheckIcon,
} from 'lucide-react'
import { Project } from '@/types'

interface ChecklistItem {
  id: string
  project_id: string
  name: string
  is_complete: boolean
}

interface JobsOverviewProps {
  projects: Project[]
  onSelectProject: (project: Project) => void
  onBack?: () => void
}

export default function JobsOverview({ projects, onSelectProject, onBack }: JobsOverviewProps) {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showClosed, setShowClosed] = useState(false)

  // Fetch all checklist items in one query
  useEffect(() => {
    async function fetchChecklist() {
      setLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_checklist_items')
        .select('id, project_id, name, is_complete')
        .order('sort_order', { ascending: true })
      if (error) console.error('[JobsOverview] Fetch checklist failed:', error)
      setChecklistItems((data as ChecklistItem[]) ?? [])
      setLoading(false)
    }
    fetchChecklist()
  }, [])

  // Group checklist items by project_id
  const checklistByProject = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>()
    for (const item of checklistItems) {
      const list = map.get(item.project_id)
      if (list) list.push(item)
      else map.set(item.project_id, [item])
    }
    return map
  }, [checklistItems])

  // Split projects by status
  const activeProjects = useMemo(() => projects.filter((p) => p.status === 'Active'), [projects])
  const completedProjects = useMemo(() => projects.filter((p) => p.status === 'Complete'), [projects])
  const closedProjects = useMemo(() => projects.filter((p) => p.status === 'Closed'), [projects])

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 py-20">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <ChevronRightIcon className="w-5 h-5 rotate-180" />
            </button>
          )}
          <LayoutGridIcon className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-bold text-gray-900">Jobs Overview</h2>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Active Section */}
        <ProjectSection
          title="Active"
          count={activeProjects.length}
          projects={activeProjects}
          checklistByProject={checklistByProject}
          onSelectProject={onSelectProject}
          defaultExpanded={true}
          badgeColor="bg-green-100 text-green-700"
        />

        {/* Completed Section */}
        <ProjectSection
          title="Completed"
          count={completedProjects.length}
          projects={completedProjects}
          checklistByProject={checklistByProject}
          onSelectProject={onSelectProject}
          defaultExpanded={true}
          badgeColor="bg-amber-100 text-amber-700"
        />

        {/* Closed Section */}
        {closedProjects.length > 0 && (
          <ProjectSection
            title="Closed"
            count={closedProjects.length}
            projects={closedProjects}
            checklistByProject={checklistByProject}
            onSelectProject={onSelectProject}
            defaultExpanded={false}
            badgeColor="bg-gray-100 text-gray-500"
          />
        )}
      </div>
    </div>
  )
}

/* ── Section Component ─────────────────────────────────────────────── */

function ProjectSection({
  title,
  count,
  projects,
  checklistByProject,
  onSelectProject,
  defaultExpanded,
  badgeColor,
}: {
  title: string
  count: number
  projects: Project[]
  checklistByProject: Map<string, ChecklistItem[]>
  onSelectProject: (project: Project) => void
  defaultExpanded: boolean
  badgeColor: string
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (count === 0) return null

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        <ChevronRightIcon
          className={`w-4 h-4 text-amber-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">{title}</span>
        <span className="text-sm text-gray-400">({count})</span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectSummaryCard
              key={project.id}
              project={project}
              checklistItems={checklistByProject.get(project.id) ?? []}
              onSelect={() => onSelectProject(project)}
              badgeColor={badgeColor}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Project Summary Card ──────────────────────────────────────────── */

function ProjectSummaryCard({
  project,
  checklistItems,
  onSelect,
  badgeColor,
}: {
  project: Project
  checklistItems: ChecklistItem[]
  onSelect: () => void
  badgeColor: string
}) {
  const completedCount = checklistItems.filter((i) => i.is_complete).length
  const totalCount = checklistItems.length

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
      {/* Job Info Row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {project.estimate_number && (
              <span className="text-xs font-medium text-gray-400 flex-shrink-0">Est. #{project.estimate_number}</span>
            )}
            {project.estimate_number && <span className="text-xs text-gray-300">-</span>}
            <span className="text-sm font-semibold text-gray-900 truncate">{project.name}</span>
            {project.client_name && (
              <>
                <span className="text-xs text-gray-300">&middot;</span>
                <span className="text-xs text-gray-500 truncate">{project.client_name}</span>
              </>
            )}
          </div>
          {project.address && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{project.address}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${badgeColor}`}>
            {project.status}
          </span>
          <button
            onClick={onSelect}
            className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition"
          >
            Open
            <ArrowRightIcon className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Checklist Squares */}
      {totalCount > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              Checklist
            </span>
            <span className="text-[10px] text-gray-400">
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {checklistItems.map((item) => (
              <div
                key={item.id}
                className={`relative rounded-lg border px-2.5 py-2 w-[110px] sm:w-[120px] ${
                  item.is_complete
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <p className={`text-[11px] leading-tight line-clamp-2 ${
                  item.is_complete ? 'text-green-700' : 'text-gray-600'
                }`}>
                  {item.name}
                </p>
                {item.is_complete && (
                  <div className="absolute top-1 right-1">
                    <CheckIcon className="w-3 h-3 text-green-500" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
