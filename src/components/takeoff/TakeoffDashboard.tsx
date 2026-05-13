'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PlusIcon, RulerIcon, XIcon, Loader2Icon, AlertCircleIcon, Pencil, DownloadIcon, GripVerticalIcon, Trash2Icon } from 'lucide-react'
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
  onDeleteItem: (itemId: string) => void
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

function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`
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
  draggable,
  children,
}: {
  itemId: string
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
  }

  return (
    <div ref={setNodeRef} style={style}>
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
  onDeleteItem,
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
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Batch upload state for the multi-file Add PDF flow. Each entry tracks
  // one File from the user's selection; the queue runner promotes them
  // through pending → uploading → done|failed with a concurrency cap of 4.
  type BatchStatus = 'pending' | 'uploading' | 'done' | 'failed'
  interface BatchFile {
    id: string
    file: File
    name: string
    size: number
    status: BatchStatus
    error?: string
  }
  const [batch, setBatch] = useState<BatchFile[] | null>(null)
  const batchRef = useRef<BatchFile[] | null>(null)
  batchRef.current = batch
  // Tracks whether the queue runner loop is already in flight so retries
  // and re-entry from concurrent state updates don't kick off duplicate
  // workers for the same file.
  const queueRunningRef = useRef(false)
  const BATCH_CONCURRENCY = 4
  // Derived rollups for the inline batch progress display below.
  const batchTotal = batch?.length ?? 0
  const batchDone = batch?.filter((b) => b.status === 'done').length ?? 0
  const batchFailed = batch?.filter((b) => b.status === 'failed').length ?? 0
  const batchActive = batch?.some((b) => b.status === 'pending' || b.status === 'uploading') ?? false
  const batchTotalBytes = batch?.reduce((s, b) => s + b.size, 0) ?? 0
  const batchDoneBytes = batch?.filter((b) => b.status === 'done').reduce((s, b) => s + b.size, 0) ?? 0
  const batchPct = batchTotalBytes > 0 ? Math.round((batchDoneBytes / batchTotalBytes) * 100) : 0
  const batchFailedFiles = batch?.filter((b) => b.status === 'failed') ?? []
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemName, setEditItemName] = useState('')
  const [isDownloadingReport, setIsDownloadingReport] = useState(false)
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
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

  // Single-file upload primitive shared by the queue runner. Mirrors the
  // pre-batch path: prefer the parent-supplied onUploadPdf (Supabase) and
  // otherwise fall back to in-memory base64 (legacy / no projectId).
  const uploadOneFile = useCallback(async (file: File) => {
    if (onUploadPdf) {
      await onUploadPdf(file)
      return
    }
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
    const pdfBase64 = arrayBufferToBase64(arrayBuffer)
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
    const currentPages = pages
    const pdfIndex = currentPages.length > 0 ? Math.max(...currentPages.map((p) => p.pdfIndex)) + 1 : 0
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
  }, [pages, onAddPages, onUploadPdf])

  // Walks the batch state and starts uploads up to the concurrency limit.
  // Re-runs itself after each settle so newly-pending entries from the
  // user clicking Retry get picked up automatically.
  const runBatchQueue = useCallback(() => {
    if (queueRunningRef.current) return
    queueRunningRef.current = true
    const tick = async (): Promise<void> => {
      const current = batchRef.current
      if (!current) {
        queueRunningRef.current = false
        return
      }
      const inFlight = current.filter((b) => b.status === 'uploading').length
      const slots = Math.max(0, BATCH_CONCURRENCY - inFlight)
      const nextUp = current.filter((b) => b.status === 'pending').slice(0, slots)
      if (nextUp.length === 0) {
        // Nothing to start. If nothing is in flight either, the batch has
        // settled. Auto-clear after a short delay if no failures.
        const stillRunning = current.some((b) => b.status === 'uploading')
        if (!stillRunning) {
          queueRunningRef.current = false
          const anyFailed = current.some((b) => b.status === 'failed')
          if (!anyFailed) {
            setTimeout(() => {
              const after = batchRef.current
              if (after && after.every((b) => b.status === 'done')) {
                setBatch(null)
              }
            }, 1500)
          }
        }
        return
      }
      // Mark as uploading optimistically.
      setBatch((prev) => {
        if (!prev) return prev
        const startingIds = new Set(nextUp.map((b) => b.id))
        return prev.map((b) =>
          startingIds.has(b.id) ? { ...b, status: 'uploading' as const, error: undefined } : b
        )
      })
      // Kick off each upload independently; per-file errors don't cascade.
      await Promise.all(
        nextUp.map(async (entry) => {
          try {
            await uploadOneFile(entry.file)
            setBatch((prev) =>
              prev ? prev.map((b) => (b.id === entry.id ? { ...b, status: 'done' as const } : b)) : prev
            )
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed'
            console.error('[Takeoff] Upload failed for', entry.name, err)
            setBatch((prev) =>
              prev
                ? prev.map((b) =>
                    b.id === entry.id ? { ...b, status: 'failed' as const, error: message } : b
                  )
                : prev
            )
          }
        })
      )
      // Yield to React so the state writes above are visible to batchRef
      // before we recurse and pick up the next slot of pending work.
      await new Promise((resolve) => setTimeout(resolve, 0))
      queueRunningRef.current = false
      runBatchQueue()
    }
    void tick()
  }, [uploadOneFile])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    const accepted: BatchFile[] = []
    let rejectedCount = 0
    for (const file of Array.from(fileList)) {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
      if (!isPdf) {
        rejectedCount++
        continue
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        size: file.size,
        status: 'pending',
      })
    }

    if (fileInputRef.current) fileInputRef.current.value = ''

    if (accepted.length === 0) {
      setUploadError(
        rejectedCount > 0
          ? `Selected ${rejectedCount === 1 ? 'file is' : 'files are'} not a PDF.`
          : 'No files selected.'
      )
      setTimeout(() => setUploadError(null), 4000)
      return
    }
    if (rejectedCount > 0) {
      setUploadError(`${rejectedCount} non-PDF file${rejectedCount === 1 ? '' : 's'} skipped.`)
      setTimeout(() => setUploadError(null), 4000)
    } else {
      setUploadError(null)
    }

    setBatch((prev) => {
      // Append to an existing in-flight batch when the user clicks Add PDF
      // again before the prior batch finishes; otherwise start fresh.
      if (prev && prev.some((b) => b.status === 'pending' || b.status === 'uploading' || b.status === 'failed')) {
        return [...prev, ...accepted]
      }
      return accepted
    })
    // Run on a microtask so batchRef has the latest setBatch result.
    setTimeout(() => runBatchQueue(), 0)
  }, [runBatchQueue])

  const handleRetryFile = useCallback((id: string) => {
    setBatch((prev) =>
      prev
        ? prev.map((b) => (b.id === id ? { ...b, status: 'pending' as const, error: undefined } : b))
        : prev
    )
    setTimeout(() => runBatchQueue(), 0)
  }, [runBatchQueue])

  const handleDismissBatch = useCallback(() => {
    // Allow dismiss only when nothing is mid-flight so we don't orphan
    // an active upload's onComplete handler against null state.
    setBatch((prev) => {
      if (!prev) return null
      const stillRunning = prev.some((b) => b.status === 'pending' || b.status === 'uploading')
      return stillRunning ? prev : null
    })
  }, [])

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

      {/* Upload error toast (catastrophic, batch-independent errors) */}
      {uploadError && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertCircleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700">{uploadError}</span>
        </div>
      )}

      {/* Inline batch upload progress — file count + cumulative byte
          progress. The Supabase SDK doesn't expose per-upload byte progress,
          so the bar advances in chunks as each file completes. The file
          count gives a finer-grained signal mid-batch. */}
      {batch && batch.length > 0 && (
        <div className="mb-4 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="text-sm font-medium text-gray-700">
              {batchActive
                ? `Uploading ${batchDone} of ${batchTotal} file${batchTotal === 1 ? '' : 's'}`
                : `${batchDone} of ${batchTotal} complete${batchFailed > 0 ? ` (${batchFailed} failed)` : ''}`}
            </div>
            {!batchActive && (
              <button
                onClick={handleDismissBatch}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                {batchFailed > 0 ? 'Dismiss' : 'Done'}
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-xs text-gray-500 tabular-nums">
              {batchPct}% — {humanFileSize(batchDoneBytes)} of {humanFileSize(batchTotalBytes)}
            </span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-[width] duration-200"
              style={{ width: `${batchPct}%` }}
            />
          </div>
          {batchFailedFiles.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
              {batchFailedFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-xs">
                  <AlertCircleIcon className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-gray-700 truncate flex-1 min-w-0" title={f.name}>{f.name}</span>
                  <span className="text-red-600 truncate max-w-[40%]" title={f.error}>{f.error || 'Upload failed'}</span>
                  <button
                    onClick={() => handleRetryFile(f.id)}
                    className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-medium transition-colors flex-shrink-0"
                  >
                    Retry
                  </button>
                </div>
              ))}
            </div>
          )}
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
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center bg-white rounded-lg border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50/50 transition-all cursor-pointer"
          style={{ width: 90, height: 126 }}
        >
          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mb-1">
            <PlusIcon className="w-3.5 h-3.5 text-gray-400" />
          </div>
          <span className="text-[10px] font-medium text-gray-400">Add PDF</span>
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" multiple onChange={handleFileUpload} className="hidden" />
      </div>

      {/* Section 2 — Measurement Items Summary (flat 3-column table) */}
      <div className="bg-white dark:bg-[#242424] rounded-lg border border-gray-200 dark:border-[#3a3a3a] shadow-sm mb-5">
        {/* Title row */}
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-[#e5e5e5]">Measurements</h2>
          <span className="text-[11px] font-medium text-gray-400 dark:text-[#a0a0a0] bg-gray-100 dark:bg-[#2e2e2e] rounded-full px-2.5 py-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {items.length === 0 && sortedSections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 border-t border-gray-200 dark:border-[#3a3a3a]">
            <RulerIcon className="w-8 h-8 text-gray-300 dark:text-[#6b6b6b] mb-2" />
            <p className="text-sm text-gray-400 dark:text-[#a0a0a0] text-center">No measurements yet — open a page to start measuring</p>
          </div>
        )}

        {sortedSections.length > 0 && (
          <>
            {/* Column header row — vertical dividers begin at Linear & Area */}
            <div
              className="grid items-center pl-8 pr-10 border-b border-gray-200/60 dark:border-[#3a3a3a]/60"
              style={{ gridTemplateColumns: '1fr 110px 110px' }}
            >
              <div />
              <div className="border-l border-gray-200/60 dark:border-[#3a3a3a]/60 text-right py-1.5 pr-3 text-[10px] uppercase tracking-[0.08em] text-gray-500 dark:text-[#a0a0a0]">
                Linear
              </div>
              <div className="border-l border-gray-200/60 dark:border-[#3a3a3a]/60 text-right py-1.5 pl-3 pr-3 text-[10px] uppercase tracking-[0.08em] text-gray-500 dark:text-[#a0a0a0]">
                Area
              </div>
            </div>

            {/* Section + measurement rows */}
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
              <SortableContext items={sortedSections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {sortedSections.map((section) => {
                  const sectionItems = itemsBySectionId.get(section.id) ?? []
                  const isRenamingThis = editingSectionId === section.id
                  const sectionDraggable = canEditItems && sortedSections.length > 1
                  return (
                    <SortableSection key={section.id} sectionId={section.id} draggable={sectionDraggable}>
                      {({ setActivatorRef, listeners, attributes }) => (
                        <>
                          {/* Section label row — no vertical dividers through value columns */}
                          <div className="group relative pl-8 pr-10 pt-[20px] pb-[12px]">
                            {sectionDraggable && (
                              <button
                                ref={setActivatorRef}
                                type="button"
                                {...listeners}
                                {...attributes}
                                aria-label="Drag to reorder section"
                                className="absolute left-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-[#6b6b6b] hover:text-gray-600 dark:hover:text-[#a0a0a0] cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 group-has-[[aria-expanded=true]]:opacity-100 transition-opacity"
                              >
                                <GripVerticalIcon className="w-4 h-4" />
                              </button>
                            )}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                aria-hidden="true"
                                className="block w-[3px] h-[14px] bg-amber-500 rounded-[2px] flex-shrink-0"
                              />
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
                                  className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-900 dark:text-white bg-transparent border-b border-amber-500 outline-none"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingSectionId(section.id)
                                    setEditingSectionName(section.name)
                                  }}
                                  className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-900 dark:text-white hover:text-amber-500 cursor-pointer truncate"
                                >
                                  {section.name}
                                </span>
                              )}
                              <div className="opacity-0 group-hover:opacity-100 group-has-[[aria-expanded=true]]:opacity-100 transition-opacity">
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
                            </div>
                          </div>

                          {/* Measurement rows */}
                          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd(section.id)}>
                            <SortableContext items={sectionItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                              {sectionItems.map((item) => {
                                const itemTotal = item.measurements.reduce((s, m) => s + m.valueInFeet, 0)
                                const itemPerim = item.type === 'area'
                                  ? item.measurements.reduce((s, m) => s + (m.perimeterFt || 0), 0)
                                  : 0
                                const dragEnabled = canEditItems
                                return (
                                  <SortableMeasurementRow key={item.id} itemId={item.id} draggable={dragEnabled}>
                                    {({ setActivatorRef, listeners, attributes }) => (
                                      <div
                                        className="group relative grid items-center pl-8 pr-10 border-b border-gray-200/60 dark:border-[#3a3a3a]/60 hover:bg-gray-50/70 dark:hover:bg-[#2e2e2e]/40 transition-colors"
                                        style={{ gridTemplateColumns: '1fr 110px 110px' }}
                                      >
                                        {dragEnabled && (
                                          <button
                                            ref={setActivatorRef}
                                            type="button"
                                            {...listeners}
                                            {...attributes}
                                            aria-label="Drag to reorder"
                                            className="absolute left-1 top-[calc(50%-12px)] p-1 text-gray-400 dark:text-[#6b6b6b] hover:text-gray-600 dark:hover:text-[#a0a0a0] cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 group-has-[[aria-expanded=true]]:opacity-100 transition-opacity"
                                          >
                                            <GripVerticalIcon className="w-4 h-4" />
                                          </button>
                                        )}
                                        <div className="flex items-center gap-2 min-w-0 py-3 pr-3">
                                          <span
                                            className="w-2 h-2 rounded-full flex-shrink-0"
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
                                              className="text-[14px] border-b border-amber-500 outline-none bg-transparent flex-1 min-w-0 text-gray-900 dark:text-[#e5e5e5]"
                                              autoFocus
                                            />
                                          ) : (
                                            <>
                                              <span className="text-[14px] text-gray-900 dark:text-[#e5e5e5] truncate">
                                                {item.name}
                                              </span>
                                              {item.type === 'area' && itemPerim > 0 && (
                                                <span className="text-[12px] text-gray-400 dark:text-[#6b6b6b] flex-shrink-0 truncate">
                                                  &nbsp;·&nbsp;{fmtFtIn(itemPerim)} perim
                                                </span>
                                              )}
                                            </>
                                          )}
                                        </div>
                                        <div className="border-l border-gray-200/60 dark:border-[#3a3a3a]/60 text-right py-3 pr-3 text-[14px] tabular-nums text-gray-900 dark:text-[#e5e5e5]">
                                          {item.type === 'linear'
                                            ? fmtFtIn(itemTotal)
                                            : <span className="text-gray-300 dark:text-[#6b6b6b]">—</span>}
                                        </div>
                                        <div className="border-l border-gray-200/60 dark:border-[#3a3a3a]/60 text-right py-3 pl-3 pr-3 text-[14px] tabular-nums text-gray-900 dark:text-[#e5e5e5]">
                                          {item.type === 'area'
                                            ? fmtArea(itemTotal)
                                            : <span className="text-gray-300 dark:text-[#6b6b6b]">—</span>}
                                        </div>
                                        <div className="absolute right-1 top-[calc(50%-12px)] opacity-0 group-hover:opacity-100 group-has-[[aria-expanded=true]]:opacity-100 transition-opacity">
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
                                              {
                                                label: 'Delete',
                                                destructive: true,
                                                icon: <Trash2Icon className="w-3.5 h-3.5" />,
                                                onSelect: () => {
                                                  if (typeof window !== 'undefined' && window.confirm(`Delete measurement "${item.name}"? This cannot be undone.`)) {
                                                    onDeleteItem(item.id)
                                                  }
                                                },
                                              },
                                            ]}
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </SortableMeasurementRow>
                                )
                              })}
                            </SortableContext>
                          </DndContext>

                          {/* Per-section subtotal — only when the section has at least one measurement. */}
                          {sectionItems.length > 0 && (() => {
                            const sub = computeTotals(sectionItems)
                            return (
                              <div
                                className="grid items-center pl-8 pr-10"
                                style={{ gridTemplateColumns: '1fr 110px 110px' }}
                              >
                                <div className="pt-[10px] pb-2 pl-4 pr-3 text-[14px] font-medium uppercase tracking-[0.04em] text-gray-400 dark:text-[#888]">
                                  Total
                                </div>
                                <div className="border-l border-gray-200/60 dark:border-[#3a3a3a]/60 text-right pt-[10px] pb-2 pr-3 text-[14px] tabular-nums text-gray-400 dark:text-[#888]">
                                  {fmtFtIn(sub.linear)}
                                </div>
                                <div className="border-l border-gray-200/60 dark:border-[#3a3a3a]/60 text-right pt-[10px] pb-2 pl-3 pr-3 text-[14px] tabular-nums text-gray-400 dark:text-[#888]">
                                  {fmtArea(sub.area)}
                                </div>
                              </div>
                            )
                          })()}
                        </>
                      )}
                    </SortableSection>
                  )
                })}
              </SortableContext>
            </DndContext>

            {/* Project total row */}
            <div
              className="grid items-center pl-8 pr-10 py-4 border-t"
              style={{
                gridTemplateColumns: '1fr 110px 110px',
                borderTopColor: 'rgba(245,158,11,0.3)',
              }}
            >
              <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-amber-500">
                Total
              </span>
              <div
                className="text-right py-1 pr-3 text-[15px] font-medium tabular-nums text-gray-900 dark:text-[#e5e5e5]"
                style={{ borderLeft: '1px solid rgba(245,158,11,0.15)' }}
              >
                {fmtFtIn(projectTotals.linear)}
              </div>
              <div
                className="text-right py-1 pl-3 pr-3 text-[15px] font-medium tabular-nums text-gray-900 dark:text-[#e5e5e5]"
                style={{ borderLeft: '1px solid rgba(245,158,11,0.15)' }}
              >
                {fmtArea(projectTotals.area)}
              </div>
            </div>
          </>
        )}

        {/* + Add Section button */}
        <div className="px-4 py-3">
          <button
            onClick={() => {
              const id = onCreateSection('New Section')
              setEditingSectionId(id)
              setEditingSectionName('New Section')
              setTimeout(() => sectionEditInputRef.current?.focus(), 0)
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-dashed border-gray-300/60 dark:border-[#3a3a3a]/70 bg-transparent text-gray-500 dark:text-[#a0a0a0] hover:text-amber-600 hover:border-amber-500/40 text-xs font-medium rounded transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Section
          </button>
        </div>
      </div>


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
