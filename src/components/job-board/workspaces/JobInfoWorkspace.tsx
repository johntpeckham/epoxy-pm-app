'use client'

import { SettingsIcon, PencilIcon, MapPinIcon, UserIcon, CalendarIcon, UsersIcon, FileTextIcon } from 'lucide-react'
import { Project } from '@/types'
import WorkspaceShell from '../WorkspaceShell'
import { displayProjectCustomer } from '@/lib/displayProjectCustomer'

interface JobInfoWorkspaceProps {
  project: Project
  onBack: () => void
  onEdit: () => void
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function JobInfoWorkspace({ project, onBack, onEdit }: JobInfoWorkspaceProps) {
  return (
    <WorkspaceShell
      title="Job Info"
      icon={<SettingsIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PencilIcon className="w-4 h-4" />
          Edit Project
        </button>
      }
    >
      <div className="p-4 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <InfoRow label="Project Name" value={project.proposal_number ? `Proposal #${project.proposal_number} - ${project.name}` : project.name} icon={<FileTextIcon className="w-4 h-4" />} />
          <InfoRow label="Customer" value={displayProjectCustomer(project)} icon={<UserIcon className="w-4 h-4" />} />
          <InfoRow label="Address" value={project.address} icon={<MapPinIcon className="w-4 h-4" />} />
          <InfoRow
            label="Status"
            value={
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                project.status === 'Active' ? 'bg-green-100 text-green-700' : project.status === 'Completed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {project.status}
              </span>
            }
          />
          {project.proposal_number && (
            <InfoRow label="Proposal Number" value={project.proposal_number} />
          )}
          <InfoRow label="Start Date" value={formatDate(project.start_date)} icon={<CalendarIcon className="w-4 h-4" />} />
          <InfoRow label="End Date" value={formatDate(project.end_date)} />
          {project.crew && (
            <InfoRow label="Crew" value={project.crew} icon={<UsersIcon className="w-4 h-4" />} />
          )}
          {project.notes && (
            <InfoRow label="Notes" value={project.notes} />
          )}
          {project.drive_time_enabled && (
            <>
              <InfoRow label="Drive Time" value={`${project.drive_time_days ?? 1} day(s) — ${project.drive_time_position ?? 'front'}`} />
            </>
          )}
        </div>
      </div>
    </WorkspaceShell>
  )
}

function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <div className="text-sm text-gray-900 mt-0.5">{value}</div>
      </div>
    </div>
  )
}
