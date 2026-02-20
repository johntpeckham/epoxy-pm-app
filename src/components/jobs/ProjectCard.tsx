import Link from 'next/link'
import { MapPinIcon, UserIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { Project } from '@/types'

interface ProjectCardProps {
  project: Project
  onEdit: (project: Project) => void
  onDelete: (project: Project) => void
}

export default function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  return (
    <div className="relative group bg-white rounded-xl border border-gray-200 hover:border-amber-300 hover:shadow-md transition-all duration-150">
      <Link href={`/projects/${project.id}`} className="block p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-semibold text-gray-900 group-hover:text-amber-600 transition-colors truncate">
                {project.name}
              </h3>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                  project.status === 'Active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {project.status}
              </span>
            </div>

            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <UserIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{project.client_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{project.address}</span>
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* Edit / Delete action buttons */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.preventDefault(); onEdit(project) }}
          title="Edit project"
          className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
        >
          <PencilIcon className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.preventDefault(); onDelete(project) }}
          title="Delete project"
          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
        >
          <Trash2Icon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
