'use client'

import { SettingsIcon } from 'lucide-react'
import { Project } from '@/types'

interface JobInfoDashboardCardProps {
  project: Project
  onEdit: () => void
}

export default function JobInfoDashboardCard({ project, onEdit }: JobInfoDashboardCardProps) {
  const labelCls = 'text-[10px] font-semibold text-gray-400 uppercase tracking-wide'
  const valueCls = 'text-sm text-gray-900 mt-0.5'
  const emptyValue = <span className="text-sm text-gray-300">—</span>

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return null
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-500"><SettingsIcon className="w-5 h-5" /></span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Job Info</h3>

        {/* Edit button */}
        <button
          onClick={onEdit}
          className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
          title="Edit project"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
        {/* Project Name — full width */}
        <div className="sm:col-span-2">
          <div className={labelCls}>Project Name</div>
          <div className={valueCls}>{project.name || emptyValue}</div>
        </div>

        {/* Customer */}
        <div>
          <div className={labelCls}>Customer</div>
          <div className={valueCls}>{project.client_name || emptyValue}</div>
        </div>

        {/* Estimate # */}
        <div>
          <div className={labelCls}>Estimate #</div>
          <div className={valueCls}>{project.estimate_number || emptyValue}</div>
        </div>

        {/* Address — full width */}
        <div className="sm:col-span-2">
          <div className={labelCls}>Address</div>
          <div className={valueCls}>{project.address || emptyValue}</div>
        </div>

        {/* Status */}
        <div>
          <div className={labelCls}>Status</div>
          <div className="mt-0.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              project.status === 'Active'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {project.status}
            </span>
          </div>
        </div>

        {/* Crew */}
        <div>
          <div className={labelCls}>Crew</div>
          <div className={valueCls}>{project.crew || emptyValue}</div>
        </div>

        {/* Start Date */}
        <div>
          <div className={labelCls}>Start Date</div>
          <div className={valueCls}>{formatDate(project.start_date) || emptyValue}</div>
        </div>

        {/* End Date */}
        <div>
          <div className={labelCls}>End Date</div>
          <div className={valueCls}>{formatDate(project.end_date) || emptyValue}</div>
        </div>

        {/* Drive Time */}
        <div>
          <div className={labelCls}>Drive Time</div>
          <div className={valueCls}>
            {project.drive_time_enabled
              ? `${project.drive_time_days ?? 1} day${(project.drive_time_days ?? 1) !== 1 ? 's' : ''} — ${project.drive_time_position ?? 'both'}`
              : emptyValue}
          </div>
        </div>

        {/* Color */}
        <div>
          <div className={labelCls}>Color</div>
          <div className="mt-0.5">
            {project.color ? (
              <span className="inline-block w-5 h-5 rounded-full border border-gray-200" style={{ backgroundColor: project.color }} />
            ) : emptyValue}
          </div>
        </div>

        {/* Notes — full width */}
        <div className="sm:col-span-2">
          <div className={labelCls}>Notes</div>
          <div className={`${valueCls} whitespace-pre-wrap`}>{project.notes || emptyValue}</div>
        </div>
      </div>
    </div>
  )
}
