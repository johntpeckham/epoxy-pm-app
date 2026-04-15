'use client'

import { useState, useRef } from 'react'
import { FileTextIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Lead } from './LeadsClient'

interface LeadProjectDetailsCardProps {
  lead: Lead
  onPatch: (patch: Partial<Lead>) => void
}

export default function LeadProjectDetailsCard({
  lead,
  onPatch,
}: LeadProjectDetailsCardProps) {
  const [details, setDetails] = useState(lead.project_details ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(value: string) {
    setDetails(value)
    onPatch({ project_details: value || null })
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving')
      const supabase = createClient()
      const { error } = await supabase
        .from('leads')
        .update({ project_details: value || null })
        .eq('id', lead.id)
      if (error) {
        console.error('[Lead] Project details save failed:', error)
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
          <FileTextIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Project details</h3>
        <span className="text-xs text-gray-400 min-w-[54px] text-right">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && <span className="text-red-500">Error</span>}
        </span>
      </div>

      <textarea
        value={details}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Describe the project scope, requirements, and details..."
        className="w-full min-h-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white resize-y"
      />
    </div>
  )
}
