'use client'

import { useState } from 'react'
import { PinIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import PostCard from './PostCard'
import { FeedPost } from '@/types'

interface PinnedSectionProps {
  posts: FeedPost[]
  userId?: string
  onPinToggle: () => void
  onDeleted?: () => void
  onUpdated?: () => void
}

export default function PinnedSection({ posts, userId, onPinToggle, onDeleted, onUpdated }: PinnedSectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (posts.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition"
      >
        <div className="flex items-center gap-2">
          <PinIcon className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">
            Pinned ({posts.length})
          </span>
        </div>
        {collapsed ? (
          <ChevronDownIcon className="w-4 h-4 text-amber-600" />
        ) : (
          <ChevronUpIcon className="w-4 h-4 text-amber-600" />
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              userId={userId}
              onPinToggle={onPinToggle}
              onDeleted={onDeleted}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
