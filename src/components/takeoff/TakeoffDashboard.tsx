'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PlusIcon, RulerIcon, SquareIcon, XIcon, Loader2Icon, AlertCircleIcon, Pencil, DownloadIcon, SendIcon, GripVerticalIcon, Trash2Icon } from 'lucide-react'
import KebabMenu from '@/components/ui/KebabMenu'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TakeoffPage, TakeoffItem, Markup, TakeoffSection } from './types'
import {
  computeProjectTotals,
  computeTotals,
  groupItemsBySection,
  sortSections,
} from './sectionTotals'
import { exportFullReport } from './takeoffExport'
import PushPlansModal from './PushPlansModal'
import ReportPreviewModal from '@/components/ui/ReportPreviewModal'
import type { PdfPreviewData } from '@/components/ui/ReportPreviewModal'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

import { CheckIcon } from 'lucide-react'

interface TakeoffDashboardProps {
  projectName: string
  pages: TakeoffPage[]
  items: TakeoffItem[]
  markups: Markup[]
  pageScales: Record<string, number>
  pageRenderedSizes: Record<string, { w: number; h: number }>
  onAddPages: (pages: TakeoffPage[]) => void
  /**
   * When provided, the "Add PDF" card delegates the upload to this handler
   * (which should persist the file to Supabase and update pages itself).
   * When omitted, the card falls back to in-memory base64 (legacy path).
   */
  onUploadPdf?: (file: File) => Promise<void>
  onOpenPage: (page: TakeoffPage) => void
  onDeletePage: (pdfIndex: number, pageIndex: number) => void
  onRenamePage: (pdfIndex: number, pageIndex: number, displayName: string) => void
  onRenameItem: (itemId: string, newName: string) => void
  /** Legacy single-level reorder hook. Kept on the interface for callers
   *  that haven't migrated; the dashboard now uses the section-aware
   *  reorder via onReorderItemsInSections. */
  onReorderItems?: (orderedIds: string[]) => void
  /** When false, the drag handles are hidden / disabled. */
  canEditItems?: boolean
  /** Sections + section CRUD plumbed through from TakeoffClient. Same
   *  handlers as the in-PDF sidebar — no duplication. */
  sections: TakeoffSection[]
  onCreateSection: (name: string) => string
  onRenameSection: (id: string, name: string) => void
  onDeleteSection: (id: string) => void
  onReorderSections: (orderedIds: string[]) => void
  onReorderItemsInSections: (
    sectionIdToOrderedItemIds: Record<string, string[]>
  ) => void
}

// ─── Thumbnail card ───

function PageThumbnail({
  page,
  onClick,
  onDelete,
  onRename,
  isWorkedOn,
}: {
  page: TakeoffPage
  onClick: () => void
  onDelete: () => void
  onRename: (name: string) => void
  isWorkedOn: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const displayName = page.displayName || `Page ${page.pageIndex + 1}`

  useEffect(() => {
    if (page.thumbnailDataUrl && canvasRef.current) {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        setLoading(false)
      }
      img.src = page.thumbnailDataUrl
      return
    }

    if (!page.arrayBuffer) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function render() {
      try {
        const doc = await pdfjsLib.getDocument({ data: page.arrayBuffer!.slice(0) }).promise
        const pdfPage = await doc.getPage(page.pageIndex + 1)
        const viewport = pdfPage.getViewport({ scale: 0.3 })
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
        if (!cancelled) setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    render()
    return () => { cancelled = true }
  }, [page])

  function startEditing() {
    setEditValue(displayName)
    setEditing(true)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }

  function commitEdit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== displayName) {
      onRename(trimmed)
    }
    setEditing(false)
  }

  function cancelEdit() {
    setEditing(false)
  }

  return (
    <div className="relative group" style={{ width: 90 }}>
      {/* Green checkmark badge — top left, when page has measurements/markups */}
      {isWorkedOn && (
        <div className="absolute top-1 left-1 z-10 w-3 h-3 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
          <CheckIcon className="w-2 h-2 text-white" strokeWidth={3} />
        </div>
      )}
      {/* Delete button — top right, visible on hover */}
      {!confirmDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
          className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-black/60 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <XIcon className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 z-20 bg-black/70 rounded-lg flex flex-col items-center justify-center gap-1">
          <p className="text-white text-[9px] font-medium">Remove?</p>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); setConfirmDelete(false) }}
              className="px-1.5 py-0.5 bg-red-500 hover:bg-red-600 text-white text-[9px] font-semibold rounded transition-colors"
            >
              Yes
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
              className="px-1.5 py-0.5 bg-gray-600 hover:bg-gray-500 text-white text-[9px] font-semibold rounded transition-colors"
            >
              No
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onClick}
        className={`w-full flex flex-col items-center bg-white rounded-lg overflow-hidden hover:shadow-md transition-all cursor-pointer ${
          isWorkedOn ? 'border-2 border-green-500 hover:border-green-600' : 'border border-gray-200 hover:border-amber-400'
        }`}
      >
        <div className="w-full h-[110px] bg-gray-100 flex items-center justify-center overflow-hidden relative">
          {loading && <div className="absolute inset-0 bg-gray-100 animate-pulse" />}
          <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
        </div>
      </button>

      {/* Editable name below thumbnail */}
      <div className="mt-0.5 px-0.5">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.currentTarget.blur() }
              if (e.key === 'Escape') { cancelEdit() }
            }}
            className="text-[11px] font-semibold text-center border-b border-amber-500 outline-none bg-transparent w-full max-w-[80px] mx-auto block"
          />
        ) : (
          <div
            onClick={(e) => { e.stopPropagation(); startEditing() }}
            className="group/name flex items-center gap-0.5 justify-center cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 transition-colors"
          >
            <span className="text-[11px] font-semibold text-gray-800 truncate">{displayName}</span>
            <Pencil size={9} className="text-gray-400 group-hover/name:text-amber-500 flex-shrink-0" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Base64 helper ───

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ─── Formatting helpers ───

function fmtFtIn(ft: number): string {
  const f = Math.floor(ft)
  const i = Math.round((ft - f) * 12)
  if (i === 12) return `${f + 1}'-0"`
  return `${f}'-${i}"`
}

function fmtArea(sf: number): string {
  return sf >= 1000 ? `${sf.toLocaleString('en-US', { maximumFractionDigits: 0 })} sq ft` : `${sf.toFixed(1)} sq ft`
}

// ─── Sortable measurement row ───
// Inline so the row's render code (rich layout, inline-rename, type pill,
// totals) stays close to the dashboard. The row owns its useSortable hook
// and the drag handle; rendering of the body is delegated back via a render
// prop to keep one source of truth for layout.

function SortableMeasurementRow({
  itemId,
  isLast,
  draggable,
  children,
}: {
  itemId: string
  isLast: boolean
  draggable: boolean
  children: (handle: {
    setActivatorRef: (el: HTMLElement | null) => void
    listeners: ReturnType<typeof useSortable>['listeners']
    attributes: ReturnType<typeof useSortable>['attributes']
  }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId, disabled: !draggable })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative',
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.12)' : undefined,
    background: isDragging ? '#fff' : undefined,
    borderRadius: isDragging ? 8 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-4 py-2.5 ${!isLast ? 'border-b border-gray-50' : ''}`}
    >
      {children({ setActivatorRef: setActivatorNodeRef, listeners, attributes })}
    </div>
  )
}

// ─── Sortable section wrapper ───
// Outer-level drag handle for a whole section block (header + items +
// subtotals). Mirrors the dnd-kit pattern in TakeoffSidebar.tsx.

function SortableSection({
  sectionId,
  draggable,
  children,
}: {
  sectionId: string
  draggable: boolean
  children: (handle: {
    setActivatorRef: (el: HTMLElement | null) => void
    listeners: ReturnType<typeof useSortable>['listeners']
    attributes: ReturnType<typeof useSortable>['attributes']
  }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionId, disabled: !draggable })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 60 : undefined,
    position: 'relative',
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children({ setActivatorRef: setActivatorNodeRef, listeners, attributes })}
    </div>
  )
}

// ─── Dashboard ───

export default function TakeoffDashboard({
  projectName,
  pages,
  items,
  markups,
  pageScales,
  pageRenderedSizes,
  onAddPages,
  onUploadPdf,
  onOpenPage,
  onDeletePage,
  onRenamePage,
  onRenameItem,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onReorderItems: _onReorderItemsLegacy,
  canEditItems = true,
  sections,
  onCreateSection,
  onRenameSection,
  onDeleteSection,
  onReorderSections,
  onReorderItemsInSections,
}: TakeoffDashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemName, setEditItemName] = useState('')
  const [isDownloadingReport, setIsDownloadingReport] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showPushModal, setShowPushModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // DnD sensors for the Measurements card. PointerSensor with an 8px
  // activation distance keeps inline-rename clicks on the item name from
  // accidentally starting a drag.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ─── Section grouping + totals (shared math via sectionTotals.ts) ──
  const sortedSections = useMemo(() => sortSections(sections), [sections])
  const itemsBySectionId = useMemo(
    () => groupItemsBySection(sortedSections, items),
    [sortedSections, items]
  )
  const projectTotals = useMemo(() => computeProjectTotals(items), [items])

  // Inline section rename state.
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState('')
  const sectionEditInputRef = useRef<HTMLInputElement | null>(null)

  // Outer DragEnd: section reorder.
  const handleSectionDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const ids = sortedSections.map((s) => s.id)
      const fromIndex = ids.indexOf(active.id as string)
      const toIndex = ids.indexOf(over.id as string)
      if (fromIndex < 0 || toIndex < 0) return
      onReorderSections(arrayMove(ids, fromIndex, toIndex))
    },
    [sortedSections, onReorderSections]
  )

  // Inner DragEnd factory: items within a single section. Cross-section
  // drops are detected by inspecting other sections' id lists. Mirrors
  // the pattern in TakeoffSidebar — kept inline rather than extracted
  // because TakeoffDashboard's chrome differs enough that a single
  // shared component would either need many style props or bifurcate.
  const handleItemDragEnd = useCallback(
    (sectionId: string) => (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return
      const sourceItems = itemsBySectionId.get(sectionId) ?? []
      const sourceIds = sourceItems.map((it) => it.id)
      // Same-section reorder
      if (sourceIds.includes(over.id as string)) {
        const fromIndex = sourceIds.indexOf(active.id as string)
        const toIndex = sourceIds.indexOf(over.id as string)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
        const reordered = arrayMove(sourceIds, fromIndex, toIndex)
        const next: Record<string, string[]> = {}
        for (const s of sortedSections) {
          next[s.id] =
            s.id === sectionId
              ? reordered
              : (itemsBySectionId.get(s.id) ?? []).map((it) => it.id)
        }
        onReorderItemsInSections(next)
        return
      }
      // Cross-section drop
      let destSectionId: string | null = null
      let destInsertIdx = 0
      const overAsSection = sortedSections.find((s) => s.id === over.id)
      if (overAsSection) {
        destSectionId = overAsSection.id
        destInsertIdx = (itemsBySectionId.get(destSectionId) ?? []).length
      } else {
        for (const s of sortedSections) {
          if (s.id === sectionId) continue
          const ids = (itemsBySectionId.get(s.id) ?? []).map((it) => it.id)
          const idx = ids.indexOf(over.id as string)
          if (idx >= 0) {
            destSectionId = s.id
            destInsertIdx = idx
            break
          }
        }
      }
      if (!destSectionId) return
      const next: Record<string, string[]> = {}
      for (const s of sortedSections)
        next[s.id] = (itemsBySectionId.get(s.id) ?? []).map((it) => it.id)
      next[sectionId] = next[sectionId].filter((id) => id !== active.id)
      const destIds = next[destSectionId].slice()
      destIds.splice(destInsertIdx, 0, active.id as string)
      next[destSectionId] = destIds
      onReorderItemsInSections(next)
    },
    [sortedSections, itemsBySectionId, onReorderItemsInSections]
  )

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  // Build set of pageKeys that have measurements or markups
  const workedOnPages = new Set<string>()
  for (const item of items) {
    for (const m of item.measurements) {
      workedOnPages.add(m.pageKey)
    }
  }
  for (const mk of markups) {
    workedOnPages.add(mk.pageKey)
  }

  // Project totals are computed via the shared helper above
  // (`projectTotals`). Old per-flat-list totals removed when sections
  // shipped — every surface now uses computeProjectTotals.

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError('Please select a PDF file.')
      setTimeout(() => setUploadError(null), 4000)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    setUploadError(null)

    try {
      if (onUploadPdf) {
        await onUploadPdf(file)
      } else {
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as ArrayBuffer)
          reader.onerror = reject
          reader.readAsArrayBuffer(file)
        })

        const pdfBase64 = arrayBufferToBase64(arrayBuffer)

        const doc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
        const pdfIndex = pages.length > 0 ? Math.max(...pages.map((p) => p.pdfIndex)) + 1 : 0

        const newPages: TakeoffPage[] = []
        for (let i = 0; i < doc.numPages; i++) {
          const pdfPage = await doc.getPage(i + 1)
          const viewport = pdfPage.getViewport({ scale: 0.3 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')!
          await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
          const thumbnailDataUrl = canvas.toDataURL('image/png')

          newPages.push({ pdfIndex, pageIndex: i, pdfName: file.name, thumbnailDataUrl, arrayBuffer, pdfBase64 })
        }

        onAddPages(newPages)
      }
    } catch (err) {
      console.error('[Takeoff] Upload failed:', err)
      setUploadError('Failed to load PDF. Please try a different file.')
      setTimeout(() => setUploadError(null), 4000)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [pages, onAddPages, onUploadPdf])

  const handleDownloadReport = useCallback(async () => {
    setIsDownloadingReport(true)
    setPdfError(null)
    setShowPreview(true)
    setPdfPreview(null)
    try {
      const result = await exportFullReport(projectName, pages, items, pageScales, pageRenderedSizes, sections)
      setPdfPreview({ ...result, title: 'Takeoff Report' })
    } catch (err) {
      console.error('Failed to generate report:', err)
      setPdfError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setIsDownloadingReport(false)
    }
  }, [projectName, pages, items, pageScales, pageRenderedSizes, sections])

  return (
    <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
      {/* Section 0 — Page header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">Takeoff</h1>
          <p className="text-sm text-gray-500 mt-0.5">{projectName}</p>
        </div>
        {pages.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPushModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-amber-500 text-amber-600 hover:bg-amber-50 text-xs font-semibold rounded-lg transition-colors"
            >
              <SendIcon className="w-4 h-4" />
              Push Plans To Job
            </button>
            <button
              onClick={handleDownloadReport}
              disabled={isDownloadingReport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-300 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
            >
              {isDownloadingReport ? (
                <Loader2Icon className="w-4 h-4 animate-spin" />
              ) : (
                <DownloadIcon className="w-4 h-4" />
              )}
              {isDownloadingReport ? 'Generating...' : 'Download Report'}
            </button>
          </div>
        )}
      </div>

      {/* Upload error toast */}
      {uploadError && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700">{uploadError}</span>
        </div>
      )}

      {/* Section 1 — Plan Pages grid */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan Pages</h2>
          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {pages.length}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        {pages.map((page) => {
          const pk = `${page.pdfIndex}-${page.pageIndex}`
          return (
            <PageThumbnail
              key={pk}
              page={page}
              onClick={() => onOpenPage(page)}
              onDelete={() => onDeletePage(page.pdfIndex, page.pageIndex)}
              onRename={(name) => onRenamePage(page.pdfIndex, page.pageIndex, name)}
              isWorkedOn={workedOnPages.has(pk)}
            />
          )
        })}

        {/* Add PDF card — sized to match the smaller PageThumbnail (90 × 126). */}
        <button
          onClick={() => { if (!uploading) fileInputRef.current?.click() }}
          disabled={uploading}
          className="flex flex-col items-center justify-center bg-white rounded-lg border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50/50 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-70"
          style={{ width: 90, height: 126 }}
        >
          {uploading ? (
            <>
              <Loader2Icon className="w-4 h-4 text-amber-500 animate-spin mb-1" />
              <span className="text-[10px] font-medium text-amber-500">Processing…</span>
            </>
          ) : (
            <>
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mb-1">
                <PlusIcon className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <span className="text-[10px] font-medium text-gray-400">Add PDF</span>
            </>
          )}
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
      </div>

      {/* Section 2 — Measurement Items Summary */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-5">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Measurements</h2>
          <span className="text-[11px] font-medium text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {items.length === 0 && sortedSections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4">
            <RulerIcon className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400 text-center">No measurements yet — open a page to start measuring</p>
          </div>
        )}

        {/* Sections: outer DndContext sorts sections; each section has its
            own inner DndContext sorting items + handling cross-section
            drops. */}
        {sortedSections.length > 0 && (
          <div className="bg-gray-50/60 pt-2.5 border-t border-gray-100">
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
            <SortableContext items={sortedSections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {sortedSections.map((section) => {
                const sectionItems = itemsBySectionId.get(section.id) ?? []
                const sub = computeTotals(sectionItems)
                const isRenamingThis = editingSectionId === section.id
                const sectionDraggable = canEditItems && sortedSections.length > 1
                return (
                  <SortableSection key={section.id} sectionId={section.id} draggable={sectionDraggable}>
                    {({ setActivatorRef, listeners, attributes }) => (
                      <div className="mx-3 mb-2.5 rounded-md border border-gray-200 bg-white overflow-hidden">
                        {/* Section header */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
                          {sectionDraggable ? (
                            <button
                              ref={setActivatorRef}
                              type="button"
                              {...listeners}
                              {...attributes}
                              aria-label="Drag to reorder section"
                              className="flex-shrink-0 p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
                            >
                              <GripVerticalIcon className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="w-6" />
                          )}
                          {isRenamingThis ? (
                            <input
                              ref={(el) => { sectionEditInputRef.current = el }}
                              type="text"
                              value={editingSectionName}
                              onChange={(e) => setEditingSectionName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  onRenameSection(section.id, editingSectionName)
                                  setEditingSectionId(null)
                                }
                                if (e.key === 'Escape') setEditingSectionId(null)
                              }}
                              onBlur={() => {
                                onRenameSection(section.id, editingSectionName)
                                setEditingSectionId(null)
                              }}
                              onFocus={(e) => e.target.select()}
                              autoFocus
                              className="flex-1 text-sm font-medium tracking-wide text-gray-900 bg-transparent border-b border-amber-500 outline-none"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingSectionId(section.id)
                                setEditingSectionName(section.name)
                              }}
                              className="flex-1 text-sm font-medium text-gray-900 tracking-wide truncate cursor-pointer hover:text-amber-600"
                            >
                              {section.name}
                            </span>
                          )}
                          <KebabMenu
                            variant="light"
                            title="Section actions"
                            items={[
                              {
                                label: 'Rename',
                                icon: <Pencil size={13} />,
                                onSelect: () => {
                                  setEditingSectionId(section.id)
                                  setEditingSectionName(section.name)
                                },
                              },
                              {
                                label: 'Delete',
                                destructive: true,
                                icon: <Trash2Icon className="w-3.5 h-3.5" />,
                                onSelect: () => {
                                  const count = sectionItems.length
                                  const message =
                                    count > 0
                                      ? `Delete section "${section.name}" and all ${count} measurement${count === 1 ? '' : 's'} inside? This cannot be undone.`
                                      : `Delete section "${section.name}"?`
                                  if (typeof window !== 'undefined' && window.confirm(message)) {
                                    onDeleteSection(section.id)
                                  }
                                },
                              },
                            ]}
                          />
                        </div>

                        {/* Inner DndContext: items within this section. */}
                        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd(section.id)}>
                          <SortableContext items={sectionItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                            {sectionItems.length === 0 ? (
                              <div className="px-4 py-3 text-xs text-gray-400 italic">
                                No measurements in this section
                              </div>
                            ) : (
                              sectionItems.map((item, idx) => {
                                const itemTotal = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)
                                const itemPerim = item.type === 'area'
                                  ? item.measurements.reduce((s, m) => s + (m.perimeterFt || 0), 0)
                                  : 0
                                const isLast = idx === sectionItems.length - 1
                                const dragEnabled = canEditItems
                                return (
                                  <SortableMeasurementRow
                                    key={item.id}
                                    itemId={item.id}
                                    isLast={isLast}
                                    draggable={dragEnabled}
                                  >
                                    {({ setActivatorRef, listeners, attributes }) => (<>
                                    {dragEnabled ? (
                                      <button
                                        ref={setActivatorRef}
                                        type="button"
                                        {...listeners}
                                        {...attributes}
                                        aria-label="Drag to reorder"
                                        className="flex-shrink-0 -ml-1 p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
                                      >
                                        <GripVerticalIcon className="w-4 h-4" />
                                      </button>
                                    ) : (
                                      <span className="w-2" />
                                    )}
                                    <div
                                      className="w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    {editingItemId === item.id ? (
                                      <input
                                        type="text"
                                        value={editItemName}
                                        onChange={(e) => setEditItemName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const trimmed = editItemName.trim()
                                            if (trimmed) onRenameItem(item.id, trimmed)
                                            setEditingItemId(null)
                                          }
                                          if (e.key === 'Escape') setEditingItemId(null)
                                        }}
                                        onBlur={() => {
                                          const trimmed = editItemName.trim()
                                          if (trimmed) onRenameItem(item.id, trimmed)
                                          setEditingItemId(null)
                                        }}
                                        onFocus={(e) => e.target.select()}
                                        className="text-sm font-semibold border-b border-amber-500 outline-none bg-transparent flex-1"
                                        autoFocus
                                      />
                                    ) : (
                                      <span className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0">
                                        {item.name}
                                      </span>
                                    )}
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                                      item.type === 'linear'
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'bg-emerald-50 text-emerald-600'
                                    }`}>
                                      {item.type === 'linear' ? 'Linear' : 'Area'}
                                    </span>
                                    <span className="text-xs text-gray-400 flex-shrink-0 w-28 text-right">
                                      {item.measurements.length} measurement{item.measurements.length !== 1 ? 's' : ''}
                                    </span>
                                    <span className="text-sm font-bold text-gray-900 flex-shrink-0 w-28 text-right">
                                      {item.type === 'linear' ? fmtFtIn(itemTotal) : fmtArea(itemTotal)}
                                    </span>
                                    {item.type === 'area' && itemPerim > 0 && (
                                      <span className="text-xs text-gray-500 flex-shrink-0 w-24 text-right">
                                        {fmtFtIn(itemPerim)} perim.
                                      </span>
                                    )}
                                    <KebabMenu
                                      variant="light"
                                      title="Item actions"
                                      items={[
                                        {
                                          label: 'Rename',
                                          icon: <Pencil size={13} />,
                                          onSelect: () => {
                                            setEditingItemId(item.id)
                                            setEditItemName(item.name)
                                          },
                                        },
                                      ]}
                                    />
                                    </>)}
                                  </SortableMeasurementRow>
                                )
                              })
                            )}
                          </SortableContext>
                        </DndContext>

                        {/* Section subtotals — always shown, even at 0. */}
                        <div className="border-t border-gray-200 bg-gray-50/40">
                          <div className="flex items-center justify-between px-4 py-1.5">
                            <div className="flex items-center gap-2">
                              <RulerIcon className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total Linear</span>
                            </div>
                            <span className="text-[13px] font-bold text-amber-600">{fmtFtIn(sub.linear)}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-100/80">
                            <div className="flex items-center gap-2">
                              <SquareIcon className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total Area</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[13px] font-bold text-amber-600">{fmtArea(sub.area)}</span>
                              {sub.perim > 0 && (
                                <span className="text-[11px] text-gray-500">{fmtFtIn(sub.perim)} perim.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </SortableSection>
                )
              })}
            </SortableContext>
          </DndContext>
          </div>
        )}

        {/* Project totals — always rendered, even at 0. 2px amber top
            border + slightly larger value text emphasize the bottom-line
            summary versus the section subtotals. */}
        <div className="border-t-2 border-amber-500 bg-white">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <RulerIcon className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Project Total Linear</span>
            </div>
            <span className="text-[14px] font-bold text-amber-600">{fmtFtIn(projectTotals.linear)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <SquareIcon className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Project Total Area</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-bold text-amber-600">{fmtArea(projectTotals.area)}</span>
              {projectTotals.perim > 0 && (
                <span className="text-xs text-gray-500">{fmtFtIn(projectTotals.perim)} perim.</span>
              )}
            </div>
          </div>
        </div>

        {/* + Add Section button */}
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => {
              const id = onCreateSection('New Section')
              setEditingSectionId(id)
              setEditingSectionName('New Section')
              setTimeout(() => sectionEditInputRef.current?.focus(), 0)
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-amber-500/40 text-amber-600 hover:bg-amber-50 text-xs font-semibold rounded transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Section
          </button>
        </div>
      </div>


      {/* Push Plans Modal */}
      {showPushModal && (
        <PushPlansModal
          projectName={projectName}
          pages={pages}
          items={items}
          pageScales={pageScales}
          pageRenderedSizes={pageRenderedSizes}
          sections={sections}
          onClose={() => setShowPushModal(false)}
          onSuccess={(jobName) => {
            setShowPushModal(false)
            setToast({ message: `Plans sent to ${jobName}`, type: 'success' })
          }}
          onError={(message) => {
            setShowPushModal(false)
            setToast({ message, type: 'error' })
          }}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[70] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-1 hover:opacity-80">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {showPreview && (
        <ReportPreviewModal
          pdfData={pdfPreview}
          loading={isDownloadingReport}
          error={pdfError}
          title="Takeoff Report"
          onClose={() => { setShowPreview(false); setPdfPreview(null); setPdfError(null) }}
        />
      )}
    </div>
  )
}
