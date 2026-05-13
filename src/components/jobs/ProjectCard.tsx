import { memo } from 'react'
import { UserIcon, PencilIcon, Trash2Icon, PinIcon } from 'lucide-react'
import { Project } from '@/types'
import KebabMenu, { KebabMenuItem } from '@/components/ui/KebabMenu'
import { displayProjectCustomer } from '@/lib/displayProjectCustomer'

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
                <span className="truncate">{displayProjectCustomer(project)}</span>
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Kebab menu — hover visible (matches prior inline-icon pattern) */}
      <div
        className="absolute top-2 right-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <KebabMenu
          variant="light"
          title="Project actions"
          items={(() => {
            const items: KebabMenuItem[] = []
            if (onTogglePin) {
              items.push({
                label: isPinned ? 'Unpin' : 'Pin',
                icon: <PinIcon size={13} className={isPinned ? 'fill-current' : ''} />,
                onSelect: () => onTogglePin(project),
              })
            }
            if (showEditDelete && onEdit) {
              items.push({
                label: 'Edit',
                icon: <PencilIcon size={13} />,
                onSelect: () => onEdit(project),
              })
            }
            if (showEditDelete && onDelete) {
              items.push({
                label: 'Delete',
                icon: <Trash2Icon size={13} />,
                destructive: true,
                onSelect: () => onDelete(project),
              })
            }
            return items
          })()}
        />
      </div>
    </div>
  )
})
