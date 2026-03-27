'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCompanySettings } from '@/lib/useCompanySettings'
import {
  ArrowLeftIcon,
  DownloadIcon,
  Loader2Icon,
  SearchIcon,
} from 'lucide-react'
import JSZip from 'jszip'
import {
  ExportOptions,
  ExportProgress,
  generateDailyReportPdfBuffer,
  generateTimecardPdfBuffer,
  generateExpensePdfBuffer,
  generateJsaPdfBuffer,
  generateFeedPdfBuffer,
  generateCalendarSummaryPdfBuffer,
  generateProjectReportPdfBuffer,
} from '@/lib/generateDataExport'
import {
  Project,
  FeedPost,
  ProjectDocument,
  ProjectReportData,
  DailyReportContent,
  TimecardContent,
  ReceiptContent,
  JsaReportContent,
} from '@/types'

function safeName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_')
}

function formatDateForFilename(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

async function loadLogoData(
  logoUrl: string | null | undefined
): Promise<{ data: string; format: 'JPEG' | 'PNG'; width: number; height: number } | null> {
  if (!logoUrl) return null
  try {
    const res = await fetch(logoUrl)
    const blob = await res.blob()
    const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG'
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const img = document.createElement('img')
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = data
    })
    return { data, format, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return null
  }
}

type StatusFilter = 'Active' | 'Complete'

export default function DataExportClient() {
  const router = useRouter()
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()

  // Projects state
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Active')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())

  // Data type checkboxes
  const [includeDaily, setIncludeDaily] = useState(true)
  const [includeTimesheets, setIncludeTimesheets] = useState(true)
  const [includeExpenses, setIncludeExpenses] = useState(true)
  const [includeJsa, setIncludeJsa] = useState(true)
  const [includeFeed, setIncludeFeed] = useState(true)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [includeCalendar, setIncludeCalendar] = useState(true)
  const [includePlans, setIncludePlans] = useState(true)
  const [includeProjectReport, setIncludeProjectReport] = useState(true)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load all projects once
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })
      if (data) setAllProjects(data as Project[])
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Filtered project list based on status, date range, and search
  const filteredProjects = useMemo(() => {
    return allProjects.filter((p) => {
      if (p.status !== statusFilter) return false
      if (startDate && endDate) {
        if (p.start_date || p.end_date) {
          const pStart = p.start_date || '1900-01-01'
          const pEnd = p.end_date || '2099-12-31'
          if (!(pStart <= endDate && pEnd >= startDate)) return false
        }
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const nameMatch = p.name.toLowerCase().includes(q)
        const clientMatch = p.client_name?.toLowerCase().includes(q) || false
        if (!nameMatch && !clientMatch) return false
      }
      return true
    })
  }, [allProjects, statusFilter, startDate, endDate, searchQuery])

  useEffect(() => {
    setSelectedProjectIds(new Set())
  }, [statusFilter])

  const allVisibleSelected = filteredProjects.length > 0 && filteredProjects.every((p) => selectedProjectIds.has(p.id))

  function handleSelectAll() {
    if (allVisibleSelected) {
      const next = new Set(selectedProjectIds)
      for (const p of filteredProjects) next.delete(p.id)
      setSelectedProjectIds(next)
    } else {
      const next = new Set(selectedProjectIds)
      for (const p of filteredProjects) next.add(p.id)
      setSelectedProjectIds(next)
    }
  }

  function toggleProject(id: string) {
    const next = new Set(selectedProjectIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedProjectIds(next)
  }

  function getPhotoUrl(path: string): string {
    const { data } = supabase.storage.from('post-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const handleExport = useCallback(async () => {
    if (selectedProjectIds.size === 0) {
      setError('Please select at least one project.')
      return
    }

    setExporting(true)
    setError(null)
    setProgress({ step: 'Preparing...', current: 0, total: 0 })

    try {
      const zip = new JSZip()
      const projectIds = Array.from(selectedProjectIds)
      const options: ExportOptions = {
        startDate,
        endDate,
        projectIds,
        includeDaily,
        includeTimesheets,
        includeExpenses,
        includeJsa,
        includeFeed,
        includePhotos,
        includeCalendar,
        includePlans,
        includeProjectReport,
      }

      const logoData = await loadLogoData(companySettings?.logo_url)

      const hasDateRange = !!(options.startDate && options.endDate)
      const dateFilterStart = options.startDate
      const dateFilterEnd = options.endDate + 'T23:59:59'

      // Helper to fetch feed posts by type for a single project
      async function fetchPostsForProject(projectId: string, postType: string): Promise<FeedPost[]> {
        let query = supabase
          .from('feed_posts')
          .select('*')
          .eq('post_type', postType)
          .eq('project_id', projectId)
        if (hasDateRange) {
          query = query.gte('created_at', dateFilterStart).lte('created_at', dateFilterEnd)
        }
        const { data } = await query.order('created_at', { ascending: true })
        return (data || []) as FeedPost[]
      }

      // Helper to fetch feed posts by multiple types for a single project
      async function fetchPostsByTypesForProject(projectId: string, postTypes: string[]): Promise<FeedPost[]> {
        let query = supabase
          .from('feed_posts')
          .select('*')
          .in('post_type', postTypes)
          .eq('project_id', projectId)
        if (hasDateRange) {
          query = query.gte('created_at', dateFilterStart).lte('created_at', dateFilterEnd)
        }
        const { data } = await query.order('created_at', { ascending: true })
        return (data || []) as FeedPost[]
      }

      // Build project lookup
      const projectMap = new Map<string, Project>()
      for (const p of allProjects) {
        projectMap.set(p.id, p)
      }

      // Process each selected project
      for (let pi = 0; pi < projectIds.length; pi++) {
        const projectId = projectIds[pi]
        const project = projectMap.get(projectId)
        const projectName = project?.name || 'Unknown'
        const projectFolderName = safeName(projectName)
        const projectFolder = zip.folder(projectFolderName)!

        // ─── Daily Reports ──────────────────────────────────────────
        if (options.includeDaily) {
          const dailyPosts = await fetchPostsForProject(projectId, 'daily_report')
          if (dailyPosts.length > 0) {
            const folder = projectFolder.folder('Daily_Reports')!
            setProgress({ step: `Generating Daily Reports (${projectName})...`, current: pi + 1, total: projectIds.length })

            for (const post of dailyPosts) {
              const content = post.content as DailyReportContent
              const photoUrls = (content.photos || []).map(getPhotoUrl)
              const date = content.date || post.created_at.split('T')[0]
              try {
                const buf = await generateDailyReportPdfBuffer(content, photoUrls, logoData, post.dynamic_fields)
                folder.file(`DailyReport_${formatDateForFilename(date)}.pdf`, buf)
              } catch {
                // skip failed PDF
              }
            }
          }
        }

        // ─── Timesheets ─────────────────────────────────────────────
        if (options.includeTimesheets) {
          const timecardPosts = await fetchPostsForProject(projectId, 'timecard')
          if (timecardPosts.length > 0) {
            const folder = projectFolder.folder('Timesheets')!
            setProgress({ step: `Generating Timesheets (${projectName})...`, current: pi + 1, total: projectIds.length })

            for (const post of timecardPosts) {
              const content = post.content as TimecardContent
              const date = content.date || post.created_at.split('T')[0]
              const empName = content.entries.length > 0 ? content.entries[0].employee_name : 'Team'
              try {
                const buf = await generateTimecardPdfBuffer(content, logoData, post.dynamic_fields)
                folder.file(`Timesheet_${formatDateForFilename(date)}_${safeName(empName)}.pdf`, buf)
              } catch {
                // skip failed PDF
              }
            }
          }
        }

        // ─── Expenses & Receipts ────────────────────────────────────
        if (options.includeExpenses) {
          const expensePosts = await fetchPostsByTypesForProject(projectId, ['receipt', 'expense'])
          if (expensePosts.length > 0) {
            const folder = projectFolder.folder('Expenses')!
            setProgress({ step: `Generating Expenses (${projectName})...`, current: pi + 1, total: projectIds.length })

            for (let i = 0; i < expensePosts.length; i++) {
              const post = expensePosts[i]
              if (post.post_type === 'receipt') {
                const content = post.content as ReceiptContent
                const date = content.receipt_date || post.created_at.split('T')[0]
                const photoUrl = content.receipt_photo ? getPhotoUrl(content.receipt_photo) : null
                try {
                  const buf = await generateExpensePdfBuffer(content, photoUrl, logoData, post.dynamic_fields)
                  folder.file(`Expense_${formatDateForFilename(date)}_${i}.pdf`, buf)
                } catch {
                  // skip
                }
              } else {
                const content = post.content as { description: string; amount: number; category: string; date: string; notes: string; attachment: string }
                const date = content.date || post.created_at.split('T')[0]
                const receiptContent: ReceiptContent = {
                  receipt_photo: content.attachment || '',
                  vendor_name: content.description || '—',
                  receipt_date: content.date,
                  total_amount: content.amount || 0,
                  category: (content.category as ReceiptContent['category']) || '',
                }
                const photoUrl = content.attachment ? getPhotoUrl(content.attachment) : null
                try {
                  const buf = await generateExpensePdfBuffer(receiptContent, photoUrl, logoData, post.dynamic_fields)
                  folder.file(`Expense_${formatDateForFilename(date)}_${i}.pdf`, buf)
                } catch {
                  // skip
                }
              }
            }
          }
        }

        // ─── JSA Reports ────────────────────────────────────────────
        if (options.includeJsa) {
          const jsaPosts = await fetchPostsForProject(projectId, 'jsa_report')
          if (jsaPosts.length > 0) {
            const folder = projectFolder.folder('JSA_Reports')!
            setProgress({ step: `Generating JSA Reports (${projectName})...`, current: pi + 1, total: projectIds.length })

            for (const post of jsaPosts) {
              const content = post.content as JsaReportContent
              const date = content.date || post.created_at.split('T')[0]
              try {
                const buf = await generateJsaPdfBuffer(content, logoData, post.dynamic_fields)
                folder.file(`JSA_${formatDateForFilename(date)}.pdf`, buf)
              } catch {
                // skip
              }
            }
          }
        }

        // ─── Job Feed Posts ─────────────────────────────────────────
        if (options.includeFeed) {
          const feedPosts = await fetchPostsByTypesForProject(projectId, ['text', 'photo', 'daily_report', 'task', 'pdf', 'jsa_report', 'receipt', 'expense', 'timecard'])
          if (feedPosts.length > 0) {
            const folder = projectFolder.folder('Job_Feed')!
            setProgress({ step: `Generating Feed (${projectName})...`, current: pi + 1, total: projectIds.length })

            try {
              const buf = await generateFeedPdfBuffer(projectName, feedPosts, getPhotoUrl, logoData)
              folder.file('Feed_Posts.pdf', buf)
            } catch {
              // skip
            }
          }
        }

        // ─── Photos ─────────────────────────────────────────────────
        if (options.includePhotos) {
          const photoPosts = await fetchPostsByTypesForProject(projectId, ['photo', 'daily_report', 'receipt', 'expense'])
          const photoEntries: { url: string; date: string }[] = []

          for (const post of photoPosts) {
            const content = post.content as unknown as Record<string, unknown>
            const date = post.created_at.split('T')[0]
            if ('photos' in content && Array.isArray(content.photos)) {
              for (const path of content.photos) {
                photoEntries.push({ url: getPhotoUrl(path as string), date })
              }
            }
            if ('receipt_photo' in content && content.receipt_photo) {
              photoEntries.push({ url: getPhotoUrl(content.receipt_photo as string), date })
            }
            if ('attachment' in content && content.attachment) {
              photoEntries.push({ url: getPhotoUrl(content.attachment as string), date })
            }
          }

          if (photoEntries.length > 0) {
            const folder = projectFolder.folder('Photos')!
            setProgress({ step: `Downloading Photos (${projectName})...`, current: pi + 1, total: projectIds.length })

            for (let i = 0; i < photoEntries.length; i++) {
              const entry = photoEntries[i]
              try {
                const res = await fetch(entry.url)
                if (!res.ok) continue
                const blob = await res.blob()
                const ext = blob.type.includes('png') ? 'png' : 'jpg'
                folder.file(`Photo_${formatDateForFilename(entry.date)}_${String(i + 1).padStart(3, '0')}.${ext}`, blob)
              } catch {
                // skip
              }
            }
          }
        }

        // ─── Plans ──────────────────────────────────────────────────
        if (options.includePlans) {
          setProgress({ step: `Downloading Plans (${projectName})...`, current: pi + 1, total: projectIds.length })

          const { data: docs } = await supabase
            .from('project_documents')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true })

          const planDocs = ((docs || []) as ProjectDocument[])

          if (planDocs.length > 0) {
            const folder = projectFolder.folder('Plans')!
            for (const doc of planDocs) {
              try {
                const bucket = doc.bucket || 'project-plans'
                const filePath = doc.file_path
                const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)
                const res = await fetch(urlData.publicUrl)
                if (!res.ok) continue
                const blob = await res.blob()
                folder.file(doc.file_name, blob)
              } catch {
                // skip failed downloads
              }
            }
          }
        }

        // ─── Project Report ─────────────────────────────────────────
        if (options.includeProjectReport) {
          setProgress({ step: `Generating Project Reports (${projectName})...`, current: pi + 1, total: projectIds.length })

          const { data: reportData } = await supabase
            .from('project_reports')
            .select('*')
            .eq('project_id', projectId)
            .maybeSingle()

          if (reportData?.data) {
            const folder = projectFolder.folder('Project_Report')!
            try {
              const buf = await generateProjectReportPdfBuffer(
                projectName,
                reportData.data as ProjectReportData,
                logoData
              )
              folder.file(`ProjectReport_${safeName(projectName)}.pdf`, buf)
            } catch {
              // skip
            }
          }
        }
      }

      // ─── Calendar / Jobs (root level) ───────────────────────────
      if (options.includeCalendar) {
        setProgress({ step: 'Generating Jobs Summary...', current: 0, total: 1 })

        const selectedProjects = allProjects.filter((p) => projectIds.includes(p.id))
        const filteredCalProjects = hasDateRange
          ? selectedProjects.filter((p) => {
              if (!p.start_date && !p.end_date) return true
              const pStart = p.start_date || '1900-01-01'
              const pEnd = p.end_date || '2099-12-31'
              return pStart <= options.endDate && pEnd >= options.startDate
            })
          : selectedProjects

        if (filteredCalProjects.length > 0) {
          const folder = zip.folder('Calendar')!
          const calStart = options.startDate || 'All'
          const calEnd = options.endDate || 'Data'
          try {
            const buf = await generateCalendarSummaryPdfBuffer(calStart, calEnd, filteredCalProjects, logoData)
            const calFilename = hasDateRange
              ? `Jobs_Summary_${formatDateForFilename(options.startDate)}_to_${formatDateForFilename(options.endDate)}.pdf`
              : 'Jobs_Summary_All.pdf'
            folder.file(calFilename, buf)
          } catch {
            // skip
          }
        }

        setProgress({ step: 'Generating Jobs Summary...', current: 1, total: 1 })
      }

      // ─── Build ZIP ──────────────────────────────────────────────
      setProgress({ step: 'Building ZIP file...', current: 0, total: 0 })

      const zipEntries = Object.keys(zip.files)
      if (zipEntries.filter((k) => !zip.files[k].dir).length === 0) {
        setError('No data found for the selected projects and filters.')
        setExporting(false)
        setProgress(null)
        return
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date().toISOString().split('T')[0]
      a.download = hasDateRange
        ? `Export_${formatDateForFilename(options.startDate)}_to_${formatDateForFilename(options.endDate)}.zip`
        : `Export_All_Data_${formatDateForFilename(today)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setProgress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedProjectIds, includeDaily, includeTimesheets, includeExpenses, includeJsa, includeFeed, includePhotos, includeCalendar, includePlans, includeProjectReport, allProjects, companySettings])

  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'

  const dataTypeCheckboxes: { label: string; checked: boolean; onChange: (v: boolean) => void }[] = [
    { label: 'Daily Reports', checked: includeDaily, onChange: setIncludeDaily },
    { label: 'Timesheets', checked: includeTimesheets, onChange: setIncludeTimesheets },
    { label: 'Expenses & Receipts', checked: includeExpenses, onChange: setIncludeExpenses },
    { label: 'JSA Reports', checked: includeJsa, onChange: setIncludeJsa },
    { label: 'Job Feed Posts', checked: includeFeed, onChange: setIncludeFeed },
    { label: 'Photos', checked: includePhotos, onChange: setIncludePhotos },
    { label: 'Calendar / Jobs', checked: includeCalendar, onChange: setIncludeCalendar },
    { label: 'Plans', checked: includePlans, onChange: setIncludePlans },
    { label: 'Project Report', checked: includeProjectReport, onChange: setIncludeProjectReport },
  ]

  const anyDataTypeChecked = dataTypeCheckboxes.some((cb) => cb.checked)
  const selectedVisibleCount = filteredProjects.filter((p) => selectedProjectIds.has(p.id)).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/profile')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex-1">Data Export</h1>
        </div>

        {/* Unified Projects Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Projects</h2>

          {/* Status Toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
            <button
              onClick={() => setStatusFilter('Active')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition ${
                statusFilter === 'Active'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Ongoing
            </button>
            <button
              onClick={() => setStatusFilter('Complete')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition border-l border-gray-200 ${
                statusFilter === 'Complete'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Completed
            </button>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${inputCls} pl-9`}
            />
          </div>

          {/* Select All */}
          <label className="flex items-center gap-3 cursor-pointer py-2 border-b border-gray-100 mb-1">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={handleSelectAll}
              disabled={filteredProjects.length === 0}
              className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Select All
              {filteredProjects.length > 0 && (
                <span className="text-gray-400 font-normal ml-1">
                  ({selectedVisibleCount}/{filteredProjects.length})
                </span>
              )}
            </span>
          </label>

          {/* Project List */}
          <div className="max-h-[300px] overflow-y-auto">
            {filteredProjects.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No projects match the current filters.</p>
            ) : (
              filteredProjects.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 cursor-pointer py-2 hover:bg-gray-50 rounded-lg px-1 transition"
                >
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.has(p.id)}
                    onChange={() => toggleProject(p.id)}
                    className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-sm text-gray-900 block truncate">{p.name}</span>
                    {p.client_name && (
                      <span className="text-xs text-gray-400 block truncate">{p.client_name}</span>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Data Types */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Data Types</h2>
          <div className="space-y-3">
            {dataTypeCheckboxes.map((cb) => (
              <label key={cb.label} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cb.checked}
                  onChange={(e) => cb.onChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-gray-700">{cb.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Export Button & Progress */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {progress && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Loader2Icon className="w-4 h-4 text-amber-500 animate-spin" />
                <span className="text-sm text-gray-600">{progress.step}</span>
              </div>
              {progress.total > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  />
                </div>
              )}
              {progress.total > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {progress.current} / {progress.total}
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={exporting || selectedProjectIds.size === 0 || !anyDataTypeChecked}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition w-full justify-center"
          >
            {exporting ? (
              <>
                <Loader2Icon className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <DownloadIcon className="w-4 h-4" />
                Export Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
