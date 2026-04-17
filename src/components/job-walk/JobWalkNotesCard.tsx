'use client'

import { useState, useRef } from 'react'
import { PencilIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AutoSaveIndicator from '@/components/ui/AutoSaveIndicator'
import type { JobWalk } from './JobWalkClient'

interface JobWalkNotesCardProps {
  walk: JobWalk
  onPatch: (patch: Partial<JobWalk>) => void
}

export default function JobWalkNotesCard({ walk, onPatch }: JobWalkNotesCardProps) {
  // Parent remounts this component (via key={walk.id}) when the selected
  // walk changes, so initial state always reflects the freshly-selected walk.
  const [notes, setNotes] = useState(walk.notes ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(value: string) {
    setNotes(value)
    onPatch({ notes: value || null })
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving')
      const supabase = createClient()
      const { error } = await supabase
        .from('job_walks')
        .update({ notes: value || null })
        .eq('id', walk.id)
      if (error) {
        console.error('[JobWalk] Notes save failed:', error)
        setSaveState('error')
      } else {
        setSaveState('saved')
        savedIndicatorTimerRef.current = setTimeout(() => setSaveState('idle'), 1500)
      }
    }, 1000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 transition-all hover:shadow-sm hover:border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500">
          <PencilIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Notes</h3>
        <AutoSaveIndicator isSaving={saveState === 'saving'} />
      </div>

      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Add notes from your job walk..."
        className="w-full min-h-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-y"
      />
    </div>
  )
}
