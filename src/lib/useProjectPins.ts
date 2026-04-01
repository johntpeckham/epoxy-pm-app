'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useProjectPins(userId: string) {
  const [pinnedProjectIds, setPinnedProjectIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const fetchPins = useCallback(async () => {
    if (!userId) return
    const supabase = createClient()
    const { data, error } = await supabase
      .from('project_pins')
      .select('project_id')
      .eq('user_id', userId)
    if (error) {
      console.error('[Pins] Fetch pins failed:', error)
      // If table doesn't exist yet, just return empty
      setPinnedProjectIds(new Set())
      setLoading(false)
      return
    }
    setPinnedProjectIds(new Set((data ?? []).map((r) => r.project_id)))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchPins()
  }, [fetchPins])

  const togglePin = useCallback(async (projectId: string) => {
    const supabase = createClient()
    const isPinned = pinnedProjectIds.has(projectId)

    if (isPinned) {
      // Optimistic update
      setPinnedProjectIds((prev) => {
        const next = new Set(prev)
        next.delete(projectId)
        return next
      })
      const { error } = await supabase
        .from('project_pins')
        .delete()
        .eq('user_id', userId)
        .eq('project_id', projectId)
      if (error) {
        console.error('[Pins] Unpin failed:', error)
        // Revert
        setPinnedProjectIds((prev) => new Set(prev).add(projectId))
      }
    } else {
      // Optimistic update
      setPinnedProjectIds((prev) => new Set(prev).add(projectId))
      const { error } = await supabase
        .from('project_pins')
        .insert({ user_id: userId, project_id: projectId })
      if (error) {
        console.error('[Pins] Pin failed:', error)
        // Revert
        setPinnedProjectIds((prev) => {
          const next = new Set(prev)
          next.delete(projectId)
          return next
        })
      }
    }
  }, [userId, pinnedProjectIds])

  const isPinned = useCallback((projectId: string) => {
    return pinnedProjectIds.has(projectId)
  }, [pinnedProjectIds])

  return { pinnedProjectIds, isPinned, togglePin, loading }
}
