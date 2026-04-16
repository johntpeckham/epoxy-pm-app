'use client'

import { PlusIcon, FolderIcon } from 'lucide-react'
import type { Customer } from '../estimates/types'
import type { ProjectTakeoffProject } from './types'

interface CustomerProjectsPanelProps {
  customer: Customer
  projects: ProjectTakeoffProject[]
  onSelectProject: (id: string) => void
  onNewProject: () => void
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  'on-hold': 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-600',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function CustomerProjectsPanel({
  customer,
  projects,
  onSelectProject,
  onNewProject,
}: CustomerProjectsPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{customer.name}</h2>
          {customer.company && (
            <p className="text-xs text-gray-500">{customer.company}</p>
          )}
        </div>
        <button
          onClick={onNewProject}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New project
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderIcon className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 mb-4">
              No projects yet. Create one to get started.
            </p>
            <button
              onClick={onNewProject}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              New project
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Project</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Created</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-b border-gray-50 last:border-b-0 hover:bg-amber-50 transition-colors cursor-pointer"
                    onClick={() => onSelectProject(project.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{project.name}</p>
                      {project.description && (
                        <p className="text-xs text-gray-500 truncate max-w-md">
                          {project.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(project.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          STATUS_COLORS[project.status] ?? STATUS_COLORS.active
                        }`}
                      >
                        {project.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
