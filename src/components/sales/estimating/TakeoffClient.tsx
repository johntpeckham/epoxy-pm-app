// SHARED COMPONENT — used by BOTH the Estimating route
// (/estimating/takeoff/[id]) and the Tools route (/tools/takeoff/[id]).
// Do NOT fork or copy this file for either route. Any change here applies
// to both entry points automatically.
'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  RulerIcon,
  MonitorIcon,
  ArrowLeftIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AutoSaveIndicator from '@/components/ui/AutoSaveIndicator'
import TakeoffDashboard from '@/components/takeoff/TakeoffDashboard'
import TakeoffViewer from '@/components/takeoff/TakeoffViewer'
import type {
  TakeoffItem,
  TakeoffPage,
  Markup,
  TakeoffSection,
} from '@/components/takeoff/types'
import type { EstimatingProject, EstimatingProjectPdf } from './types'
import { useUploadTakeoffPdf } from './useUploadTakeoffPdf'

// ─── Sections row type (DB shape) ──────────────────────────────────────

export interface TakeoffSectionRow {
  id: string
  project_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

function sectionRowToClient(row: TakeoffSectionRow): TakeoffSection {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    sortOrder: row.sort_order,
  }
}

function genSectionId(): string {
  // Crypto.randomUUID is widely available in modern browsers and matches
  // what Supabase generates for inserts; fallback to Math.random for SSR
  // (this code path runs client-side so the browser branch is taken).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

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
  sections: TakeoffSectionRow[]
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
  sections: initialSections,
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
  // Real progress count for the initial PDF-load loop. Each PDF that
  // finishes fetching + thumbnailing increments by 1; the loading screen
  // surfaces (loadProgressDone / pdfs.length) as a percentage.
  const [loadProgressDone, setLoadProgressDone] = useState(0)

  const initial = useMemo(
    () => buildInitialState(initialPdfs, measurements),
    [initialPdfs, measurements]
  )
  // ─── Sections ────────────────────────────────────────────────────────
  // Sections are stored in their own DB table and loaded via the server
  // page. Items live in JSONB (existing pattern); each item carries an
  // optional sectionId that is lazily filled in here on first render so
  // legacy data continues to work — the next autosave persists the
  // assignment back to JSONB.
  const [sections, setSections] = useState<TakeoffSection[]>(() =>
    initialSections
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
      .map(sectionRowToClient)
  )

  // Resolve the "default" section for new/orphaned items: the first
  // section by sort order. If no sections exist for the project (the
  // user deleted them all), we synthesize one client-side and persist on
  // the next mount; new items still bind to its id immediately.
  const defaultSectionRef = useRef<TakeoffSection | null>(null)
  if (!defaultSectionRef.current && sections.length > 0) {
    defaultSectionRef.current = sections[0]
  }

  // Lazy assign sectionId for legacy items. Run on initial.items and any
  // item that comes through buildInitialState without a sectionId. We do
  // this BEFORE the items useState so the first render already has the
  // assignments and the autosave debounce will persist them.
  const lazySectionAssignedItems = useMemo(() => {
    const validIds = new Set(sections.map((s) => s.id))
    const fallback = sections[0]?.id
    if (!fallback) return initial.items
    return initial.items.map((it) =>
      it.sectionId && validIds.has(it.sectionId) ? it : { ...it, sectionId: fallback }
    )
  }, [initial.items, sections])

  const [items, setItems] = useState<TakeoffItem[]>(lazySectionAssignedItems)

  // Auto-create a Default section if the project has measurement data
  // but zero sections exist (user deleted them all, or a brand-new
  // project that didn't get backfilled). Runs once on mount.
  const sectionAutoCreateRanRef = useRef(false)
  useEffect(() => {
    if (sectionAutoCreateRanRef.current) return
    sectionAutoCreateRanRef.current = true
    if (sections.length > 0) return
    const newId = genSectionId()
    const optimistic: TakeoffSection = {
      id: newId,
      projectId: project.id,
      name: 'Default',
      sortOrder: 0,
    }
    setSections([optimistic])
    defaultSectionRef.current = optimistic
    const supabase = createClient()
    supabase
      .from('estimating_project_measurement_sections')
      .insert({ id: newId, project_id: project.id, name: 'Default', sort_order: 0 })
      .then(({ error }) => {
        if (error) {
          console.error('[Takeoff] Auto-create default section failed:', error)
        }
      })
  }, [project.id, sections.length])

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
    setLoadProgressDone(0)
    ;(async () => {
      try {
        const all: TakeoffPage[] = []
        for (let i = 0; i < pdfs.length; i++) {
          const pdfPages = await loadPdfPages(pdfs[i], i)
          if (cancelled) return
          all.push(...pdfPages)
          setLoadProgressDone(i + 1)
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

  // ─── Section CRUD ────────────────────────────────────────────────────
  // All persistence is direct to estimating_project_measurement_sections.
  // Items' sectionId lives in JSONB and is persisted by the existing
  // measurements autosave on the next mutation.

  const handleCreateSection = useCallback(
    (name: string): string => {
      const trimmed = name.trim() || 'New Section'
      const newId = genSectionId()
      setSections((prev) => {
        const sortOrder =
          prev.length > 0 ? Math.max(...prev.map((s) => s.sortOrder)) + 1 : 0
        const next: TakeoffSection = {
          id: newId,
          projectId: project.id,
          name: trimmed,
          sortOrder,
        }
        const supabase = createClient()
        supabase
          .from('estimating_project_measurement_sections')
          .insert({
            id: newId,
            project_id: project.id,
            name: trimmed,
            sort_order: sortOrder,
          })
          .then(({ error }) => {
            if (error) console.error('[Takeoff] Create section failed:', error)
          })
        return [...prev, next]
      })
      return newId
    },
    [project.id]
  )

  const handleRenameSection = useCallback((sectionId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, name: trimmed } : s))
    )
    const supabase = createClient()
    supabase
      .from('estimating_project_measurement_sections')
      .update({ name: trimmed })
      .eq('id', sectionId)
      .then(({ error }) => {
        if (error) console.error('[Takeoff] Rename section failed:', error)
      })
  }, [])

  const handleDeleteSection = useCallback((sectionId: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId))
    // Items in the deleted section are removed from client state. The
    // CASCADE FK is on sections.project_id (not items, which live in
    // JSONB), so the JSONB is updated by the next autosave that writes
    // out the smaller items array.
    setItems((prev) => prev.filter((it) => it.sectionId !== sectionId))
    const supabase = createClient()
    supabase
      .from('estimating_project_measurement_sections')
      .delete()
      .eq('id', sectionId)
      .then(({ error }) => {
        if (error) console.error('[Takeoff] Delete section failed:', error)
      })
  }, [])

  const handleReorderSections = useCallback((orderedIds: string[]) => {
    setSections((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]))
      const next: TakeoffSection[] = []
      orderedIds.forEach((id, i) => {
        const s = byId.get(id)
        if (s) next.push({ ...s, sortOrder: i })
      })
      // Defensive: keep any sections not present in orderedIds at the end
      // with continuing indices.
      let nextIdx = next.length
      for (const s of prev) {
        if (!orderedIds.includes(s.id)) {
          next.push({ ...s, sortOrder: nextIdx++ })
        }
      }
      // Persist only the rows whose sort_order changed.
      const supabase = createClient()
      next.forEach((s) => {
        const old = byId.get(s.id)
        if (!old || old.sortOrder === s.sortOrder) return
        supabase
          .from('estimating_project_measurement_sections')
          .update({ sort_order: s.sortOrder })
          .eq('id', s.id)
          .then(({ error }) => {
            if (error)
              console.error('[Takeoff] Reorder section failed:', error)
          })
      })
      return next
    })
  }, [])

  // Move an item to a different section AND/OR reorder within a section.
  // Receives the per-section ordered id lists for source + destination.
  // The single canonical client list of items is rebuilt to match the
  // section grouping; the autosave persists the new array order to JSONB.
  const handleReorderItemsInSections = useCallback(
    (sectionIdToOrderedItemIds: Record<string, string[]>) => {
      setItems((prev) => {
        const byId = new Map(prev.map((it) => [it.id, it]))
        const next: TakeoffItem[] = []
        // Walk sections in their current sort order so items group
        // naturally section-by-section in the array (cosmetic; the
        // grouped render in the sidebar is by sectionId, not by array
        // adjacency, but adjacency makes the JSONB more readable).
        const sectionOrder = sections
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => s.id)
        for (const sectionId of sectionOrder) {
          const ids = sectionIdToOrderedItemIds[sectionId] ?? []
          for (const id of ids) {
            const it = byId.get(id)
            if (!it) continue
            next.push({ ...it, sectionId })
            byId.delete(id)
          }
        }
        // Any remaining items that weren't placed (e.g., a section that
        // was just deleted) — drop them onto the first existing section
        // so they're never orphaned.
        const fallback = sections[0]?.id
        for (const remaining of byId.values()) {
          next.push(
            fallback ? { ...remaining, sectionId: fallback } : remaining
          )
        }
        return next
      })
    },
    [sections]
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
        sections={sections}
        onBack={handleBackToDashboard}
        onPageScaleChange={handlePageScaleChange}
        onItemsChange={handleItemsChange}
        onMarkupsChange={handleMarkupsChange}
        onToggleFullscreen={handleToggleFullscreen}
        onCanvasSizeChange={handleCanvasSizeChange}
        onCreateSection={handleCreateSection}
        onRenameSection={handleRenameSection}
        onDeleteSection={handleDeleteSection}
        onReorderSections={handleReorderSections}
        onReorderItemsInSections={handleReorderItemsInSections}
      />
    )
  } else if (loadingPdfs && pages.length === 0) {
    // Real progress: each PDF that finishes fetching + thumbnailing
    // advances the bar by (1 / total). pdfs.length === 0 case is handled
    // earlier (sets loadingPdfs=false and skips this branch entirely).
    const total = pdfs.length || 1
    const pct = Math.min(100, Math.round((loadProgressDone / total) * 100))
    column3Content = (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="w-[320px]">
          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 text-center mt-3 tabular-nums">
            Loading plans… {pct}%
          </p>
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
        sections={sections}
        onAddPages={handleAddPages}
        onUploadPdf={handleUploadPdf}
        onOpenPage={handleOpenPage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
        onRenameItem={handleRenameItem}
        onReorderItems={handleReorderItems}
        onCreateSection={handleCreateSection}
        onRenameSection={handleRenameSection}
        onDeleteSection={handleDeleteSection}
        onReorderSections={handleReorderSections}
        onReorderItemsInSections={handleReorderItemsInSections}
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
          href={
            project.company_id
              ? `/estimating?customer=${project.company_id}&project=${project.id}`
              : '/tools/takeoff'
          }
          className="flex-shrink-0"
        >
          <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
        </Link>
        <RulerIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <span className="text-2xl font-bold text-gray-900 dark:text-white flex-1 truncate">
          {project.name}
        </span>
        {!project.company_id && (
          <span className="text-xs text-gray-400 hidden sm:inline flex-shrink-0">
            No project linked
          </span>
        )}
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
