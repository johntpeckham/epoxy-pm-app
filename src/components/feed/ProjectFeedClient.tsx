'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeftIcon, MapPinIcon, UserIcon, FileTextIcon, ClipboardListIcon, CameraIcon } from 'lucide-react'
import PostCard from './PostCard'
import PinnedSection from './PinnedSection'
import AddPostPanel from './AddPostPanel'
import DocumentUploadModal from '@/components/documents/DocumentUploadModal'
import ProjectReportModal from '@/components/reports/ProjectReportModal'
import ProjectPhotosModal from '@/components/photos/ProjectPhotosModal'
import { FeedPost, Project } from '@/types'
import { useUserRole } from '@/lib/useUserRole'

interface ProjectFeedClientProps {
  project: Project
  initialPosts: FeedPost[]
  userId: string
  /** When provided, renders in panel mode: compact layout, no Link navigation */
  onBack?: () => void
}

export default function ProjectFeedClient({
  project,
  initialPosts,
  userId,
  onBack,
}: ProjectFeedClientProps) {
  const inPanel = onBack !== undefined
  const { role: userRole } = useUserRole()
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts)
  const [showPlansModal, setShowPlansModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isFirstLoad = useRef(true)

  const fetchPosts = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('feed_posts')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })

    if (data) {
      // Fetch profiles for all post authors
      const userIds = [...new Set(data.map((p) => p.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)
      const profileMap = new Map(
        (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
      )

      const enriched = data.map((post) => {
        const profile = profileMap.get(post.user_id)
        return {
          ...post,
          author_name: profile?.display_name ?? post.author_name,
          author_avatar_url: profile?.avatar_url ?? undefined,
        } as FeedPost
      })
      setPosts(enriched)
    }
  }, [project.id])

  // Scroll to bottom on first load
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 100)
    }
  }, [])

  function handlePosted() {
    fetchPosts().then(() => {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 200)
    })
  }

  const pinnedPosts = posts.filter((p) => p.is_pinned)
  const unpinnedPosts = posts.filter((p) => !p.is_pinned)

  return (
    <div className="flex flex-col bg-gray-50 h-full w-full max-w-full overflow-hidden border-4 border-red-500">
      {/* Project header — flex-none keeps it at natural height, never scrolls */}
      <div className="flex-none bg-white border-b border-gray-200 z-10">
        <div className="px-4 py-4">
          {/* Top row: back button + project info (+ action buttons on md+) */}
          <div className="flex items-start gap-3">
            {inPanel ? (
              <button
                onClick={onBack}
                className="mt-0.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition flex-shrink-0 lg:hidden"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            ) : (
              <Link
                href="/jobs"
                className="mt-0.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition flex-shrink-0"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </Link>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900 leading-tight truncate">{project.name}</h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                    project.status === 'Active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {project.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                <span className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
                  <UserIcon className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{project.client_name}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
                  <MapPinIcon className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{project.address}</span>
                </span>
              </div>
            </div>
            {/* Action buttons — desktop only (inline with header) */}
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setShowPlansModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 transition"
              >
                <FileTextIcon className="w-3.5 h-3.5" />
                Plans
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 transition"
              >
                <ClipboardListIcon className="w-3.5 h-3.5" />
                Report
              </button>
              <button
                onClick={() => setShowPhotosModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 transition"
              >
                <CameraIcon className="w-3.5 h-3.5" />
                Pictures
              </button>
            </div>
          </div>
          {/* Action buttons — mobile only (below header info) */}
          <div className="flex md:hidden items-center gap-1.5 mt-3 overflow-x-auto max-w-full">
            <button
              onClick={() => setShowPlansModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 transition flex-shrink-0"
            >
              <FileTextIcon className="w-3.5 h-3.5" />
              Plans
            </button>
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 transition flex-shrink-0"
            >
              <ClipboardListIcon className="w-3.5 h-3.5" />
              Project Report
            </button>
            <button
              onClick={() => setShowPhotosModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-amber-50 hover:text-amber-700 transition flex-shrink-0"
            >
              <CameraIcon className="w-3.5 h-3.5" />
              Pictures
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable feed — flex-1 takes remaining space, min-h-0 allows shrinking, overflow-y-auto scrolls */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white">
        <div className="py-3">
          {/* Pinned posts */}
          <PinnedSection
            posts={pinnedPosts}
            userId={userId}
            onPinToggle={fetchPosts}
            onDeleted={fetchPosts}
            onUpdated={fetchPosts}
          />

          {/* Chronological feed */}
          {unpinnedPosts.length === 0 && pinnedPosts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm">No posts yet. Add the first one below.</p>
            </div>
          ) : (
            <div className="space-y-1 mb-4">
              {unpinnedPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  userId={userId}
                  onPinToggle={fetchPosts}
                  onDeleted={fetchPosts}
                  onUpdated={fetchPosts}
                />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Fixed-bottom composer */}
      <AddPostPanel
        project={project}
        userId={userId}
        onPosted={handlePosted}
      />

      {/* Plans document upload modal */}
      {showPlansModal && (
        <DocumentUploadModal
          projectId={project.id}
          projectName={project.name}
          userId={userId}
          category="plan"
          onClose={() => setShowPlansModal(false)}
        />
      )}

      {/* Project report fillable form modal */}
      {showReportModal && (
        <ProjectReportModal
          projectId={project.id}
          projectName={project.name}
          clientName={project.client_name}
          address={project.address}
          estimateNumber={project.estimate_number ?? ''}
          userId={userId}
          userRole={userRole}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* Project photos modal */}
      {showPhotosModal && (
        <ProjectPhotosModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowPhotosModal(false)}
        />
      )}
    </div>
  )
}
