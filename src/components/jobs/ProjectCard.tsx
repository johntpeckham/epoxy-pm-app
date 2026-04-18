import { memo } from 'react'
import { UserIcon, PencilIcon, Trash2Icon, PinIcon } from 'lucide-react'
import { Project } from '@/types'

interface ProjectCardProps {
  project: Project
  isSelected?: boolean
  onSelect: (project: Project) => void
  onEdit?: (project: Project) => void
  onDelete?: (project: Project) => void
  showEditDelete?: boolean
  isPinned?: boolean
  onTogglePin?: (project: Project) => void
}

export default memo(function ProjectCard({
  project,
  isSelected = false,
  onSelect,
  onEdit,
  onDelete,
  showEditDelete = true,
  isPinned = false,
  onTogglePin,
}: ProjectCardProps) {
  return (
    <div
      className={`relative group rounded-lg border transition cursor-pointer ${
        isSelected
          ? 'border-gray-300 bg-gray-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {/* Selected indicator bar */}
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-amber-500" />
      )}

      {/* Main clickable body */}
      <button
        onClick={() => onSelect(project)}
        className="w-full text-left p-3"
      >
        <div className="flex items-start gap-2 pr-10">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {project.name}
            </p>

            <div className="mt-1">
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <UserIcon className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{project.client_name}</span>
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Action icons — hover visible */}
      <div className="absolute top-2.5 right-2 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {onTogglePin && (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(project) }}
            title={isPinned ? 'Unpin project' : 'Pin project'}
            className={`p-1.5 rounded-lg transition ${
              isPinned
                ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-100'
                : 'text-gray-400 hover:text-amber-600 hover:bg-amber-100'
            }`}
          >
            <PinIcon className={`w-4 h-4 ${isPinned ? 'fill-current' : ''}`} />
          </button>
        )}
        {showEditDelete && onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(project) }}
            title="Edit project"
            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-100 transition"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
        )}
        {showEditDelete && onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(project) }}
            title="Delete project"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 transition"
          >
            <Trash2Icon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
})
