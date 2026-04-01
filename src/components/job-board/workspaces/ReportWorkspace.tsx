'use client'

import { ClipboardListIcon } from 'lucide-react'
import { Project } from '@/types'
import type { UserRole } from '@/types'
import WorkspaceShell from '../WorkspaceShell'
import ProjectReportModal from '@/components/reports/ProjectReportModal'

interface ReportWorkspaceProps {
  project: Project
  userId: string
  userRole?: UserRole
  onBack: () => void
}

export default function ReportWorkspace({ project, userId, userRole, onBack }: ReportWorkspaceProps) {
  return (
    <WorkspaceShell
      title="Job Report"
      icon={<ClipboardListIcon className="w-5 h-5" />}
      onBack={onBack}
    >
      {/* Immediately open the report modal */}
      <ProjectReportModal
        projectId={project.id}
        projectName={project.name}
        clientName={project.client_name}
        address={project.address}
        estimateNumber={project.estimate_number ?? ''}
        userId={userId}
        userRole={userRole}
        onClose={onBack}
      />
    </WorkspaceShell>
  )
}
