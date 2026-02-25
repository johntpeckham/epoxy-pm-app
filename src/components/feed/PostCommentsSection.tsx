'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { SendIcon, XIcon } from 'lucide-react'
import { PostComment } from '@/types'

interface PostCommentsSectionProps {
  postId: string
  userId: string
}

function formatCommentDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

export default function PostCommentsSection({ postId, userId }: PostCommentsSectionProps) {
  const supabase = createClient()
  const [comments, setComments] = useState<PostComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Load comments and set up real-time subscription
  useEffect(() => {
    let mounted = true

    async function fetchComments() {
      const { data } = await supabase
        .from('post_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })

      if (!data || !mounted) return

      // Enrich with profile data
      const userIds = [...new Set(data.map((c) => c.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)

      const profileMap = new Map(
        (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p])
      )

      const enriched: PostComment[] = data.map((c) => {
        const profile = profileMap.get(c.user_id)
        return {
          ...c,
          author_name: profile?.display_name ?? undefined,
          author_avatar_url: profile?.avatar_url ?? undefined,
        }
      })

      if (mounted) setComments(enriched)
    }

    fetchComments()

    // Real-time subscription
    const channel = supabase
      .channel(`post-comments-${postId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` },
        async (payload) => {
          const newRow = payload.new as PostComment
          // Fetch profile for the new comment author
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .eq('id', newRow.user_id)
            .single()

          const enriched: PostComment = {
            ...newRow,
            author_name: profile?.display_name ?? undefined,
            author_avatar_url: profile?.avatar_url ?? undefined,
          }

          if (mounted) {
            setComments((prev) => {
              // Avoid duplicates
              if (prev.some((c) => c.id === enriched.id)) return prev
              return [...prev, enriched]
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          if (mounted) {
            setComments((prev) => prev.filter((c) => c.id !== deletedId))
          }
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [postId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [comments.length])

  async function handleSend() {
    const text = newComment.trim()
    if (!text || sending) return
    setSending(true)

    await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: userId,
      content: text,
    })

    setNewComment('')
    setSending(false)
  }

  async function handleDelete(commentId: string) {
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    await supabase.from('post_comments').delete().eq('id', commentId)
  }

  return (
    <div className="mt-1 ml-1">
      {/* Comment list */}
      {comments.length > 0 && (
        <div ref={listRef} className="max-h-48 overflow-y-auto space-y-1.5 mb-2 pr-1">
          {comments.map((comment) => {
            const name = comment.author_name || 'User'
            const initials = getInitials(name)
            const isOwn = comment.user_id === userId

            return (
              <div key={comment.id} className="group/comment flex items-start gap-2">
                {/* Mini avatar */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden mt-0.5">
                  {comment.author_avatar_url ? (
                    <Image
                      src={comment.author_avatar_url}
                      alt="Avatar"
                      width={24}
                      height={24}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-white">{initials}</span>
                  )}
                </div>

                {/* Comment bubble */}
                <div className="flex-1 min-w-0">
                  <div className="inline-block max-w-full bg-gray-100 rounded-xl rounded-tl-sm px-2.5 py-1.5">
                    <span className="text-xs font-semibold text-gray-800">{name}</span>
                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-400 ml-1">{formatCommentDate(comment.created_at)}</span>
                </div>

                {/* Delete button for own comments */}
                {isOwn && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="flex-shrink-0 p-0.5 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover/comment:opacity-100 transition-opacity mt-1"
                    title="Delete comment"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Write a comment…"
          className="flex-1 min-w-0 text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
        />
        <button
          onClick={handleSend}
          disabled={sending || !newComment.trim()}
          className="flex-shrink-0 p-1.5 rounded-full text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:hover:bg-transparent transition"
          title="Send comment"
        >
          <SendIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
