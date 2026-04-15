'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PlusIcon, DownloadIcon, XIcon, EyeIcon, EyeOffIcon, ChevronRightIcon } from 'lucide-react'
import { Project, FeedPost, PostType, TimecardContent, DailyReportContent, JsaReportContent } from '@/types'
import WorkspaceShell from '../WorkspaceShell'
import PostCard from '@/components/feed/PostCard'
import Portal from '@/components/ui/Portal'
import TimecardCard from '@/components/timesheets/TimecardCard'
import DailyReportCard from '@/components/daily-reports/DailyReportCard'
import JsaReportCard from '@/components/jsa-reports/JsaReportCard'
import NewDailyReportModal from '@/components/daily-reports/NewDailyReportModal'
import NewTimecardModal from '@/components/timesheets/NewTimecardModal'
import NewReceiptModal from '@/components/receipts/NewReceiptModal'
import NewJsaReportModal from '@/components/jsa-reports/NewJsaReportModal'
import { useCompanySettings } from '@/lib/useCompanySettings'
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'

interface FeedPostListWorkspaceProps {
  project: Project
  userId: string
  onBack: () => void
  title: string
  icon: React.ReactNode
  postTypes: PostType[]
  emptyMessage: string
}

interface PostContent {
  date?: string
  receipt_date?: string
  vendor_name?: string
  total_amount?: number
  description?: string
  amount?: number
  category?: string
  project_name?: string
  projectName?: string
  grand_total_hours?: number
  entries?: { employee_name?: string }[]
}

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const INLINE_EXPAND_TYPES: PostType[] = ['timecard', 'daily_report', 'jsa_report']

/** Wrapper that animates expand/collapse for a single post inline detail */
function ExpandableDetail({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (expanded && ref.current) {
      setHeight(ref.current.scrollHeight)
    } else {
      setHeight(0)
    }
  }, [expanded])

  return (
    <div
      ref={ref}
      className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
      style={{ maxHeight: expanded ? `${height}px` : '0px' }}
    >
      {children}
    </div>
  )
}

export default function FeedPostListWorkspace({
  project,
  userId,
  onBack,
  title,
  icon,
  postTypes,
  emptyMessage,
}: FeedPostListWorkspaceProps) {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null)
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [profiles, setProfiles] = useState<Map<string, { display_name: string | null; avatar_url: string | null }>>(new Map())
  const { settings: companySettings } = useCompanySettings()

  // Whether this workspace uses inline expand (timecards, daily reports, JSA) vs modal (receipts, expenses)
  const useInlineExpand = INLINE_EXPAND_TYPES.includes(postTypes[0])

  function handleToggleExpand(id: string) {
    setExpandedPostIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const fetchPosts = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('feed_posts')
      .select('*')
      .eq('project_id', project.id)
      .in('post_type', postTypes)
      .order('created_at', { ascending: false })
    if (error) console.error(`[${title}Workspace] Fetch failed:`, error)

    const postsData = (data ?? []) as FeedPost[]

    // Fetch author profiles
    const userIds = [...new Set(postsData.map((p) => p.user_id))]
    if (userIds.length) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)
      const map = new Map<string, { display_name: string | null; avatar_url: string | null }>()
      for (const p of profileData ?? []) {
        map.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url })
      }
      setProfiles(map)

      // Enrich posts with author info
      for (const post of postsData) {
        const profile = map.get(post.user_id)
        if (profile) {
          post.author_name = profile.display_name ?? undefined
          post.author_avatar_url = profile.avatar_url ?? undefined
        }
      }
    }

    // Sort inline-expand types by content date (newest first) instead of created_at
    if (INLINE_EXPAND_TYPES.includes(postTypes[0])) {
      postsData.sort((a, b) => {
        const dateA = (a.content as PostContent).date ?? ''
        const dateB = (b.content as PostContent).date ?? ''
        return dateB.localeCompare(dateA)
      })
    }

    setPosts(postsData)
    setLoading(false)
  }, [project.id, postTypes, title])

  const togglePublished = useCallback(async (post: FeedPost) => {
    const newVal = !(post as FeedPost & { is_published?: boolean }).is_published
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, is_published: newVal } as FeedPost : p))
    const supabase = createClient()
    const { error } = await supabase.from('feed_posts').update({ is_published: newVal }).eq('id', post.id)
    if (error) {
      console.error(`[${title}Workspace] Publish toggle failed:`, error)
      fetchPosts()
    }
  }, [fetchPosts, title])

  useEffect(() => {
    setLoading(true)
    fetchPosts()
  }, [fetchPosts])

  const getListItemSummary = (post: FeedPost): string => {
    const content = post.content as PostContent
    switch (post.post_type) {
      case 'daily_report':
        return content.date ? `Report for ${content.date}` : 'Daily Report'
      case 'timecard':
        return content.date
          ? `${content.date} — ${content.entries?.length ?? 0} employee${(content.entries?.length ?? 0) === 1 ? '' : 's'} — ${content.grand_total_hours ?? 0}h`
          : 'Timecard'
      case 'receipt':
        return `${content.vendor_name ?? 'Receipt'} — $${(content.total_amount ?? 0).toFixed(2)}`
      case 'expense':
        return `${content.description ?? 'Expense'} — $${(content.amount ?? 0).toFixed(2)}`
      case 'jsa_report':
        return content.date ? `JSA Report — ${content.date}` : 'JSA Report'
      default:
        return post.post_type
    }
  }

  const getListItemMeta = (post: FeedPost): string => {
    const profile = profiles.get(post.user_id)
    const author = profile?.display_name ?? 'Unknown'
    return `${author} · ${formatTimestamp(post.created_at)}`
  }

  // Determine primary type early for download and display logic
  const primaryType = postTypes[0]

  // Expense total for the expenses workspace
  const expenseTotal = useMemo(() => {
    if (primaryType !== 'receipt' && primaryType !== 'expense') return 0
    return posts.reduce((sum, post) => {
      const content = post.content as PostContent
      return sum + (content.total_amount ?? content.amount ?? 0)
    }, 0)
  }, [posts, primaryType])

  // Download report handler
  async function handleDownloadReport() {
    if (posts.length === 0) return
    setDownloading(true)
    setDownloadError(null)
    setPdfError(null)
    setShowPreview(true)
    setPdfPreview(null)
    try {
      const logoUrl = companySettings?.logo_url
      let result: { blob: Blob; filename: string } | null = null
      switch (primaryType) {
        case 'daily_report': {
          const { generateReportPdf } = await import('@/lib/generateReportPdf')
          const supabase = createClient()
          // Generate first report for preview
          const post = posts[0]
          const photoUrls: string[] = []
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const content = post.content as any
          const photos: string[] = content.photos ?? []
          for (const p of photos) {
            photoUrls.push(supabase.storage.from('post-photos').getPublicUrl(p).data.publicUrl)
          }
          result = await generateReportPdf(content, photoUrls, logoUrl, post.dynamic_fields)
          break
        }
        case 'jsa_report': {
          const { generateJsaPdf } = await import('@/lib/generateJsaPdf')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result = await generateJsaPdf(posts[0].content as any, logoUrl, posts[0].dynamic_fields)
          break
        }
        case 'receipt':
        case 'expense': {
          const { generateExpenseReportPdf } = await import('@/lib/generateExpenseReportPdf')
          // Normalize expense posts to ReceiptContent shape expected by the generator
          const normalized = posts.map((post) => {
            const c = post.content as PostContent
            if (post.post_type === 'expense') {
              return {
                content: {
                  receipt_photo: '',
                  vendor_name: c.description ?? 'Expense',
                  receipt_date: c.date ?? '',
                  total_amount: c.amount ?? 0,
                  category: c.category ?? '',
                },
              }
            }
            return { content: post.content }
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result = await generateExpenseReportPdf(project.name, normalized as any, logoUrl)
          break
        }
        case 'timecard': {
          const { generateWeeklyTimesheetPdf } = await import('@/lib/generateWeeklyTimesheetPdf')
          // Group timecards by week (Monday)
          const byWeek = new Map<string, FeedPost[]>()
          for (const post of posts) {
            const content = post.content as PostContent
            if (!content.date) continue
            const d = new Date(content.date + 'T12:00:00')
            const day = d.getDay()
            const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
            const monday = new Date(d)
            monday.setDate(diff)
            const key = monday.toISOString().split('T')[0]
            if (!byWeek.has(key)) byWeek.set(key, [])
            byWeek.get(key)!.push(post)
          }
          // Generate first week for preview
          const firstEntry = byWeek.entries().next().value
          if (firstEntry) {
            const [weekMonday, timecards] = firstEntry
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = await generateWeeklyTimesheetPdf(project.name, weekMonday, timecards as any, logoUrl)
          }
          break
        }
      }
      if (result) {
        setPdfPreview({ ...result, title })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[FeedPostListWorkspace] Download failed:', msg, err)
      setDownloadError(`Failed to generate report: ${msg}`)
      setPdfError(`Failed to generate report: ${msg}`)
    } finally {
      setDownloading(false)
    }
  }

  // Determine which creation modal to show based on post type
  const canCreate = ['daily_report', 'timecard', 'receipt', 'expense', 'jsa_report'].includes(primaryType)

  const renderCreateModal = () => {
    if (!showCreateModal) return null
    const modalProps = {
      projects: [project],
      userId,
      onClose: () => setShowCreateModal(false),
      onCreated: () => { setShowCreateModal(false); fetchPosts() },
    }
    switch (primaryType) {
      case 'daily_report': return <NewDailyReportModal {...modalProps} />
      case 'timecard': return <NewTimecardModal {...modalProps} />
      case 'receipt':
      case 'expense': return <NewReceiptModal {...modalProps} />
      case 'jsa_report': return <NewJsaReportModal {...modalProps} />
      default: return null
    }
  }

  return (
    <WorkspaceShell
      title={title}
      icon={icon}
      onBack={onBack}
      actions={
        <div className="flex items-center gap-2">
          {posts.length > 0 && (
            <button
              onClick={handleDownloadReport}
              disabled={downloading}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50"
              title="Download Report"
            >
              {downloading ? (
                <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <DownloadIcon className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Download</span>
            </button>
          )}
          {canCreate && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New
            </button>
          )}
        </div>
      }
    >
      <div className="p-4">
        {downloadError && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm mb-3 flex items-center justify-between">
            <span>{downloadError}</span>
            <button onClick={() => setDownloadError(null)} className="ml-2 text-red-400 hover:text-red-600"><XIcon className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-gray-300">{icon}</span>
            <p className="text-gray-500 font-medium mt-2">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Expense total banner */}
            {(primaryType === 'receipt' || primaryType === 'expense') && expenseTotal > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 mb-2">
                <p className="text-sm font-semibold text-gray-900">Total: ${expenseTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="text-xs text-gray-500">{posts.length} expense{posts.length === 1 ? '' : 's'}</p>
              </div>
            )}
            {primaryType !== 'receipt' && primaryType !== 'expense' && (
              <p className="text-xs text-gray-400 mb-1">{posts.length} item{posts.length === 1 ? '' : 's'}</p>
            )}
            {posts.map((post) => {
              const published = (post as FeedPost & { is_published?: boolean }).is_published !== false
              const isExpanded = useInlineExpand && expandedPostIds.has(post.id)
              return (
                <div
                  key={post.id}
                  className={`bg-white rounded-xl border border-gray-200 overflow-hidden transition-all ${!published ? 'opacity-60' : ''}`}
                >
                  <div className={`flex items-start gap-2 p-3 ${useInlineExpand ? 'hover:bg-gray-50' : 'hover:shadow-sm hover:border-gray-300'}`}>
                    {useInlineExpand ? (
                      <button
                        onClick={() => handleToggleExpand(post.id)}
                        className="flex-1 min-w-0 text-left flex items-start gap-2"
                      >
                        <ChevronRightIcon
                          className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900">{getListItemSummary(post)}</p>
                            {!published && <span className="text-xs text-gray-400 italic">Hidden from feed</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{getListItemMeta(post)}</p>
                        </div>
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedPost(post)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900">{getListItemSummary(post)}</p>
                          {!published && <span className="text-xs text-gray-400 italic">Hidden from feed</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{getListItemMeta(post)}</p>
                      </button>
                    )}
                    {!useInlineExpand && (
                      <button
                        onClick={() => togglePublished(post)}
                        className={`p-1.5 rounded transition flex-shrink-0 ${published ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-100'}`}
                        title={published ? 'Published — visible in Job Feed' : 'Hidden — not visible in Job Feed'}
                      >
                        {published ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  {/* Inline expanded detail — render real card components */}
                  {useInlineExpand && (
                    <ExpandableDetail expanded={isExpanded}>
                      <div className="border-t border-gray-100">
                        {post.post_type === 'timecard' && (
                          <TimecardCard
                            timecard={{
                              id: post.id,
                              project_id: post.project_id,
                              created_at: post.created_at,
                              content: post.content as TimecardContent,
                              dynamic_fields: post.dynamic_fields,
                              project_name: project.name,
                            }}
                            expandedId={post.id}
                            onToggleExpand={() => handleToggleExpand(post.id)}
                          />
                        )}
                        {post.post_type === 'daily_report' && (
                          <DailyReportCard
                            report={{
                              id: post.id,
                              project_id: post.project_id,
                              created_at: post.created_at,
                              content: post.content as DailyReportContent,
                              dynamic_fields: post.dynamic_fields,
                              project_name: project.name,
                            }}
                            expandedId={post.id}
                            onToggleExpand={() => handleToggleExpand(post.id)}
                          />
                        )}
                        {post.post_type === 'jsa_report' && (
                          <JsaReportCard
                            report={{
                              id: post.id,
                              project_id: post.project_id,
                              created_at: post.created_at,
                              content: post.content as JsaReportContent,
                              dynamic_fields: post.dynamic_fields,
                              project_name: project.name,
                            }}
                            expandedId={post.id}
                            onToggleExpand={() => handleToggleExpand(post.id)}
                          />
                        )}
                      </div>
                    </ExpandableDetail>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail modal — only for non-inline-expand types (receipts, expenses) */}
      {!useInlineExpand && selectedPost && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setSelectedPost(null)}>
            <div
              className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h3 className="text-base font-bold text-gray-900">{title} Detail</h3>
                <button onClick={() => setSelectedPost(null)} className="p-1 text-gray-400 hover:text-gray-600">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <PostCard
                  post={selectedPost}
                  userId={userId}
                  onPinToggle={() => {}}
                  onDeleted={() => {
                    setSelectedPost(null)
                    fetchPosts()
                  }}
                  onUpdated={() => {
                    fetchPosts()
                  }}
                />
              </div>
            </div>
          </div>
        </Portal>
      )}
      {renderCreateModal()}

      {showPreview && (
        <ReportPreviewModal
          pdfData={pdfPreview}
          loading={downloading}
          error={pdfError}
          title={title}
          onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
        />
      )}
    </WorkspaceShell>
  )
}
