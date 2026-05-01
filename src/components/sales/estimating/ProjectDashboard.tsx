'use client'

import { useState } from 'react'
import { PencilIcon, ChevronLeftIcon } from 'lucide-react'
import type { Customer } from '@/components/proposals/types'
import type { EstimatingProject } from './types'
import { usePermissions } from '@/lib/usePermissions'
import ProjectEstimatesCard from './ProjectEstimatesCard'
import ProjectMeasurementsCard from './ProjectMeasurementsCard'
import ProjectProposalsCard from './ProjectProposalsCard'
import ProjectRemindersCard from './ProjectRemindersCard'
import ProjectNumberOverrideModal from './ProjectNumberOverrideModal'
import EditProjectModal from './EditProjectModal'
import { formatAddressLine } from './ProjectAddressFields'

interface ProjectDashboardProps {
  project: EstimatingProject
  customer: Customer
  userId: string
  onPatch: (patch: Partial<EstimatingProject>) => void
  onBack: () => void
}

export default function ProjectDashboard({
  project,
  customer,
  userId,
  onPatch,
  onBack,
}: ProjectDashboardProps) {
  const { canEdit } = usePermissions()
  // Project number override was previously admin-only. Now surfaces for any
  // user with edit access to estimating (admin retains it via shortcut).
  const canOverrideProjectNumber = canEdit('estimating')
  const canEditProject = canEdit('estimating')
  const [showOverride, setShowOverride] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  // Compose the project's structured address into a single display line.
  // Falls back to the customer's single-line address only if the project
  // has no structured fields (legacy projects pre-migration backfill).
  const projectAddressLine = formatAddressLine({
    street: project.project_address_street ?? '',
    city: project.project_address_city ?? '',
    state: project.project_address_state ?? '',
    zip: project.project_address_zip ?? '',
  })

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="px-4 py-4 border-b border-gray-200 bg-white relative">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition mb-2"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Back to customers
          </button>
          {canEditProject && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              title="Edit project"
              aria-label="Edit project"
              className="text-gray-400 hover:text-amber-600 hover:bg-amber-50 p-1.5 rounded-md transition flex-shrink-0"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        {project.project_number && (
          <div className="mb-1">
            {canOverrideProjectNumber ? (
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
          {projectAddressLine ? ` · ${projectAddressLine}` : ''}
        </p>
      </div>

      <div className="p-4 space-y-4">
        <ProjectMeasurementsCard
          key={`measurements-${project.id}`}
          project={project}
        />

        <ProjectEstimatesCard
          key={`estimates-${project.id}`}
          project={project}
          customer={customer}
          userId={userId}
        />

        <ProjectProposalsCard
          key={`proposals-${project.id}`}
          project={project}
          customer={customer}
          userId={userId}
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

      {showEdit && (
        <EditProjectModal
          project={project}
          customer={customer}
          onClose={() => setShowEdit(false)}
          onUpdated={(patch) => onPatch(patch)}
        />
      )}
    </div>
  )
}

