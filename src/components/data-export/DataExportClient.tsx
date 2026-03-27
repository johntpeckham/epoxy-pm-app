'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCompanySettings } from '@/lib/useCompanySettings'
import {
  ArrowLeftIcon,
  DownloadIcon,
  Loader2Icon,
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
} from '@/lib/generateDataExport'
import {
  Project,
  FeedPost,
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
  const router = useRouter()
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()

  // Date range
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Project filter
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  // Data type checkboxes
  const [includeDaily, setIncludeDaily] = useState(true)
  const [includeTimesheets, setIncludeTimesheets] = useState(true)
  const [includeExpenses, setIncludeExpenses] = useState(true)
  const [includeJsa, setIncludeJsa] = useState(true)
  const [includeFeed, setIncludeFeed] = useState(true)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [includeCalendar, setIncludeCalendar] = useState(true)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load projects
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })
      if (data) setProjects(data as Project[])
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getPhotoUrl(path: string): string {
    const { data } = supabase.storage.from('post-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const handleExport = useCallback(async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates.')
      return
    }

    setExporting(true)
    setError(null)
    setProgress({ step: 'Preparing...', current: 0, total: 0 })

    try {
      const zip = new JSZip()
      const options: ExportOptions = {
        startDate,
        endDate,
        projectId: selectedProjectId || null,
        includeDaily,
        includeTimesheets,
        includeExpenses,
        includeJsa,
        includeFeed,
        includePhotos,
        includeCalendar,
      }

      // Load logo once
      const logoData = await loadLogoData(companySettings?.logo_url)

      // Build base query filter
      const dateFilterStart = options.startDate
      const dateFilterEnd = options.endDate + 'T23:59:59'

      // Helper to fetch feed posts by type
      async function fetchPosts(postType: string): Promise<FeedPost[]> {
        let query = supabase
          .from('feed_posts')
          .select('*')
          .eq('post_type', postType)
          .gte('created_at', dateFilterStart)
          .lte('created_at', dateFilterEnd)
          .order('created_at', { ascending: true })

        if (options.projectId) {
          query = query.eq('project_id', options.projectId)
        }

        const { data } = await query
        return (data || []) as FeedPost[]
      }

      // Helper to fetch feed posts by multiple types
      async function fetchPostsByTypes(postTypes: string[]): Promise<FeedPost[]> {
        let query = supabase
          .from('feed_posts')
          .select('*')
          .in('post_type', postTypes)
          .gte('created_at', dateFilterStart)
          .lte('created_at', dateFilterEnd)
          .order('created_at', { ascending: true })

        if (options.projectId) {
          query = query.eq('project_id', options.projectId)
        }

        const { data } = await query
        return (data || []) as FeedPost[]
      }

      // Build a project name lookup
      const projectMap = new Map<string, string>()
      for (const p of projects) {
        projectMap.set(p.id, p.name)
      }

      // ─── Daily Reports ──────────────────────────────────────────────
      if (options.includeDaily) {
        const dailyPosts = await fetchPosts('daily_report')
        if (dailyPosts.length > 0) {
          const folder = zip.folder('Daily_Reports')!
          setProgress({ step: 'Generating Daily Reports...', current: 0, total: dailyPosts.length })

          for (let i = 0; i < dailyPosts.length; i++) {
            setProgress({ step: 'Generating Daily Reports...', current: i + 1, total: dailyPosts.length })
            const post = dailyPosts[i]
            const content = post.content as DailyReportContent
            const photoUrls = (content.photos || []).map(getPhotoUrl)
            const projectName = content.project_name || projectMap.get(post.project_id) || 'Unknown'
            const date = content.date || post.created_at.split('T')[0]

            try {
              const buf = await generateDailyReportPdfBuffer(content, photoUrls, logoData, post.dynamic_fields)
              folder.file(
                `DailyReport_${formatDateForFilename(date)}_${safeName(projectName)}.pdf`,
                buf
              )
            } catch {
              // skip failed PDF
            }
          }
        }
      }

      // ─── Timesheets ─────────────────────────────────────────────────
      if (options.includeTimesheets) {
        const timecardPosts = await fetchPosts('timecard')
        if (timecardPosts.length > 0) {
          const folder = zip.folder('Timesheets')!
          setProgress({ step: 'Generating Timesheets...', current: 0, total: timecardPosts.length })

          for (let i = 0; i < timecardPosts.length; i++) {
            setProgress({ step: 'Generating Timesheets...', current: i + 1, total: timecardPosts.length })
            const post = timecardPosts[i]
            const content = post.content as TimecardContent
            const projectName = content.project_name || projectMap.get(post.project_id) || 'Unknown'
            const date = content.date || post.created_at.split('T')[0]

            // Build employee name for filename from first entry or use project name
            const empName = content.entries.length > 0 ? content.entries[0].employee_name : projectName

            try {
              const buf = await generateTimecardPdfBuffer(content, logoData, post.dynamic_fields)
              folder.file(
                `Timesheet_${formatDateForFilename(date)}_${safeName(empName)}.pdf`,
                buf
              )
            } catch {
              // skip failed PDF
            }
          }
        }
      }

      // ─── Expenses & Receipts ────────────────────────────────────────
      if (options.includeExpenses) {
        const expensePosts = await fetchPostsByTypes(['receipt', 'expense'])
        if (expensePosts.length > 0) {
          const folder = zip.folder('Expenses')!
          setProgress({ step: 'Generating Expenses...', current: 0, total: expensePosts.length })

          for (let i = 0; i < expensePosts.length; i++) {
            setProgress({ step: 'Generating Expenses...', current: i + 1, total: expensePosts.length })
            const post = expensePosts[i]
            const projectName = projectMap.get(post.project_id) || 'Unknown'

            if (post.post_type === 'receipt') {
              const content = post.content as ReceiptContent
              const date = content.receipt_date || post.created_at.split('T')[0]
              const photoUrl = content.receipt_photo ? getPhotoUrl(content.receipt_photo) : null

              try {
                const buf = await generateExpensePdfBuffer(content, photoUrl, logoData, post.dynamic_fields)
                folder.file(
                  `Expense_${formatDateForFilename(date)}_${safeName(projectName)}.pdf`,
                  buf
                )
              } catch {
                // skip failed PDF
              }
            } else {
              // expense type
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
                folder.file(
                  `Expense_${formatDateForFilename(date)}_${safeName(projectName)}_${i}.pdf`,
                  buf
                )
              } catch {
                // skip failed PDF
              }
            }
          }
        }
      }

      // ─── JSA Reports ────────────────────────────────────────────────
      if (options.includeJsa) {
        const jsaPosts = await fetchPosts('jsa_report')
        if (jsaPosts.length > 0) {
          const folder = zip.folder('JSA_Reports')!
          setProgress({ step: 'Generating JSA Reports...', current: 0, total: jsaPosts.length })

          for (let i = 0; i < jsaPosts.length; i++) {
            setProgress({ step: 'Generating JSA Reports...', current: i + 1, total: jsaPosts.length })
            const post = jsaPosts[i]
            const content = post.content as JsaReportContent
            const projectName = content.projectName || projectMap.get(post.project_id) || 'Unknown'
            const date = content.date || post.created_at.split('T')[0]

            try {
              const buf = await generateJsaPdfBuffer(content, logoData, post.dynamic_fields)
              folder.file(
                `JSA_${formatDateForFilename(date)}_${safeName(projectName)}.pdf`,
                buf
              )
            } catch {
              // skip failed PDF
            }
          }
        }
      }

      // ─── Job Feed Posts ─────────────────────────────────────────────
      if (options.includeFeed) {
        const allFeedPosts = await fetchPostsByTypes(['text', 'photo', 'daily_report', 'task', 'pdf', 'jsa_report', 'receipt', 'expense', 'timecard'])
        if (allFeedPosts.length > 0) {
          // Group by project
          const byProject = new Map<string, FeedPost[]>()
          for (const post of allFeedPosts) {
            const existing = byProject.get(post.project_id) || []
            existing.push(post)
            byProject.set(post.project_id, existing)
          }

          const folder = zip.folder('Job_Feed')!
          const projectEntries = Array.from(byProject.entries())
          setProgress({ step: 'Generating Feed PDFs...', current: 0, total: projectEntries.length })

          for (let i = 0; i < projectEntries.length; i++) {
            setProgress({ step: 'Generating Feed PDFs...', current: i + 1, total: projectEntries.length })
            const [projId, posts] = projectEntries[i]
            const projectName = projectMap.get(projId) || 'Unknown'

            try {
              const buf = await generateFeedPdfBuffer(projectName, posts, getPhotoUrl, logoData)
              folder.file(`Feed_${safeName(projectName)}.pdf`, buf)
            } catch {
              // skip failed PDF
            }
          }
        }
      }

      // ─── Photos ─────────────────────────────────────────────────────
      if (options.includePhotos) {
        // Gather all posts that may have photos
        const photoPosts = await fetchPostsByTypes(['photo', 'daily_report', 'receipt', 'expense'])
        const photoEntries: { url: string; date: string; projectName: string }[] = []

        for (const post of photoPosts) {
          const projectName = projectMap.get(post.project_id) || 'Unknown'
          const content = post.content as unknown as Record<string, unknown>
          const date = post.created_at.split('T')[0]

          if ('photos' in content && Array.isArray(content.photos)) {
            for (const path of content.photos) {
              photoEntries.push({ url: getPhotoUrl(path as string), date, projectName })
            }
          }
          if ('receipt_photo' in content && content.receipt_photo) {
            photoEntries.push({ url: getPhotoUrl(content.receipt_photo as string), date, projectName })
          }
          if ('attachment' in content && content.attachment) {
            photoEntries.push({ url: getPhotoUrl(content.attachment as string), date, projectName })
          }
        }

        if (photoEntries.length > 0) {
          const folder = zip.folder('Photos')!
          setProgress({ step: 'Downloading Photos...', current: 0, total: photoEntries.length })

          for (let i = 0; i < photoEntries.length; i++) {
            setProgress({ step: 'Downloading Photos...', current: i + 1, total: photoEntries.length })
            const entry = photoEntries[i]
            try {
              const res = await fetch(entry.url)
              if (!res.ok) continue
              const blob = await res.blob()
              const ext = blob.type.includes('png') ? 'png' : 'jpg'
              const filename = `Photo_${formatDateForFilename(entry.date)}_${safeName(entry.projectName)}_${String(i + 1).padStart(3, '0')}.${ext}`
              folder.file(filename, blob)
            } catch {
              // skip failed downloads
            }
          }
        }
      }

      // ─── Calendar / Jobs ────────────────────────────────────────────
      if (options.includeCalendar) {
        setProgress({ step: 'Generating Jobs Summary...', current: 0, total: 1 })

        // Fetch projects that overlap with the date range
        let query = supabase.from('projects').select('*')
        if (options.projectId) {
          query = query.eq('id', options.projectId)
        }
        const { data: allProjects } = await query
        const filteredProjects = ((allProjects || []) as Project[]).filter((p) => {
          // Include if project date range overlaps with export date range
          if (!p.start_date && !p.end_date) return true
          const pStart = p.start_date || '1900-01-01'
          const pEnd = p.end_date || '2099-12-31'
          return pStart <= options.endDate && pEnd >= options.startDate
        })

        if (filteredProjects.length > 0) {
          const folder = zip.folder('Calendar')!
          try {
            const buf = await generateCalendarSummaryPdfBuffer(
              options.startDate,
              options.endDate,
              filteredProjects,
              logoData
            )
            folder.file(
              `Jobs_Summary_${formatDateForFilename(options.startDate)}_to_${formatDateForFilename(options.endDate)}.pdf`,
              buf
            )
          } catch {
            // skip failed PDF
          }
        }

        setProgress({ step: 'Generating Jobs Summary...', current: 1, total: 1 })
      }

      // ─── Build ZIP ──────────────────────────────────────────────────
      setProgress({ step: 'Building ZIP file...', current: 0, total: 0 })

      // Remove empty folders
      const zipEntries = Object.keys(zip.files)
      if (zipEntries.filter((k) => !zip.files[k].dir).length === 0) {
        setError('No data found for the selected date range and filters.')
        setExporting(false)
        setProgress(null)
        return
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Export_${formatDateForFilename(options.startDate)}_to_${formatDateForFilename(options.endDate)}.zip`
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
  }, [startDate, endDate, selectedProjectId, includeDaily, includeTimesheets, includeExpenses, includeJsa, includeFeed, includePhotos, includeCalendar, projects, companySettings])

  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'

  const checkboxes: { label: string; checked: boolean; onChange: (v: boolean) => void }[] = [
    { label: 'Daily Reports', checked: includeDaily, onChange: setIncludeDaily },
    { label: 'Timesheets', checked: includeTimesheets, onChange: setIncludeTimesheets },
    { label: 'Expenses & Receipts', checked: includeExpenses, onChange: setIncludeExpenses },
    { label: 'JSA Reports', checked: includeJsa, onChange: setIncludeJsa },
    { label: 'Job Feed Posts', checked: includeFeed, onChange: setIncludeFeed },
    { label: 'Photos', checked: includePhotos, onChange: setIncludePhotos },
    { label: 'Calendar / Jobs', checked: includeCalendar, onChange: setIncludeCalendar },
  ]

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

        {/* Date Range */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Date Range</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>

        {/* Project Filter */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Project Filter</h2>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className={inputCls}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Data Types */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Data Types</h2>
          <div className="space-y-3">
            {checkboxes.map((cb) => (
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
            disabled={exporting || !startDate || !endDate}
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
