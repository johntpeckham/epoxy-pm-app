'use client'

import { RulerIcon } from 'lucide-react'
import { Project } from '@/types'
import WorkspaceShell from '../WorkspaceShell'

interface EstimatingWorkspaceProps {
  project: Project
  onBack: () => void
}

export default function EstimatingWorkspace({ project, onBack }: EstimatingWorkspaceProps) {
  return (
    <WorkspaceShell
      title="Estimating"
      icon={<RulerIcon className="w-5 h-5" />}
      onBack={onBack}
    >
      <div className="p-4 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <RulerIcon className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Estimating</h3>
              <p className="text-xs text-gray-500">Measurement and estimating tools</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Use the Estimating section under Sales to manage measurements and estimates for <strong>{project.name}</strong>.
          </p>
        </div>
      </div>
    </WorkspaceShell>
  )
}
