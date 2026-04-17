'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CompassIcon, MonitorIcon } from 'lucide-react'
import type { Customer, Estimate, EstimateSettings } from '../estimates/types'
import type { ProjectTakeoffProject } from './types'
import CustomerListPanel from './CustomerListPanel'
import CustomerProjectsPanel from './CustomerProjectsPanel'
import ProjectsLeftPanel from './ProjectsLeftPanel'
import ProjectWorkspace from './ProjectWorkspace'
import NewProjectModal from './NewProjectModal'

interface ProjectTakeoffClientProps {
  initialCustomers: Customer[]
  initialProjects: ProjectTakeoffProject[]
  initialAllEstimates: Estimate[]
  initialSettings: EstimateSettings | null
  userId: string
}

export default function ProjectTakeoffClient({
  initialCustomers,
  initialProjects,
  initialAllEstimates,
  initialSettings,
  userId,
}: ProjectTakeoffClientProps) {
  const [customers] = useState<Customer[]>(initialCustomers)
  const [projects, setProjects] = useState<ProjectTakeoffProject[]>(initialProjects)
  const [allEstimates, setAllEstimates] = useState<Estimate[]>(initialAllEstimates)
  const [settings] = useState<EstimateSettings | null>(initialSettings)

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showNewProjectModal, setShowNewProjectModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  )

  const customerProjects = useMemo(
    () => projects.filter((p) => p.company_id === selectedCustomerId),
    [projects, selectedCustomerId]
  )

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const customerEstimates = useMemo(
    () =>
      selectedCustomerId
        ? allEstimates.filter((e) => e.company_id === selectedCustomerId)
        : [],
    [allEstimates, selectedCustomerId]
  )

  function handleSelectCustomer(id: string) {
    setSelectedCustomerId(id)
    setSelectedProjectId(null)
  }

  function handleSelectProject(id: string) {
    setSelectedProjectId(id)
  }

  function handleBackToCustomers() {
    setSelectedCustomerId(null)
    setSelectedProjectId(null)
  }

  function handleOpenNewProject() {
    setShowNewProjectModal(true)
  }

  function handleProjectCreated(project: ProjectTakeoffProject) {
    setProjects((prev) => [project, ...prev])
    setSelectedCustomerId(project.company_id)
    setSelectedProjectId(project.id)
    setShowNewProjectModal(false)
  }

  function handleMeasurementsChange(projectId: string, value: string | null) {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, measurements: value } : p))
    )
  }

  async function refreshEstimates() {
    const supabase = createClient()
    const { data } = await supabase
      .from('estimates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setAllEstimates(data as Estimate[])
  }

  if (isMobile) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MonitorIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Desktop Only Feature</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Project Takeoff is designed for desktop use. Please open this page on a desktop or laptop for the best experience.
          </p>
        </div>
      </div>
    )
  }

  const inWorkspace = selectedCustomerId && selectedProjectId && selectedCustomer && selectedProject

  return (
    <div className="flex flex-col h-full w-full max-w-full">
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">Project Takeoff</h1>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {inWorkspace ? (
          <ProjectsLeftPanel
            customer={selectedCustomer}
            projects={customerProjects}
            selectedProjectId={selectedProjectId}
            onSelectProject={handleSelectProject}
            onBack={handleBackToCustomers}
            onNewProject={handleOpenNewProject}
          />
        ) : (
          <CustomerListPanel
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={handleSelectCustomer}
            onNewProject={handleOpenNewProject}
          />
        )}

        <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-gray-50 flex flex-col">
          {inWorkspace ? (
            <ProjectWorkspace
              key={selectedProject.id}
              customer={selectedCustomer}
              project={selectedProject}
              estimates={customerEstimates}
              settings={settings}
              userId={userId}
              customers={customers}
              onMeasurementsChange={(v) => handleMeasurementsChange(selectedProject.id, v)}
              onEstimateCreated={refreshEstimates}
            />
          ) : selectedCustomer ? (
            <CustomerProjectsPanel
              customer={selectedCustomer}
              projects={customerProjects}
              onSelectProject={handleSelectProject}
              onNewProject={handleOpenNewProject}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CompassIcon className="w-7 h-7 text-gray-400" />
                </div>
                <p className="text-sm text-gray-400">
                  Select a customer to view their projects
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewProjectModal && (
        <NewProjectModal
          customers={customers}
          userId={userId}
          preselectedCustomerId={selectedCustomerId}
          onClose={() => setShowNewProjectModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  )
}
