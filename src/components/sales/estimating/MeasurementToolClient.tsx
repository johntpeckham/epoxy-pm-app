'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { RulerIcon, MonitorIcon, ArrowLeftIcon } from 'lucide-react'
import TakeoffProjectList from '@/components/takeoff/TakeoffProjectList'
import TakeoffDashboard from '@/components/takeoff/TakeoffDashboard'
import TakeoffViewer from '@/components/takeoff/TakeoffViewer'
import type {
  TakeoffProject,
  TakeoffItem,
  TakeoffPage,
  Markup,
  SerializedTakeoffProject,
} from '@/components/takeoff/types'

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function serializeProjects(projects: TakeoffProject[]): string {
  const serialized: SerializedTakeoffProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    pages: p.pages.map((pg) => ({
      pdfIndex: pg.pdfIndex,
      pageIndex: pg.pageIndex,
      pdfName: pg.pdfName,
      displayName: pg.displayName,
      thumbnailDataUrl: pg.thumbnailDataUrl,
      pdfBase64: pg.pdfBase64 ?? (pg.arrayBuffer ? arrayBufferToBase64(pg.arrayBuffer) : null),
    })),
    items: p.items,
    pageScales: p.pageScales,
    markups: p.markups,
    pageRenderedSizes: p.pageRenderedSizes,
  }))
  return JSON.stringify(serialized)
}

function deserializeProjects(json: string): TakeoffProject[] {
  try {
    const parsed: SerializedTakeoffProject[] = JSON.parse(json)
    return parsed.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      pages: p.pages.map((pg) => ({
        pdfIndex: pg.pdfIndex,
        pageIndex: pg.pageIndex,
        pdfName: pg.pdfName,
        displayName: pg.displayName,
        thumbnailDataUrl: pg.thumbnailDataUrl,
        pdfBase64: pg.pdfBase64 ?? null,
        arrayBuffer: pg.pdfBase64 ? base64ToArrayBuffer(pg.pdfBase64) : null,
      })),
      items: p.items,
      pageScales: p.pageScales,
      markups: p.markups,
      pageRenderedSizes: p.pageRenderedSizes,
    }))
  } catch {
    return []
  }
}

export default function MeasurementToolClient() {
  const params = useParams()
  const projectId = params.id as string
  const lsKey = `takeoff-projects-${projectId}`

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [projects, setProjects] = useState<TakeoffProject[]>(() => {
    if (typeof window === 'undefined') return []
    const saved = localStorage.getItem(lsKey)
    if (saved) return deserializeProjects(saved)
    const legacy = localStorage.getItem('takeoff-projects')
    return legacy ? deserializeProjects(legacy) : []
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'dashboard' | 'viewer'>('dashboard')
  const [activePage, setActivePage] = useState<TakeoffPage | null>(null)

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null

  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    try {
      localStorage.setItem(lsKey, serializeProjects(projects))
    } catch {
      // localStorage full or unavailable
    }
  }, [projects, lsKey])

  function handleAddProject(name: string) {
    const newProject: TakeoffProject = {
      id: genId(),
      name,
      createdAt: new Date().toISOString(),
      pages: [],
      items: [],
      pageScales: {},
      markups: [],
      pageRenderedSizes: {},
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

  const updateSelected = useCallback(
    (updates: Partial<TakeoffProject>) => {
      if (!selectedId) return
      setProjects((prev) =>
        prev.map((p) => (p.id === selectedId ? { ...p, ...updates } : p))
      )
    },
    [selectedId]
  )

  const handleAddPages = useCallback(
    (newPages: TakeoffPage[]) => {
      if (!selectedProject) return
      updateSelected({ pages: [...selectedProject.pages, ...newPages] })
    },
    [selectedProject, updateSelected]
  )

  const handleDeletePage = useCallback(
    (pdfIndex: number, pageIndex: number) => {
      if (!selectedProject) return
      updateSelected({
        pages: selectedProject.pages.filter(
          (p) => !(p.pdfIndex === pdfIndex && p.pageIndex === pageIndex)
        ),
      })
    },
    [selectedProject, updateSelected]
  )

  const handleRenamePage = useCallback(
    (pdfIndex: number, pageIndex: number, displayName: string) => {
      if (!selectedProject) return
      updateSelected({
        pages: selectedProject.pages.map((p) =>
          p.pdfIndex === pdfIndex && p.pageIndex === pageIndex
            ? { ...p, displayName }
            : p
        ),
      })
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

  const handleCanvasSizeChange = useCallback(
    (pageKey: string, size: { w: number; h: number }) => {
      if (!selectedProject) return
      const existing = selectedProject.pageRenderedSizes?.[pageKey]
      if (existing && Math.abs(existing.w - size.w) < 1 && Math.abs(existing.h - size.h) < 1) return
      updateSelected({
        pageRenderedSizes: { ...(selectedProject.pageRenderedSizes || {}), [pageKey]: size },
      })
    },
    [selectedProject, updateSelected]
  )

  const handleRenameItem = useCallback(
    (itemId: string, newName: string) => {
      if (!selectedProject) return
      updateSelected({
        items: selectedProject.items.map((i) =>
          i.id === itemId ? { ...i, name: newName } : i
        ),
      })
    },
    [selectedProject, updateSelected]
  )

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  let column3Content: React.ReactNode

  if (!selectedProject) {
    column3Content = (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RulerIcon className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-400 text-sm">Select a project to view measurements</p>
        </div>
      </div>
    )
  } else if (viewMode === 'viewer' && activePage) {
    const pageKey = `${activePage.pdfIndex}-${activePage.pageIndex}`
    const latestPage = selectedProject.pages.find(
      (p) => p.pdfIndex === activePage.pdfIndex && p.pageIndex === activePage.pageIndex
    ) ?? activePage
    column3Content = (
      <TakeoffViewer
        key={pageKey}
        page={latestPage}
        pageScale={selectedProject.pageScales[pageKey]}
        items={selectedProject.items}
        markups={selectedProject.markups}
        isFullscreen={isFullscreen}
        pageRenderedSizes={selectedProject.pageRenderedSizes || {}}
        projectName={selectedProject.name}
        onBack={handleBackToDashboard}
        onPageScaleChange={handlePageScaleChange}
        onItemsChange={handleItemsChange}
        onMarkupsChange={handleMarkupsChange}
        onToggleFullscreen={handleToggleFullscreen}
        onCanvasSizeChange={handleCanvasSizeChange}
      />
    )
  } else {
    column3Content = (
      <TakeoffDashboard
        key={selectedProject.id}
        projectName={selectedProject.name}
        pages={selectedProject.pages}
        items={selectedProject.items}
        markups={selectedProject.markups}
        pageScales={selectedProject.pageScales}
        pageRenderedSizes={selectedProject.pageRenderedSizes || {}}
        onAddPages={handleAddPages}
        onOpenPage={handleOpenPage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
        onRenameItem={handleRenameItem}
      />
    )
  }

  const showViewerOverlay = viewMode === 'viewer' && activePage && selectedProject

  if (isMobile) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MonitorIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Desktop Only Feature</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            The Measurement Tool is designed for desktop use. Please open this page on a desktop or laptop for the best experience.
          </p>
        </div>
      </div>
    )
  }

  if (isFullscreen && showViewerOverlay) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {column3Content}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden w-full max-w-full">
      <div className="flex items-center gap-2 bg-white dark:bg-[#242424] border-b border-gray-200 dark:border-[#2a2a2a] flex-shrink-0 px-4 sm:px-6 py-3">
        <Link href={`/sales/estimating?project=${projectId}`} className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
        <RulerIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <span className="text-2xl font-bold text-gray-900 dark:text-white">Measurement Tool</span>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <TakeoffProjectList
          projects={projects}
          selectedId={selectedId}
          onSelect={handleSelectProject}
          onAdd={handleAddProject}
          onDelete={handleDeleteProject}
          onRename={handleRenameProject}
        />
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-gray-50 flex flex-col">
          {!showViewerOverlay && column3Content}
        </div>

        {showViewerOverlay && (
          <div
            className="fixed top-0 bottom-0 right-0 left-0 lg:left-56 z-40 bg-white flex flex-col"
          >
            {column3Content}
          </div>
        )}
      </div>
    </div>
  )
}
