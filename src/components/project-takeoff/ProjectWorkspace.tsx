'use client'

import type { Customer, Estimate, EstimateSettings } from '../estimates/types'
import type { ProjectTakeoffProject } from './types'
import ProjectTakeoffToolCard from './ProjectTakeoffToolCard'
import ProjectEstimatesCard from './ProjectEstimatesCard'
import ProjectMeasurementsCard from './ProjectMeasurementsCard'
import NewEstimateForm from '../estimates/NewEstimateForm'
import { useState } from 'react'

interface ProjectWorkspaceProps {
  customer: Customer
  project: ProjectTakeoffProject
  estimates: Estimate[]
  settings: EstimateSettings | null
  userId: string
  customers: Customer[]
  onMeasurementsChange: (value: string | null) => void
  onEstimateCreated: () => void
}

export default function ProjectWorkspace({
  customer,
  project,
  estimates,
  settings,
  userId,
  customers,
  onMeasurementsChange,
  onEstimateCreated,
}: ProjectWorkspaceProps) {
  const [showNewEstimate, setShowNewEstimate] = useState(false)

  if (showNewEstimate) {
    return (
      <NewEstimateForm
        customers={customers}
        settings={settings}
        userId={userId}
        preselectedCustomerId={customer.id}
        onCreated={() => {
          setShowNewEstimate(false)
          onEstimateCreated()
        }}
        onCancel={() => setShowNewEstimate(false)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-gray-900">{project.name}</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {project.status}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {customer.name}
          {project.description ? ` · ${project.description}` : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <ProjectTakeoffToolCard />
        <ProjectEstimatesCard
          customerName={customer.name}
          estimates={estimates}
          onNewEstimate={() => setShowNewEstimate(true)}
        />
        <ProjectMeasurementsCard
          projectId={project.id}
          initialMeasurements={project.measurements}
          userId={userId}
          onMeasurementsChange={onMeasurementsChange}
        />
      </div>
    </div>
  )
}
