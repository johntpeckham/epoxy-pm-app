'use client'

import { ArrowLeftIcon, PlusIcon, FolderIcon } from 'lucide-react'
import type { Customer } from '../estimates/types'
import type { ProjectTakeoffProject } from './types'

interface ProjectsLeftPanelProps {
  customer: Customer
  projects: ProjectTakeoffProject[]
  selectedProjectId: string | null
  onSelectProject: (id: string) => void
  onBack: () => void
  onNewProject: () => void
}

export default function ProjectsLeftPanel({
  customer,
  projects,
  selectedProjectId,
  onSelectProject,
  onBack,
  onNewProject,
}: ProjectsLeftPanelProps) {
  return (
    <div className="w-[300px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-amber-600 transition-colors mb-2"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to customers
        </button>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{customer.name}</h2>
            {customer.company && (
              <p className="text-xs text-gray-500 truncate">{customer.company}</p>
            )}
          </div>
          <button
            onClick={onNewProject}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
            title="New project"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <FolderIcon className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No projects yet.</p>
            </div>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                  selectedProjectId === project.id
                    ? 'border-l-amber-500 bg-amber-50'
                    : 'border-l-transparent hover:bg-gray-50'
                }`}
              >
                <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
                <p className="text-xs text-gray-500 truncate">{project.status}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
