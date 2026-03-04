'use client'

import { useState, useCallback } from 'react'
import { RulerIcon } from 'lucide-react'
import TakeoffProjectList from '@/components/takeoff/TakeoffProjectList'
import TakeoffDashboard from '@/components/takeoff/TakeoffDashboard'
import TakeoffViewer from '@/components/takeoff/TakeoffViewer'
import type { TakeoffProject, TakeoffItem, TakeoffPage, Markup } from '@/components/takeoff/types'

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export default function JobTakeoffPage() {
  const [projects, setProjects] = useState<TakeoffProject[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // View mode: dashboard shows summary + thumbnails, viewer shows single page
  const [viewMode, setViewMode] = useState<'dashboard' | 'viewer'>('dashboard')
  const [activePage, setActivePage] = useState<TakeoffPage | null>(null)

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null

  // ─── Project CRUD ───

  function handleAddProject(name: string) {
    const newProject: TakeoffProject = {
      id: genId(),
      name,
      createdAt: new Date().toISOString(),
      pages: [],
      items: [],
      pageScales: {},
      markups: [],
    }
    setProjects((prev) => [newProject, ...prev])
    setSelectedId(newProject.id)
    setViewMode('dashboard')
    setActivePage(null)
  }

  function handleDeleteProject(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
      setViewMode('dashboard')
      setActivePage(null)
    }
  }

  function handleRenameProject(id: string, name: string) {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    )
  }

  function handleSelectProject(id: string) {
    setSelectedId(id)
    setViewMode('dashboard')
    setActivePage(null)
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

  // ─── Dashboard handlers ───

  const handleAddPages = useCallback(
    (newPages: TakeoffPage[]) => {
      if (!selectedProject) return
      updateSelected({ pages: [...selectedProject.pages, ...newPages] })
    },
    [selectedProject, updateSelected]
  )

  const handleOpenPage = useCallback((page: TakeoffPage) => {
    setActivePage(page)
    setViewMode('viewer')
  }, [])

  const handleBackToDashboard = useCallback(() => {
    setViewMode('dashboard')
    setActivePage(null)
  }, [])

  // ─── Viewer handlers ───

  const handlePageScaleChange = useCallback(
    (pixelsPerFoot: number) => {
      if (!selectedProject || !activePage) return
      const key = `${activePage.pdfIndex}-${activePage.pageIndex}`
      updateSelected({
        pageScales: { ...selectedProject.pageScales, [key]: pixelsPerFoot },
      })
    },
    [selectedProject, activePage, updateSelected]
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

  let column3Content: React.ReactNode

  if (!selectedProject) {
    column3Content = (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RulerIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-400 text-sm">Select a project to view the takeoff</p>
        </div>
      </div>
    )
  } else if (viewMode === 'viewer' && activePage) {
    const pageKey = `${activePage.pdfIndex}-${activePage.pageIndex}`
    column3Content = (
      <TakeoffViewer
        key={pageKey}
        page={activePage}
        pageScale={selectedProject.pageScales[pageKey]}
        items={selectedProject.items}
        markups={selectedProject.markups}
        isFullscreen={isFullscreen}
        onBack={handleBackToDashboard}
        onPageScaleChange={handlePageScaleChange}
        onItemsChange={handleItemsChange}
        onMarkupsChange={handleMarkupsChange}
        onToggleFullscreen={handleToggleFullscreen}
      />
    )
  } else {
    column3Content = (
      <TakeoffDashboard
        key={selectedProject.id}
        pages={selectedProject.pages}
        items={selectedProject.items}
        pageScales={selectedProject.pageScales}
        onAddPages={handleAddPages}
        onOpenPage={handleOpenPage}
      />
    )
  }

  // ─── Fullscreen mode ───

  if (isFullscreen && selectedProject && viewMode === 'viewer' && activePage) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {column3Content}
      </div>
    )
  }

  // ─── Normal two-column layout ───

  return (
    <div className="flex h-full overflow-hidden w-full max-w-full">
      {/* Column 2: Project list */}
      <TakeoffProjectList
        projects={projects}
        selectedId={selectedId}
        onSelect={handleSelectProject}
        onAdd={handleAddProject}
        onDelete={handleDeleteProject}
        onRename={handleRenameProject}
      />

      {/* Column 3: Dashboard or Viewer */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-gray-50 flex flex-col">
        {column3Content}
      </div>
    </div>
  )
}
