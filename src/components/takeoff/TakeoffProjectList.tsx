'use client'

import { useState, useRef, useEffect } from 'react'
import { PlusIcon, RulerIcon, Trash2Icon, PencilIcon, CheckIcon, XIcon } from 'lucide-react'
import type { TakeoffProject } from './types'

interface TakeoffProjectListProps {
  projects: TakeoffProject[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (name: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TakeoffProjectList({
  projects,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  onRename,
}: TakeoffProjectListProps) {
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)

  function handleCreate() {
    if (!newName.trim()) return
    onAdd(newName.trim())
    setNewName('')
    setShowModal(false)
  }

  function handleStartRename(project: TakeoffProject) {
    setEditingId(project.id)
    setEditName(project.name)
  }

  function handleFinishRename(id: string) {
    if (editName.trim()) {
      onRename(id, editName.trim())
    }
    setEditingId(null)
  }

  // Close modal on outside click
  useEffect(() => {
    if (!showModal) return
    function handleClick(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowModal(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showModal])

  return (
    <>
      <div className="flex-shrink-0 w-80 min-w-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-900">Project Takeoffs</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New
            </button>
          </div>
        </div>

        {/* Projects list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {projects.length === 0 && (
            <div className="text-center py-12">
              <RulerIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No takeoffs yet.</p>
              <p className="text-sm text-gray-400">Create one to get started.</p>
            </div>
          )}

          {projects.map((project) => {
            const isSelected = project.id === selectedId
            return (
              <div
                key={project.id}
                onClick={() => onSelect(project.id)}
                className={`relative group rounded-xl border transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-gray-50 border-gray-300 shadow-sm'
                    : 'bg-white border-gray-200 hover:border-amber-300 hover:shadow-sm'
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-amber-500 rounded-full" />
                )}

                <div className="w-full text-left p-3 pl-4">
                  {editingId === project.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishRename(project.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="flex-1 px-2 py-0.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleFinishRename(project.id)
                        }}
                        className="p-1 text-green-600 hover:text-green-500"
                      >
                        <CheckIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className={`text-sm font-semibold truncate ${
                        isSelected ? 'text-amber-700' : 'text-gray-900 group-hover:text-amber-600'
                      }`}>
                        {project.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>{formatDate(project.createdAt)}</span>
                        <span>{project.pages.length > 0 ? `${project.pages.length} page${project.pages.length !== 1 ? 's' : ''}` : 'No PDF'}</span>
                      </div>
                    </>
                  )}
                </div>

                {editingId !== project.id && (
                  <div className="absolute top-2.5 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartRename(project)
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-100"
                      title="Rename"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(project.id)
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-100"
                      title="Delete"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* New Project Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            ref={modalRef}
            className="bg-white rounded-xl shadow-xl w-[400px] p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Takeoff Project</h2>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Project name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setShowModal(false); setNewName('') }
              }}
              placeholder="e.g. Valley Kitchen Floor"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowModal(false); setNewName('') }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
