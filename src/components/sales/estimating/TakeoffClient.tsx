'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  RulerIcon,
  MonitorIcon,
  ArrowLeftIcon,
  Loader2Icon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AutoSaveIndicator from '@/components/ui/AutoSaveIndicator'
import TakeoffDashboard from '@/components/takeoff/TakeoffDashboard'
import TakeoffViewer from '@/components/takeoff/TakeoffViewer'
import type {
  TakeoffItem,
  TakeoffPage,
  Markup,
} from '@/components/takeoff/types'
import type { EstimatingProject, EstimatingProjectPdf } from './types'
import { useUploadTakeoffPdf } from './useUploadTakeoffPdf'

// ─── Row type shared with the server page ──────────────────────────────

export interface MeasurementPageSlice {
  items: TakeoffItem[]
  markups: Markup[]
  pageRenderedSize?: { w: number; h: number } | null
  // coordVersion >= 2: m.points / mk.points are normalized 0-1 relative to
  // the PDF intrinsic page. When absent/<2, points are legacy canvas-CSS-px
  // anchored to the slice's pageRenderedSize.
  coordVersion?: number
}

export interface MeasurementScaleCalibration {
  // Legacy: canvas-CSS-px per foot, anchored to the slice's pageRenderedSize.w.
  pixelsPerFoot?: number
  // New (coordVersion >= 2): normalized x-units per foot — i.e., the fraction
  // of the PDF page width that represents one foot. Independent of canvas size.
  unitsPerFoot?: number
}

export interface MeasurementRow {
  id: string
  project_id: string
  pdf_id: string
  page_number: number
  measurements: MeasurementPageSlice | null
  scale_calibration: MeasurementScaleCalibration | null
  hidden: boolean
  created_at: string
  updated_at: string
}

interface TakeoffClientProps {
  project: EstimatingProject
  pdfs: EstimatingProjectPdf[]
  measurements: MeasurementRow[]
}

// ─── Helpers ───────────────────────────────────────────────────────────

function mergeItemsById(target: TakeoffItem[], incoming: TakeoffItem[]) {
  for (const incomingItem of incoming) {
    const existing = target.find((i) => i.id === incomingItem.id)
    if (existing) {
      existing.measurements = [
        ...existing.measurements,
        ...incomingItem.measurements,
      ]
    } else {
      target.push({
        ...incomingItem,
        measurements: [...incomingItem.measurements],
      })
    }
  }
}

function buildInitialState(
  pdfs: EstimatingProjectPdf[],
  rows: MeasurementRow[]
): {
  items: TakeoffItem[]
  markups: Markup[]
  pageScales: Record<string, number>
  pageRenderedSizes: Record<string, { w: number; h: number }>
  hiddenPages: Record<string, boolean>
} {
  const pdfIdToIndex = new Map<string, number>()
  pdfs.forEach((p, i) => pdfIdToIndex.set(p.id, i))

  const items: TakeoffItem[] = []
  const markups: Markup[] = []
  // pageScales is normalized units-per-foot (independent of canvas size).
  const pageScales: Record<string, number> = {}
  const pageRenderedSizes: Record<string, { w: number; h: number }> = {}
  const hiddenPages: Record<string, boolean> = {}

  for (const row of rows) {
    const pdfIndex = pdfIdToIndex.get(row.pdf_id)
    if (pdfIndex === undefined) continue
    const pageKey = `${pdfIndex}-${row.page_number - 1}`

    if (row.hidden) hiddenPages[pageKey] = true

    const slice = row.measurements ?? { items: [], markups: [] }
    // All point/markup coords are now read as if they were normalized 0-1
    // (coordVersion 2). Pre-coordVersion-2 rows render in the wrong
    // position/size and are expected to be re-taken by the user — strategy
    // (a) per the bug-fix prompt. We do NOT attempt a rescue based on the
    // saved pageRenderedSize because that field can be stale, mismatched
    // against the originally-captured canvas size, or missing entirely on
    // very old rows, and rescue attempts have caused larger displacement
    // and growth on re-entry than just letting the broken data fall where
    // it falls.
    const renderedSize = slice.pageRenderedSize ?? null

    if (slice.items?.length) {
      mergeItemsById(items, slice.items)
    }

    if (slice.markups?.length) {
      markups.push(...slice.markups)
    }

    if (renderedSize) {
      pageRenderedSizes[pageKey] = renderedSize
    }

    // scale_calibration: only the new normalized field (unitsPerFoot) is
    // honored. Legacy pixelsPerFoot rows are ignored — the user must re-set
    // the scale with the Set Scale tool. (Same strategy-(a) reasoning.)
    const cal = row.scale_calibration
    if (cal && typeof cal.unitsPerFoot === 'number' && cal.unitsPerFoot > 0) {
      pageScales[pageKey] = cal.unitsPerFoot
    }
  }

  return { items, markups, pageScales, pageRenderedSizes, hiddenPages }
}

async function loadPdfPages(
  pdf: EstimatingProjectPdf,
  pdfIndex: number
): Promise<TakeoffPage[]> {
  const pdfjsLib = await import('pdfjs-dist')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()

  const res = await fetch(pdf.file_url)
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${pdf.file_name}`)
  const arrayBuffer = await res.arrayBuffer()

  const doc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise
  const pages: TakeoffPage[] = []
  for (let i = 0; i < doc.numPages; i++) {
    const pdfPage = await doc.getPage(i + 1)
    const viewport = pdfPage.getViewport({ scale: 0.3 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
    const thumbnailDataUrl = canvas.toDataURL('image/png')

    pages.push({
      pdfIndex,
      pageIndex: i,
      pdfName: pdf.file_name,
      displayName: doc.numPages > 1
        ? `${pdf.file_name} — Page ${i + 1}`
        : pdf.file_name,
      thumbnailDataUrl,
      arrayBuffer,
      pdfBase64: null,
      pdfId: pdf.id,
    })
  }
  return pages
}

// ─── Component ─────────────────────────────────────────────────────────

export default function TakeoffClient({
  project,
  pdfs: initialPdfs,
  measurements,
}: TakeoffClientProps) {
  const uploadPdf = useUploadTakeoffPdf(project.id)

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [pdfs, setPdfs] = useState<EstimatingProjectPdf[]>(initialPdfs)
  const [pages, setPages] = useState<TakeoffPage[]>([])
  const [loadingPdfs, setLoadingPdfs] = useState(initialPdfs.length > 0)

  const initial = useMemo(
    () => buildInitialState(initialPdfs, measurements),
    [initialPdfs, measurements]
  )
  const [items, setItems] = useState<TakeoffItem[]>(initial.items)
  const [markups, setMarkups] = useState<Markup[]>(initial.markups)
  const [pageScales, setPageScales] = useState<Record<string, number>>(
    initial.pageScales
  )
  const [pageRenderedSizes, setPageRenderedSizes] = useState<
    Record<string, { w: number; h: number }>
  >(initial.pageRenderedSizes)
  const [hiddenPages, setHiddenPages] = useState<Record<string, boolean>>(
    initial.hiddenPages
  )

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'dashboard' | 'viewer'>('dashboard')
  const [activePage, setActivePage] = useState<TakeoffPage | null>(null)

  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialMount = useRef(true)

  // Load PDF page data (arrayBuffer + thumbnails) on mount / when PDFs change
  useEffect(() => {
    let cancelled = false
    if (pdfs.length === 0) {
      setPages([])
      setLoadingPdfs(false)
      return
    }
    setLoadingPdfs(true)
    ;(async () => {
      try {
        const all: TakeoffPage[] = []
        for (let i = 0; i < pdfs.length; i++) {
          const pdfPages = await loadPdfPages(pdfs[i], i)
          if (cancelled) return
          all.push(...pdfPages)
        }
        if (!cancelled) setPages(all)
      } catch (err) {
        console.error('[Takeoff] Failed to load PDFs:', err)
      } finally {
        if (!cancelled) setLoadingPdfs(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // We intentionally trigger on pdfs.length + a join of ids so newly uploaded
    // PDFs pick up without re-downloading the existing ones in a loop. The
    // loader itself handles the full list each time and overwrites pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfs.map((p) => p.id).join('|')])

  // Auto-save to Supabase (debounced) whenever measurement state changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (loadingPdfs || pages.length === 0) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedIndicatorTimerRef.current)
      clearTimeout(savedIndicatorTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      setSaveState('saving')
      const supabase = createClient()

      const rows: Array<{
        project_id: string
        pdf_id: string
        page_number: number
        measurements: MeasurementPageSlice
        scale_calibration: MeasurementScaleCalibration | null
        hidden: boolean
      }> = []

      for (const page of pages) {
        if (!page.pdfId) continue
        const pageKey = `${page.pdfIndex}-${page.pageIndex}`

        const itemsForPage = items
          .map((item) => ({
            ...item,
            measurements: item.measurements.filter(
              (m) => m.pageKey === pageKey
            ),
          }))
          .filter((item) => item.measurements.length > 0)
        const markupsForPage = markups.filter((m) => m.pageKey === pageKey)
        const renderedSize = pageRenderedSizes[pageKey] ?? null
        // pageScales now stores normalized units-per-foot.
        const unitsPerFoot = pageScales[pageKey]

        rows.push({
          project_id: project.id,
          pdf_id: page.pdfId,
          page_number: page.pageIndex + 1,
          measurements: {
            items: itemsForPage,
            markups: markupsForPage,
            pageRenderedSize: renderedSize,
            coordVersion: 2,
          },
          scale_calibration: unitsPerFoot ? { unitsPerFoot } : null,
          hidden: hiddenPages[pageKey] ?? false,
        })
      }

      if (rows.length === 0) {
        setSaveState('saved')
        savedIndicatorTimerRef.current = setTimeout(
          () => setSaveState('idle'),
          1500
        )
        return
      }

      const { error } = await supabase
        .from('estimating_project_measurements')
        .upsert(rows, { onConflict: 'pdf_id,page_number' })

      if (error) {
        console.error('[Takeoff] Save failed:', error)
        setSaveState('error')
      } else {
        setSaveState('saved')
        savedIndicatorTimerRef.current = setTimeout(
          () => setSaveState('idle'),
          1500
        )
      }
    }, 1000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [
    items,
    markups,
    pageScales,
    pageRenderedSizes,
    hiddenPages,
    pages,
    project.id,
    loadingPdfs,
  ])

  // ─── Callbacks wired to TakeoffDashboard / TakeoffViewer ──────────

  const handleAddPages = useCallback((newPages: TakeoffPage[]) => {
    setPages((prev) => [...prev, ...newPages])
  }, [])

  const handleUploadPdf = useCallback(
    async (file: File) => {
      const inserted = await uploadPdf(file)
      const pdfIndex = pdfs.length
      const newPages = await loadPdfPages(inserted, pdfIndex)
      setPdfs((prev) => [...prev, inserted])
      // loadPdfs effect will re-run and repopulate pages; to avoid flicker,
      // also append immediately.
      setPages((prev) => [...prev, ...newPages])
    },
    [uploadPdf, pdfs.length]
  )

  const handleDeletePage = useCallback(
    (pdfIndex: number, pageIndex: number) => {
      const page = pages.find(
        (p) => p.pdfIndex === pdfIndex && p.pageIndex === pageIndex
      )
      if (!page?.pdfId) return
      const pageKey = `${pdfIndex}-${pageIndex}`

      setHiddenPages((prev) => ({ ...prev, [pageKey]: true }))

      const itemsForPage = items
        .map((item) => ({
          ...item,
          measurements: item.measurements.filter((m) => m.pageKey === pageKey),
        }))
        .filter((item) => item.measurements.length > 0)
      const markupsForPage = markups.filter((m) => m.pageKey === pageKey)
      const renderedSize = pageRenderedSizes[pageKey] ?? null
      const unitsPerFoot = pageScales[pageKey]

      const supabase = createClient()
      supabase
        .from('estimating_project_measurements')
        .upsert(
          [
            {
              project_id: project.id,
              pdf_id: page.pdfId,
              page_number: pageIndex + 1,
              measurements: {
                items: itemsForPage,
                markups: markupsForPage,
                pageRenderedSize: renderedSize,
                coordVersion: 2,
              },
              scale_calibration: unitsPerFoot ? { unitsPerFoot } : null,
              hidden: true,
            },
          ],
          { onConflict: 'pdf_id,page_number' }
        )
        .then(({ error }) => {
          if (error) {
            console.error('[Takeoff] Hide page failed:', error)
          }
        })
    },
    [pages, items, markups, pageScales, pageRenderedSizes, project.id]
  )

  const handleRenamePage = useCallback(
    (pdfIndex: number, pageIndex: number, displayName: string) => {
      const matches = pages.filter((p) => p.pdfIndex === pdfIndex)
      const isMultiPage = matches.length > 1
      const target = matches.find((p) => p.pageIndex === pageIndex)
      const pdfId = target?.pdfId

      setPages((prev) =>
        prev.map((p) =>
          p.pdfIndex === pdfIndex && p.pageIndex === pageIndex
            ? { ...p, displayName }
            : p
        )
      )

      // Single-page PDF: persist the rename to the DB via file_name on the
      // pdf row. Multi-page PDFs have per-page displayNames with no DB column,
      // so they remain client-side only.
      if (!isMultiPage && pdfId) {
        setPdfs((prev) =>
          prev.map((p) => (p.id === pdfId ? { ...p, file_name: displayName } : p))
        )
        const supabase = createClient()
        supabase
          .from('estimating_project_measurement_pdfs')
          .update({ file_name: displayName })
          .eq('id', pdfId)
          .then(({ error }) => {
            if (error) {
              console.error('[Takeoff] Rename PDF failed:', error)
            }
          })
      }
    },
    [pages]
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
    (unitsPerFoot: number) => {
      if (!activePage) return
      const key = `${activePage.pdfIndex}-${activePage.pageIndex}`
      setPageScales((prev) => ({ ...prev, [key]: unitsPerFoot }))
    },
    [activePage]
  )

  const handleItemsChange = useCallback((next: TakeoffItem[]) => {
    setItems(next)
  }, [])

  // Reorder items to match the given id order. The autosave effect picks up
  // the new array order on its next debounce and writes it back to the
  // estimating_project_measurements JSONB blob — so reorder is persisted by
  // the same path that already saves new measurements / renames / deletes.
  // No DB schema change is needed because items live as a JSON array, not
  // as separate rows.
  const handleReorderItems = useCallback((orderedIds: string[]) => {
    setItems((prev) => {
      const byId = new Map(prev.map((it) => [it.id, it]))
      const reordered: TakeoffItem[] = []
      for (const id of orderedIds) {
        const it = byId.get(id)
        if (it) reordered.push(it)
      }
      // Append any items not present in orderedIds (defensive — shouldn't
      // happen with normal DnD but keeps state consistent on edge cases).
      for (const it of prev) {
        if (!orderedIds.includes(it.id)) reordered.push(it)
      }
      return reordered
    })
  }, [])

  const handleMarkupsChange = useCallback((next: Markup[]) => {
    setMarkups(next)
  }, [])

  const handleCanvasSizeChange = useCallback(
    (pageKey: string, size: { w: number; h: number }) => {
      setPageRenderedSizes((prev) => {
        const existing = prev[pageKey]
        if (
          existing &&
          Math.abs(existing.w - size.w) < 1 &&
          Math.abs(existing.h - size.h) < 1
        )
          return prev
        return { ...prev, [pageKey]: size }
      })
    },
    []
  )

  const handleRenameItem = useCallback(
    (itemId: string, newName: string) => {
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, name: newName } : i))
      )
    },
    []
  )

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  // ─── Render ────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-sm text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MonitorIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            Desktop Only Feature
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Takeoff is designed for desktop use. Please open this page on a
            desktop or laptop for the best experience.
          </p>
        </div>
      </div>
    )
  }

  const visiblePages = pages.filter(
    (p) => !hiddenPages[`${p.pdfIndex}-${p.pageIndex}`]
  )

  let column3Content: React.ReactNode
  if (viewMode === 'viewer' && activePage) {
    const pageKey = `${activePage.pdfIndex}-${activePage.pageIndex}`
    const latestPage =
      pages.find(
        (p) =>
          p.pdfIndex === activePage.pdfIndex &&
          p.pageIndex === activePage.pageIndex
      ) ?? activePage
    column3Content = (
      <TakeoffViewer
        key={pageKey}
        page={latestPage}
        pageScale={pageScales[pageKey]}
        items={items}
        markups={markups}
        isFullscreen={isFullscreen}
        pageRenderedSizes={pageRenderedSizes}
        projectName={project.name}
        onBack={handleBackToDashboard}
        onPageScaleChange={handlePageScaleChange}
        onItemsChange={handleItemsChange}
        onMarkupsChange={handleMarkupsChange}
        onToggleFullscreen={handleToggleFullscreen}
        onCanvasSizeChange={handleCanvasSizeChange}
      />
    )
  } else if (loadingPdfs && pages.length === 0) {
    column3Content = (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading plans…</p>
        </div>
      </div>
    )
  } else {
    column3Content = (
      <TakeoffDashboard
        projectName={project.name}
        pages={visiblePages}
        items={items}
        markups={markups}
        pageScales={pageScales}
        pageRenderedSizes={pageRenderedSizes}
        onAddPages={handleAddPages}
        onUploadPdf={handleUploadPdf}
        onOpenPage={handleOpenPage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
        onRenameItem={handleRenameItem}
        onReorderItems={handleReorderItems}
      />
    )
  }

  const showViewerOverlay = viewMode === 'viewer' && activePage

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
        <Link
          href={`/estimating?customer=${project.company_id}&project=${project.id}`}
          className="flex-shrink-0"
        >
          <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
        </Link>
        <RulerIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <span className="text-2xl font-bold text-gray-900 dark:text-white flex-1 truncate">
          {project.name}
        </span>
        <AutoSaveIndicator isSaving={saveState === 'saving'} />
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-gray-50 flex flex-col">
          {!showViewerOverlay && column3Content}
        </div>

        {showViewerOverlay && (
          <div className="fixed top-0 bottom-0 right-0 left-0 z-50 bg-white flex flex-col">
            {column3Content}
          </div>
        )}
      </div>
    </div>
  )
}
