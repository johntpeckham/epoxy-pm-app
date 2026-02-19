import Link from 'next/link'
import { MapPinIcon, UserIcon, ChevronRightIcon } from 'lucide-react'
import { Project } from '@/types'

interface ProjectCardProps {
  project: Project
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-white rounded-xl border border-gray-200 hover:border-amber-300 hover:shadow-md transition-all duration-150 group"
    >
      <div className="p-5">
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
          <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-amber-400 flex-shrink-0 mt-0.5 transition-colors" />
        </div>
      </div>
    </Link>
  )
}
