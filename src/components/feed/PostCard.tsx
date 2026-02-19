'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { PinIcon, PinOffIcon, ClipboardListIcon } from 'lucide-react'
import { FeedPost, TextContent, PhotoContent, DailyReportContent } from '@/types'

interface PostCardProps {
  post: FeedPost
  onPinToggle: () => void
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function getInitials(email: string) {
  return email.split('@')[0].slice(0, 2).toUpperCase()
}

function TextPost({ content }: { content: TextContent }) {
  return (
    <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
      {content.message}
    </p>
  )
}

function PhotoPost({ content }: { content: PhotoContent }) {
  const supabase = createClient()
  const urls = content.photos.map((path) => {
    const { data } = supabase.storage.from('post-photos').getPublicUrl(path)
    return data.publicUrl
  })

  return (
    <div>
      <div
        className={`grid gap-2 ${
          urls.length === 1
            ? 'grid-cols-1'
            : urls.length === 2
            ? 'grid-cols-2'
            : 'grid-cols-2 sm:grid-cols-3'
        }`}
      >
        {urls.map((url, i) => (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
            <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <Image
                src={url}
                alt={`Photo ${i + 1}`}
                fill
                className="object-cover hover:opacity-90 transition"
                sizes="(max-width: 640px) 50vw, 300px"
              />
            </div>
          </a>
        ))}
      </div>
      {content.caption && (
        <p className="text-gray-600 text-sm mt-2 italic">{content.caption}</p>
      )}
    </div>
  )
}

function DailyReportPost({ content }: { content: DailyReportContent }) {
  const fields: { label: string; key: keyof DailyReportContent }[] = [
    { label: 'Date', key: 'date' },
    { label: 'Crew Members', key: 'crew_members' },
    { label: 'Surface Prep Notes', key: 'surface_prep_notes' },
    { label: 'Epoxy Product Used', key: 'epoxy_product_used' },
    { label: 'Coats Applied', key: 'coats_applied' },
    { label: 'Weather Conditions', key: 'weather_conditions' },
    { label: 'Additional Notes', key: 'additional_notes' },
  ]

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-100 border-b border-amber-200">
        <ClipboardListIcon className="w-4 h-4 text-amber-700" />
        <span className="text-sm font-semibold text-amber-800">Daily Field Report</span>
      </div>
      <div className="p-4 space-y-3">
        {fields.map(({ label, key }) =>
          content[key] ? (
            <div key={key}>
              <dt className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">
                {label}
              </dt>
              <dd className="text-sm text-gray-700 whitespace-pre-wrap">{content[key]}</dd>
            </div>
          ) : null
        )}
      </div>
    </div>
  )
}

export default function PostCard({ post, onPinToggle }: PostCardProps) {
  const [pinning, setPinning] = useState(false)

  async function handlePinToggle() {
    setPinning(true)
    const supabase = createClient()
    await supabase
      .from('feed_posts')
      .update({ is_pinned: !post.is_pinned })
      .eq('id', post.id)
    onPinToggle()
    setPinning(false)
  }

  const authorName = post.author_name || post.author_email?.split('@')[0] || 'User'
  const initials = post.author_email ? getInitials(post.author_email) : 'U'

  return (
    <div
      className={`bg-white rounded-xl border transition-all ${
        post.is_pinned ? 'border-amber-300 shadow-sm' : 'border-gray-200'
      }`}
    >
      <div className="p-4">
        {/* Post header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{authorName}</p>
              <p className="text-xs text-gray-400">{formatDate(post.created_at)}</p>
            </div>
          </div>
          <button
            onClick={handlePinToggle}
            disabled={pinning}
            title={post.is_pinned ? 'Unpin post' : 'Pin post'}
            className={`p-1.5 rounded-md transition ${
              post.is_pinned
                ? 'text-amber-500 hover:bg-amber-50'
                : 'text-gray-300 hover:text-amber-400 hover:bg-gray-50'
            }`}
          >
            {post.is_pinned ? (
              <PinOffIcon className="w-4 h-4" />
            ) : (
              <PinIcon className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Post content */}
        {post.post_type === 'text' && (
          <TextPost content={post.content as TextContent} />
        )}
        {post.post_type === 'photo' && (
          <PhotoPost content={post.content as PhotoContent} />
        )}
        {post.post_type === 'daily_report' && (
          <DailyReportPost content={post.content as DailyReportContent} />
        )}
      </div>
    </div>
  )
}
