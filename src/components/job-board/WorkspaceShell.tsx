'use client'

import { ArrowLeftIcon } from 'lucide-react'

interface WorkspaceShellProps {
  title: string
  icon: React.ReactNode
  onBack: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}

export default function WorkspaceShell({ title, icon, onBack, actions, children }: WorkspaceShellProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors text-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-amber-500">{icon}</span>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
