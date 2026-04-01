'use client'

import WorkspaceShell from '../WorkspaceShell'

interface PlaceholderWorkspaceProps {
  title: string
  icon: React.ReactNode
  message: string
  onBack: () => void
}

export default function PlaceholderWorkspace({ title, icon, message, onBack }: PlaceholderWorkspaceProps) {
  return (
    <WorkspaceShell title={title} icon={icon} onBack={onBack}>
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-20">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <span className="text-gray-300">{icon}</span>
        </div>
        <p className="text-gray-500 font-medium">{message}</p>
      </div>
    </WorkspaceShell>
  )
}
