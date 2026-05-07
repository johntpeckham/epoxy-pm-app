'use client'

import { useState, useRef } from 'react'
import { FileTextIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AutoSaveIndicator from '@/components/ui/AutoSaveIndicator'

export type ProjectDetailsParentType = 'lead' | 'appointment' | 'job_walk'

interface ProjectDetailsCardProps {
  parentType: ProjectDetailsParentType
  parentId: string
  projectDetails: string | null
  onPatch: (value: string | null) => void
}

const TABLE: Record<ProjectDetailsParentType, string> = {
  lead: 'leads',
  appointment: 'crm_appointments',
  job_walk: 'job_walks',
}

export default function ProjectDetailsCard({
  parentType,
  parentId,
  projectDetails,
  onPatch,
}: ProjectDetailsCardProps) {
  const [details, setDetails] = useState(projectDetails ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(value: string) {
    setDetails(value)
    onPatch(value || null)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving')
      const supabase = createClient()
      const { error } = await supabase
        .from(TABLE[parentType])
        .update({ project_details: value || null })
        .eq('id', parentId)
      if (error) {
        console.error('[ProjectDetailsCard] Save failed:', {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details,
        })
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
        <AutoSaveIndicator isSaving={saveState === 'saving'} />
      </div>

      <textarea
        value={details}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Describe the project scope, requirements, and details..."
        className="w-full min-h-[120px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white resize-y"
      />
    </div>
  )
}
