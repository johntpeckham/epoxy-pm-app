'use client'

import { useState } from 'react'
import { PencilIcon } from 'lucide-react'
import type { Customer } from '@/components/estimates/types'
import type { EstimatingProject } from './types'
import { useUserRole } from '@/lib/useUserRole'
import ProjectTakeoffSheetsCard from './ProjectTakeoffSheetsCard'
import ProjectMeasurementsCard from './ProjectMeasurementsCard'
import ProjectEstimatesCard from './ProjectEstimatesCard'
import ProjectPipelineCard from './ProjectPipelineCard'
import ProjectRemindersCard from './ProjectRemindersCard'
import ProjectNumberOverrideModal from './ProjectNumberOverrideModal'

interface ProjectDashboardProps {
  project: EstimatingProject
  customer: Customer
  userId: string
  onPatch: (patch: Partial<EstimatingProject>) => void
}

export default function ProjectDashboard({
  project,
  customer,
  userId,
  onPatch,
}: ProjectDashboardProps) {
  const { role } = useUserRole()
  const isAdmin = role === 'admin'
  const [showOverride, setShowOverride] = useState(false)

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="px-4 py-4 border-b border-gray-200 bg-white">
        {project.project_number && (
          <div className="mb-1">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setShowOverride(true)}
                title="Edit project number"
                className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full px-2.5 py-0.5 transition"
              >
                Project #{project.project_number}
                <PencilIcon className="w-3 h-3" />
              </button>
            ) : (
              <span className="inline-flex items-center text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                Project #{project.project_number}
              </span>
            )}
          </div>
        )}
        <h2 className="text-base font-bold text-gray-900 truncate">
          {project.name || 'Untitled project'}
        </h2>
        <p className="text-xs text-gray-500 truncate">
          {customer.name}
          {customer.company ? ` · ${customer.company}` : ''}
          {customer.address ? ` · ${customer.address}` : ''}
        </p>
      </div>

      <div className="p-4 space-y-4">
        <ProjectTakeoffSheetsCard
          key={`takeoffs-${project.id}`}
          project={project}
          customer={customer}
          userId={userId}
        />

        <ProjectMeasurementsCard
          key={`measurements-${project.id}`}
          project={project}
          userId={userId}
          onPatch={onPatch}
        />

        <ProjectEstimatesCard
          key={`estimates-${project.id}`}
          project={project}
          customer={customer}
          userId={userId}
          onPatch={onPatch}
        />

        <ProjectPipelineCard
          key={`pipeline-${project.id}`}
          project={project}
          userId={userId}
          onPatch={onPatch}
        />

        <ProjectRemindersCard
          key={`reminders-${project.id}`}
          projectId={project.id}
          projectName={project.name}
          userId={userId}
          customerId={customer.id}
        />
      </div>

      {showOverride && (
        <ProjectNumberOverrideModal
          project={project}
          onClose={() => setShowOverride(false)}
          onUpdated={(patch) => {
            onPatch(patch)
            setShowOverride(false)
          }}
        />
      )}
    </div>
  )
}

