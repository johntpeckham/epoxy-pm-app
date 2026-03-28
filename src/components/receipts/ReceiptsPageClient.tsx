'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, ReceiptIcon, SearchIcon, ChevronDownIcon, ChevronRightIcon, DownloadIcon, LoaderIcon } from 'lucide-react'
import { Project, ReceiptContent, DynamicFieldEntry } from '@/types'
import ReceiptCard from './ReceiptCard'
import NewReceiptModal from './NewReceiptModal'
import { useUserRole } from '@/lib/useUserRole'
import { usePermissions } from '@/lib/usePermissions'
import { useCompanySettings } from '@/lib/useCompanySettings'

interface ReceiptRow {
  id: string
  project_id: string
  created_at: string
  content: ReceiptContent
  dynamic_fields?: DynamicFieldEntry[]
  confirmed: boolean
  restricted: boolean
  project_name: string
}

interface ReceiptsPageClientProps {
  initialReceipts: ReceiptRow[]
  projects: Project[]
  allProjects: Project[]
  userId: string
}

type SortOption = 'newest' | 'oldest' | 'amount_high' | 'amount_low' | 'project_az'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'amount_high', label: 'Amount (High-Low)' },
  { value: 'amount_low', label: 'Amount (Low-High)' },
  { value: 'project_az', label: 'Project Name (A-Z)' },
]

function formatGroupDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Group receipts by project, then by date within each project. */
function groupByProjectAndDate(receipts: ReceiptRow[], sort: SortOption) {
  const projectMap = new Map<
    string,
    { projectName: string; dates: Map<string, ReceiptRow[]>; latestDate: string; oldestDate: string; totalAmount: number }
  >()

  for (const receipt of receipts) {
    let project = projectMap.get(receipt.project_id)
    const dateKey = receipt.content.receipt_date || receipt.created_at.slice(0, 10)
    if (!project) {
      project = { projectName: receipt.project_name, dates: new Map(), latestDate: dateKey, oldestDate: dateKey, totalAmount: 0 }
      projectMap.set(receipt.project_id, project)
    }
    if (dateKey > project.latestDate) project.latestDate = dateKey
    if (dateKey < project.oldestDate) project.oldestDate = dateKey
    project.totalAmount += receipt.content.total_amount
    const existing = project.dates.get(dateKey) ?? []
    existing.push(receipt)
    project.dates.set(dateKey, existing)
  }

  const dateDir = sort === 'oldest' ? 1 : -1

  return Array.from(projectMap.entries())
    .sort(([, a], [, b]) => {
      if (sort === 'project_az') return a.projectName.localeCompare(b.projectName)
      if (sort === 'amount_high') return b.totalAmount - a.totalAmount
      if (sort === 'amount_low') return a.totalAmount - b.totalAmount
      if (sort === 'newest') return b.latestDate.localeCompare(a.latestDate)
      return a.oldestDate.localeCompare(b.oldestDate)
    })
    .map(([projectId, project]) => {
      const receiptCount = Array.from(project.dates.values()).reduce((sum, arr) => sum + arr.length, 0)
      return {
        projectId,
        projectName: project.projectName,
        totalAmount: project.totalAmount,
        receiptCount,
        dates: Array.from(project.dates.entries())
          .sort(([a], [b]) => a.localeCompare(b) * dateDir)
          .map(([date, receipts]) => ({ date, receipts })),
      }
    })
}

export default function ReceiptsPageClient({
  initialReceipts,
  projects,
  allProjects,
  userId,
}: ReceiptsPageClientProps) {
  const router = useRouter()
  const { role } = useUserRole()
  const { canCreate } = usePermissions(role)
  const { settings: companySettings } = useCompanySettings()
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('newest')
  const [filterProject, _setFilterProject] = useState<string>('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [downloadingProject, setDownloadingProject] = useState<string | null>(null)

  const projectStatusMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of allProjects) map.set(p.id, p.status)
    return map
  }, [allProjects])


  const filtered = useMemo(() => {
    let result = initialReceipts

    // Filter by project
    if (filterProject) {
      result = result.filter((r) => r.project_name === filterProject)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => {
        return (
          r.project_name.toLowerCase().includes(q) ||
          r.content.vendor_name.toLowerCase().includes(q) ||
          r.content.category.toLowerCase().includes(q) ||
          r.content.receipt_date.includes(q) ||
          String(r.content.total_amount).includes(q)
        )
      })
    }

    // Sort
    return [...result].sort((a, b) => {
      switch (sortOption) {
        case 'newest': {
          const dateA = a.content.receipt_date || a.created_at.slice(0, 10)
          const dateB = b.content.receipt_date || b.created_at.slice(0, 10)
          return dateB.localeCompare(dateA)
        }
        case 'oldest': {
          const dateA = a.content.receipt_date || a.created_at.slice(0, 10)
          const dateB = b.content.receipt_date || b.created_at.slice(0, 10)
          return dateA.localeCompare(dateB)
        }
        case 'amount_high':
          return b.content.total_amount - a.content.total_amount
        case 'amount_low':
          return a.content.total_amount - b.content.total_amount
        case 'project_az':
          return a.project_name.localeCompare(b.project_name)
        default:
          return 0
      }
    })
  }, [initialReceipts, searchQuery, sortOption, filterProject])

  const grouped = useMemo(() => groupByProjectAndDate(filtered, sortOption), [filtered, sortOption])

  const inProgressGroups = useMemo(
    () => grouped.filter((g) => projectStatusMap.get(g.projectId) !== 'Complete'),
    [grouped, projectStatusMap]
  )
  const completedGroups = useMemo(
    () => grouped.filter((g) => projectStatusMap.get(g.projectId) === 'Complete'),
    [grouped, projectStatusMap]
  )

  function handleCreated() {
    setShowModal(false)
    router.refresh()
  }

  async function handleDownloadReport(projectId: string, projectName: string) {
    setDownloadingProject(projectId)
    try {
      const projectReceipts = filtered.filter((r) => r.project_id === projectId)
      const { generateExpenseReportPdf } = await import('@/lib/generateExpenseReportPdf')
      await generateExpenseReportPdf(projectName, projectReceipts, companySettings?.logo_url)
    } catch {
      // silently fail — PDF download will just not trigger
    } finally {
      setDownloadingProject(null)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Expenses &amp; Receipts</h1>
        {canCreate('receipts') && (
          <button
            onClick={() => setShowModal(true)}
            disabled={projects.length === 0}
            title={projects.length === 0 ? 'Create a project first' : undefined}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New
          </button>
        )}
      </div>

      {/* Search & Sort Controls */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendor, project, category..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <div className="relative">
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as SortOption)}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ReceiptIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">
            {searchQuery.trim() || filterProject
              ? 'No expenses match your filters'
              : 'No expenses yet'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {searchQuery.trim() || filterProject
              ? 'Try a different search or filter.'
              : projects.length > 0
                ? 'Click "+ New" to add the first one.'
                : 'Create a project first, then add expenses.'}
          </p>
        </div>
      ) : (
        <div>
          {/* In Progress section */}
          {inProgressGroups.length > 0 && (
            <>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">In Progress</p>
              <div className="space-y-8">
                {inProgressGroups.map((project) => (
                  <div key={project.projectId}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold text-gray-900">{project.projectName}</h2>
                        <button
                          onClick={() => handleDownloadReport(project.projectId, project.projectName)}
                          disabled={downloadingProject === project.projectId}
                          className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50 transition"
                        >
                          {downloadingProject === project.projectId ? (
                            <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <DownloadIcon className="w-3.5 h-3.5" />
                          )}
                          PDF
                        </button>
                      </div>
                      <span className="text-sm text-gray-500 tabular-nums">
                        ${project.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({project.receiptCount} expense{project.receiptCount !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="space-y-4">
                      {project.dates.map(({ date, receipts }) => (
                        <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                            <span className="text-sm font-semibold text-gray-800">{project.projectName}</span>
                            <span className="text-sm text-gray-400">&middot;</span>
                            <span className="text-sm text-gray-600">{formatGroupDate(date)}</span>
                            <span className="text-xs text-gray-400">
                              ({receipts.length} expense{receipts.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {receipts.map((receipt) => (
                              <ReceiptCard key={receipt.id} receipt={receipt} role={role} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Completed section — collapsible */}
          {completedGroups.length > 0 && (
            <div className={inProgressGroups.length > 0 ? 'border-t border-gray-200 mt-8 pt-4' : ''}>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 w-full text-left mb-4"
              >
                <ChevronRightIcon
                  className={`w-3.5 h-3.5 text-amber-500 transition-transform duration-200 ${showCompleted ? 'rotate-90' : ''}`}
                />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Completed</span>
                <span className="text-xs text-gray-400">({completedGroups.length})</span>
              </button>
              {showCompleted && (
                <div className="space-y-8">
                  {completedGroups.map((project) => (
                    <div key={project.projectId}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-lg font-bold text-gray-900">{project.projectName}</h2>
                          <button
                            onClick={() => handleDownloadReport(project.projectId, project.projectName)}
                            disabled={downloadingProject === project.projectId}
                            className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50 transition"
                          >
                            {downloadingProject === project.projectId ? (
                              <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <DownloadIcon className="w-3.5 h-3.5" />
                            )}
                            PDF
                          </button>
                        </div>
                        <span className="text-sm text-gray-500 tabular-nums">
                          ${project.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({project.receiptCount} expense{project.receiptCount !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="space-y-4">
                        {project.dates.map(({ date, receipts }) => (
                          <div key={date} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                              <span className="text-sm font-semibold text-gray-800">{project.projectName}</span>
                              <span className="text-sm text-gray-400">&middot;</span>
                              <span className="text-sm text-gray-600">{formatGroupDate(date)}</span>
                              <span className="text-xs text-gray-400">
                                ({receipts.length} expense{receipts.length !== 1 ? 's' : ''})
                              </span>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {receipts.map((receipt) => (
                                <ReceiptCard key={receipt.id} receipt={receipt} role={role} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <NewReceiptModal
          projects={projects}
          userId={userId}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
