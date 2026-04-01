'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, EyeIcon, EyeOffIcon } from 'lucide-react'
import { Project, FeedPost, PostType } from '@/types'
import WorkspaceShell from '../WorkspaceShell'
import PostCard from '@/components/feed/PostCard'
import Portal from '@/components/ui/Portal'

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
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
  const [profiles, setProfiles] = useState<Map<string, { display_name: string | null; avatar_url: string | null }>>(new Map())

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

  return (
    <WorkspaceShell title={title} icon={icon} onBack={onBack}>
      <div className="p-4">
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
            <p className="text-xs text-gray-400 mb-1">{posts.length} item{posts.length === 1 ? '' : 's'}</p>
            {posts.map((post) => {
              const published = (post as FeedPost & { is_published?: boolean }).is_published !== false
              return (
                <div
                  key={post.id}
                  className={`bg-white rounded-xl border border-gray-200 p-3 hover:shadow-sm hover:border-gray-300 transition-all ${!published ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-2">
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
                    <button
                      onClick={() => togglePublished(post)}
                      className={`p-1.5 rounded transition flex-shrink-0 ${published ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-100'}`}
                      title={published ? 'Published — visible in Job Feed' : 'Hidden — not visible in Job Feed'}
                    >
                      {published ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail modal using existing PostCard */}
      {selectedPost && (
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
    </WorkspaceShell>
  )
}
