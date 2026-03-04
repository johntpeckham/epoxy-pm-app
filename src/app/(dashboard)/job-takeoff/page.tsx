'use client'

import { useState, useCallback } from 'react'
import { RulerIcon } from 'lucide-react'
import TakeoffProjectList from '@/components/takeoff/TakeoffProjectList'
import TakeoffViewer from '@/components/takeoff/TakeoffViewer'
import type { TakeoffProject, TakeoffItem, PageScale, Markup } from '@/components/takeoff/types'

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export default function JobTakeoffPage() {
  const [projects, setProjects] = useState<TakeoffProject[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null

  // ─── Project CRUD ───

  function handleAddProject(name: string) {
    const newProject: TakeoffProject = {
      id: genId(),
      name,
      createdAt: new Date().toISOString(),
      pdfData: null,
      pageCount: 0,
      pageScales: [],
      items: [],
      markups: [],
    }
    setProjects((prev) => [newProject, ...prev])
    setSelectedId(newProject.id)
  }

  function handleDeleteProject(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
    }
  }

  function handleRenameProject(id: string, name: string) {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    )
  }

  // ─── Update selected project fields ───

  const updateSelected = useCallback(
    (updates: Partial<TakeoffProject>) => {
      if (!selectedId) return
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedId ? { ...p, ...updates } : p))
      )
    },
    [selectedId]
  )

  const handlePdfLoaded = useCallback(
    (data: ArrayBuffer, pageCount: number) => {
      updateSelected({ pdfData: data, pageCount })
    },
    [updateSelected]
  )

  const handlePageScalesChange = useCallback(
    (pageScales: PageScale[]) => {
      updateSelected({ pageScales })
    },
    [updateSelected]
  )

  const handleItemsChange = useCallback(
    (items: TakeoffItem[]) => {
      updateSelected({ items })
    },
    [updateSelected]
  )

  const handleMarkupsChange = useCallback(
    (markups: Markup[]) => {
      updateSelected({ markups })
    },
    [updateSelected]
  )

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  // ─── Column 3 content ───

  const viewerContent = selectedProject ? (
    <TakeoffViewer
      key={selectedProject.id}
      pdfData={selectedProject.pdfData}
      pageScales={selectedProject.pageScales}
      items={selectedProject.items}
      markups={selectedProject.markups}
      isFullscreen={isFullscreen}
      onPdfLoaded={handlePdfLoaded}
      onPageScalesChange={handlePageScalesChange}
      onItemsChange={handleItemsChange}
      onMarkupsChange={handleMarkupsChange}
      onToggleFullscreen={handleToggleFullscreen}
    />
  ) : (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <RulerIcon className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-gray-400 text-sm">Select a project to view the takeoff</p>
      </div>
    </div>
  )

  // ─── Fullscreen mode ───

  if (isFullscreen && selectedProject) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {viewerContent}
      </div>
    )
  }

  // ─── Normal three-column layout ───

  return (
    <div className="flex h-full overflow-hidden w-full max-w-full">
      {/* Column 2: Project list */}
      <TakeoffProjectList
        projects={projects}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAdd={handleAddProject}
        onDelete={handleDeleteProject}
        onRename={handleRenameProject}
      />

      {/* Column 3: Takeoff viewer */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-gray-50 flex flex-col">
        {viewerContent}
      </div>
    </div>
  )
}
