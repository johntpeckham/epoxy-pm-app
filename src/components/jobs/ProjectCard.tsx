import { MapPinIcon, UserIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { Project } from '@/types'

interface ProjectCardProps {
  project: Project
  isSelected?: boolean
  onSelect: (project: Project) => void
  onEdit: (project: Project) => void
  onDelete: (project: Project) => void
}

export default function ProjectCard({
  project,
  isSelected = false,
  onSelect,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  return (
    <div
      className={`relative group rounded-xl border transition-all duration-150 cursor-pointer ${
        isSelected
          ? 'bg-amber-50 border-amber-400 shadow-sm'
          : 'bg-white border-gray-200 hover:border-amber-300 hover:shadow-sm'
      }`}
    >
      {/* Selected indicator bar */}
      {isSelected && (
        <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-amber-500 rounded-full" />
      )}

      {/* Main clickable body */}
      <button
        onClick={() => onSelect(project)}
        className="w-full text-left p-4 pl-5"
      >
        <div className="flex items-start gap-2 pr-12">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`text-sm font-semibold truncate transition-colors ${
                  isSelected ? 'text-amber-700' : 'text-gray-900 group-hover:text-amber-600'
                }`}
              >
                {project.name}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                  project.status === 'Active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {project.status}
              </span>
            </div>

            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <UserIcon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{project.client_name}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <MapPinIcon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{project.address}</span>
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Edit / Delete — hover visible */}
      <div className="absolute top-2.5 right-2 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(project) }}
          title="Edit project"
          className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-100 transition"
        >
          <PencilIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(project) }}
          title="Delete project"
          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-100 transition"
        >
          <Trash2Icon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
