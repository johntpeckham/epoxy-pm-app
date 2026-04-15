'use client'

import { RulerIcon, ExternalLinkIcon } from 'lucide-react'
import { Project } from '@/types'
import Link from 'next/link'
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
              <h3 className="text-sm font-bold text-gray-900">Project Takeoff</h3>
              <p className="text-xs text-gray-500">Measurement and estimating tools</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Use the Measurements tool to measure plans, calculate quantities, and create project estimates for <strong>{project.name}</strong>.
          </p>
          <Link
            href="/job-takeoff"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            Open Measurements
            <ExternalLinkIcon className="w-3.5 h-3.5" />
          </Link>
          <p className="text-xs text-gray-400 mt-3">Note: Measurements is a desktop-only feature.</p>
        </div>
      </div>
    </WorkspaceShell>
  )
}
