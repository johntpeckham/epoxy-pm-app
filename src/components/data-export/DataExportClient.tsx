'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
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

export default function DataExportClient() {
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()

  // Projects state
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [showActive, setShowActive] = useState(true)
  const [showComplete, setShowComplete] = useState(true)
  const [showClosed, setShowClosed] = useState(true)
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
      if (p.status === 'Active' && !showActive) return false
      if (p.status === 'Completed' && !showComplete) return false
      if (p.status === 'Closed' && !showClosed) return false
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
  }, [allProjects, showActive, showComplete, showClosed, startDate, endDate, searchQuery])

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
        const { data, error: queryError } = await query.order('created_at', { ascending: true })
        if (queryError) {
          console.error(`[DataExport] Query error fetching ${postType} for project ${projectId}:`, queryError.message)
        }
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
        const { data, error: queryError } = await query.order('created_at', { ascending: true })
        if (queryError) {
          console.error(`[DataExport] Query error fetching ${postTypes.join(',')} for project ${projectId}:`, queryError.message)
        }
        return (data || []) as FeedPost[]
      }

      // Build project lookup
      const projectMap = new Map<string, Project>()
      for (const p of allProjects) {
        projectMap.set(p.id, p)
      }

      console.log(`[DataExport] Starting export for ${projectIds.length} projects:`, projectIds)

      // Process each selected project
      for (let pi = 0; pi < projectIds.length; pi++) {
        const projectId = projectIds[pi]
        const project = projectMap.get(projectId)
        const projectName = project?.name || 'Unknown'
        const projectFolderName = safeName(projectName)

        console.log(`[DataExport] Processing project ${pi + 1}/${projectIds.length}: "${projectName}" (${projectId})`)

        // Always create the project folder so it appears in the ZIP even if empty
        const projectFolder = zip.folder(projectFolderName)!
        let projectFileCount = 0

        try {
          // ─── Daily Reports ──────────────────────────────────────────
          if (options.includeDaily) {
            setProgress({ step: `Generating Daily Reports (${projectName})...`, current: pi + 1, total: projectIds.length })
            const dailyPosts = await fetchPostsForProject(projectId, 'daily_report')
            console.log(`[DataExport]   Daily Reports: ${dailyPosts.length} found`)

            if (dailyPosts.length > 0) {
              const folder = projectFolder.folder('Daily_Reports')!
              for (const post of dailyPosts) {
                const content = post.content as DailyReportContent
                const photoUrls = (content.photos || []).map(getPhotoUrl)
                const date = content.date || post.created_at.split('T')[0]
                try {
                  const buf = await generateDailyReportPdfBuffer(content, photoUrls, logoData, post.dynamic_fields)
                  folder.file(`DailyReport_${formatDateForFilename(date)}.pdf`, buf)
                  projectFileCount++
                } catch (pdfErr) {
                  console.error(`[DataExport]   Failed to generate daily report PDF for ${date}:`, pdfErr)
                }
              }
            }
          }

          // ─── Timesheets ─────────────────────────────────────────────
          if (options.includeTimesheets) {
            setProgress({ step: `Generating Timesheets (${projectName})...`, current: pi + 1, total: projectIds.length })
            const timecardPosts = await fetchPostsForProject(projectId, 'timecard')
            console.log(`[DataExport]   Timesheets: ${timecardPosts.length} found`)

            if (timecardPosts.length > 0) {
              const folder = projectFolder.folder('Timesheets')!
              for (const post of timecardPosts) {
                const content = post.content as TimecardContent
                const date = content.date || post.created_at.split('T')[0]
                const empName = content.entries.length > 0 ? content.entries[0].employee_name : 'Team'
                try {
                  const buf = await generateTimecardPdfBuffer(content, logoData, post.dynamic_fields)
                  folder.file(`Timesheet_${formatDateForFilename(date)}_${safeName(empName)}.pdf`, buf)
                  projectFileCount++
                } catch (pdfErr) {
                  console.error(`[DataExport]   Failed to generate timesheet PDF for ${date}:`, pdfErr)
                }
              }
            }
          }

          // ─── Expenses & Receipts ────────────────────────────────────
          if (options.includeExpenses) {
            setProgress({ step: `Generating Expenses (${projectName})...`, current: pi + 1, total: projectIds.length })
            const expensePosts = await fetchPostsByTypesForProject(projectId, ['receipt', 'expense'])
            console.log(`[DataExport]   Expenses: ${expensePosts.length} found`)

            if (expensePosts.length > 0) {
              const folder = projectFolder.folder('Expenses')!
              for (let i = 0; i < expensePosts.length; i++) {
                const post = expensePosts[i]
                if (post.post_type === 'receipt') {
                  const content = post.content as ReceiptContent
                  const date = content.receipt_date || post.created_at.split('T')[0]
                  const photoUrl = content.receipt_photo ? getPhotoUrl(content.receipt_photo) : null
                  try {
                    const buf = await generateExpensePdfBuffer(content, photoUrl, logoData, post.dynamic_fields)
                    folder.file(`Expense_${formatDateForFilename(date)}_${i}.pdf`, buf)
                    projectFileCount++
                  } catch (pdfErr) {
                    console.error(`[DataExport]   Failed to generate expense PDF for ${date}:`, pdfErr)
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
                    projectFileCount++
                  } catch (pdfErr) {
                    console.error(`[DataExport]   Failed to generate expense PDF for ${date}:`, pdfErr)
                  }
                }
              }
            }
          }

          // ─── JSA Reports ────────────────────────────────────────────
          if (options.includeJsa) {
            setProgress({ step: `Generating JSA Reports (${projectName})...`, current: pi + 1, total: projectIds.length })
            const jsaPosts = await fetchPostsForProject(projectId, 'jsa_report')
            console.log(`[DataExport]   JSA Reports: ${jsaPosts.length} found`)

            if (jsaPosts.length > 0) {
              const folder = projectFolder.folder('JSA_Reports')!
              for (const post of jsaPosts) {
                const content = post.content as JsaReportContent
                const date = content.date || post.created_at.split('T')[0]
                try {
                  const buf = await generateJsaPdfBuffer(content, logoData, post.dynamic_fields)
                  folder.file(`JSA_${formatDateForFilename(date)}.pdf`, buf)
                  projectFileCount++
                } catch (pdfErr) {
                  console.error(`[DataExport]   Failed to generate JSA PDF for ${date}:`, pdfErr)
                }
              }
            }
          }

          // ─── Job Feed Posts ─────────────────────────────────────────
          if (options.includeFeed) {
            setProgress({ step: `Generating Feed (${projectName})...`, current: pi + 1, total: projectIds.length })
            const feedPosts = await fetchPostsByTypesForProject(projectId, ['text', 'photo', 'daily_report', 'task', 'pdf', 'jsa_report', 'receipt', 'expense', 'timecard'])
            console.log(`[DataExport]   Feed Posts: ${feedPosts.length} found`)

            if (feedPosts.length > 0) {
              const folder = projectFolder.folder('Job_Feed')!
              try {
                const buf = await generateFeedPdfBuffer(projectName, feedPosts, getPhotoUrl, logoData)
                folder.file('Feed_Posts.pdf', buf)
                projectFileCount++
              } catch (pdfErr) {
                console.error(`[DataExport]   Failed to generate feed PDF:`, pdfErr)
              }
            }
          }

          // ─── Photos ─────────────────────────────────────────────────
          if (options.includePhotos) {
            setProgress({ step: `Downloading Photos (${projectName})...`, current: pi + 1, total: projectIds.length })
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

            console.log(`[DataExport]   Photos: ${photoEntries.length} found`)

            if (photoEntries.length > 0) {
              const folder = projectFolder.folder('Photos')!
              for (let i = 0; i < photoEntries.length; i++) {
                const entry = photoEntries[i]
                try {
                  const res = await fetch(entry.url)
                  if (!res.ok) {
                    console.warn(`[DataExport]   Photo fetch failed (${res.status}): ${entry.url}`)
                    continue
                  }
                  const blob = await res.blob()
                  const ext = blob.type.includes('png') ? 'png' : 'jpg'
                  folder.file(`Photo_${formatDateForFilename(entry.date)}_${String(i + 1).padStart(3, '0')}.${ext}`, blob)
                  projectFileCount++
                } catch (fetchErr) {
                  console.error(`[DataExport]   Failed to download photo:`, fetchErr)
                }
              }
            }
          }

          // ─── Plans ──────────────────────────────────────────────────
          if (options.includePlans) {
            setProgress({ step: `Downloading Plans (${projectName})...`, current: pi + 1, total: projectIds.length })

            const { data: docs, error: docsError } = await supabase
              .from('project_documents')
              .select('*')
              .eq('project_id', projectId)
              .order('created_at', { ascending: true })

            if (docsError) {
              console.error(`[DataExport]   Plans query error for project ${projectId}:`, docsError.message)
            }

            const planDocs = ((docs || []) as ProjectDocument[])
            console.log(`[DataExport]   Plans: ${planDocs.length} found`)

            if (planDocs.length > 0) {
              const folder = projectFolder.folder('Plans')!
              for (const doc of planDocs) {
                try {
                  const bucket = doc.bucket || 'project-plans'
                  const filePath = doc.file_path
                  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath)
                  const res = await fetch(urlData.publicUrl)
                  if (!res.ok) {
                    console.warn(`[DataExport]   Plan download failed (${res.status}): ${doc.file_name}`)
                    continue
                  }
                  const blob = await res.blob()
                  folder.file(doc.file_name, blob)
                  projectFileCount++
                } catch (fetchErr) {
                  console.error(`[DataExport]   Failed to download plan "${doc.file_name}":`, fetchErr)
                }
              }
            }
          }

          // ─── Project Report ─────────────────────────────────────────
          if (options.includeProjectReport) {
            setProgress({ step: `Generating Project Report (${projectName})...`, current: pi + 1, total: projectIds.length })

            const { data: reportData, error: reportError } = await supabase
              .from('project_reports')
              .select('*')
              .eq('project_id', projectId)
              .maybeSingle()

            if (reportError) {
              console.error(`[DataExport]   Project report query error for project ${projectId}:`, reportError.message)
            }

            console.log(`[DataExport]   Project Report: ${reportData?.data ? 'found' : 'none'}`)

            if (reportData?.data) {
              const folder = projectFolder.folder('Project_Report')!
              try {
                const buf = await generateProjectReportPdfBuffer(
                  projectName,
                  reportData.data as ProjectReportData,
                  logoData
                )
                folder.file('Project_Report.pdf', buf)
                projectFileCount++
              } catch (pdfErr) {
                console.error(`[DataExport]   Failed to generate project report PDF:`, pdfErr)
              }
            }
          }
        } catch (projectErr) {
          console.error(`[DataExport] Unexpected error processing project "${projectName}" (${projectId}):`, projectErr)
        }

        console.log(`[DataExport] Finished project "${projectName}": ${projectFileCount} files added`)
      }

      // ─── Build ZIP ──────────────────────────────────────────────
      setProgress({ step: 'Building ZIP file...', current: 0, total: 0 })

      const zipEntries = Object.keys(zip.files)
      const zipFiles = zipEntries.filter((k) => !zip.files[k].dir)
      const zipDirs = zipEntries.filter((k) => zip.files[k].dir)
      console.log(`[DataExport] ZIP contents: ${zipFiles.length} files, ${zipDirs.length} folders`)
      console.log(`[DataExport] ZIP folders:`, zipDirs)
      console.log(`[DataExport] ZIP files:`, zipFiles)

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
  }, [startDate, endDate, selectedProjectIds, includeDaily, includeTimesheets, includeExpenses, includeJsa, includeFeed, includePhotos, includePlans, includeProjectReport, allProjects, companySettings])

  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white'

  const dataTypeCheckboxes: { label: string; checked: boolean; onChange: (v: boolean) => void }[] = [
    { label: 'Daily Reports', checked: includeDaily, onChange: setIncludeDaily },
    { label: 'Timesheets', checked: includeTimesheets, onChange: setIncludeTimesheets },
    { label: 'Expenses & Receipts', checked: includeExpenses, onChange: setIncludeExpenses },
    { label: 'JSA Reports', checked: includeJsa, onChange: setIncludeJsa },
    { label: 'Job Feed Posts', checked: includeFeed, onChange: setIncludeFeed },
    { label: 'Photos', checked: includePhotos, onChange: setIncludePhotos },
    { label: 'Plans', checked: includePlans, onChange: setIncludePlans },
    { label: 'Project Report', checked: includeProjectReport, onChange: setIncludeProjectReport },
  ]

  const anyDataTypeChecked = dataTypeCheckboxes.some((cb) => cb.checked)
  const selectedVisibleCount = filteredProjects.filter((p) => selectedProjectIds.has(p.id)).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/profile" className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
          <DownloadIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">Data Export</h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Unified Projects Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Projects</h2>

          {/* Status Checkboxes */}
          <div className="flex items-center gap-6 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showActive}
                onChange={(e) => {
                  if (!e.target.checked && !showComplete && !showClosed) return
                  setShowActive(e.target.checked)
                }}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <span className="text-sm font-medium text-gray-700">Ongoing</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showComplete}
                onChange={(e) => {
                  if (!e.target.checked && !showActive && !showClosed) return
                  setShowComplete(e.target.checked)
                }}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <span className="text-sm font-medium text-gray-700">Completed</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(e) => {
                  if (!e.target.checked && !showActive && !showComplete) return
                  setShowClosed(e.target.checked)
                }}
                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <span className="text-sm font-medium text-gray-700">Closed</span>
            </label>
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
              className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 focus:border-amber-500"
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
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20 focus:border-amber-500"
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
