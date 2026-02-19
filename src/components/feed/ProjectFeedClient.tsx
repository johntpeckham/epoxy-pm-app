'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeftIcon, MapPinIcon, UserIcon } from 'lucide-react'
import PostCard from './PostCard'
import PinnedSection from './PinnedSection'
import AddPostPanel from './AddPostPanel'
import { FeedPost, Project } from '@/types'

interface ProjectFeedClientProps {
  project: Project
  initialPosts: FeedPost[]
  userId: string
}

export default function ProjectFeedClient({
  project,
  initialPosts,
  userId,
}: ProjectFeedClientProps) {
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts)
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
      // Enrich with author info from auth - we store user_id, show email prefix
      setPosts(data as FeedPost[])
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
    <div className="flex flex-col h-screen lg:h-auto lg:min-h-screen bg-gray-50">
      {/* Project header */}
      <div className="bg-white border-b border-gray-200 sticky top-14 lg:top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <Link
              href="/"
              className="mt-0.5 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition flex-shrink-0"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900 leading-tight">{project.name}</h1>
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
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <UserIcon className="w-3 h-3" /> {project.client_name}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <MapPinIcon className="w-3 h-3" /> {project.address}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-5 sm:px-6 space-y-0">
        {/* Pinned posts */}
        <PinnedSection posts={pinnedPosts} onPinToggle={fetchPosts} />

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
          <div className="space-y-3 mb-5">
            {unpinnedPosts.map((post) => (
              <PostCard key={post.id} post={post} onPinToggle={fetchPosts} />
            ))}
          </div>
        )}

        <div ref={bottomRef} />

        {/* Add post panel */}
        <div className="sticky bottom-0 pb-4 pt-2 bg-gray-50">
          <AddPostPanel
            projectId={project.id}
            userId={userId}
            onPosted={handlePosted}
          />
        </div>
      </div>
    </div>
  )
}
