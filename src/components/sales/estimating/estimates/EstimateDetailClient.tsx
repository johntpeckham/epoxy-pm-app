'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftIcon, Undo2 as Undo2Icon, Redo2 as Redo2Icon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/usePermissions'
import Tooltip from '@/components/ui/Tooltip'
import type { Estimate, EstimateArea, EstimateAreaMeasurement, EstimateSectionCove } from '../types'
import SummaryTab from './tabs/SummaryTab'
import AreasTab from './tabs/AreasTab'
import MaterialsTab from './tabs/MaterialsTab'
import LaborTab from './tabs/LaborTab'
import PrepToolsTab from './tabs/PrepToolsTab'
import SundriesTab from './tabs/SundriesTab'
import TravelTab from './tabs/TravelTab'
import ConfirmedMeasurementsCard from './ConfirmedMeasurementsCard'
import MeasurementReferences from './tabs/MeasurementReferences'
import AddModuleButton from './AddModuleButton'
import CpiCalculatorCard from './CpiCalculatorCard'
import AutoSaveIndicator, { type AutoSaveState } from './AutoSaveIndicator'

const TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'areas', label: 'Areas & measurements' },
  { key: 'materials', label: 'Materials' },
  { key: 'labor', label: 'Labor' },
  { key: 'prep', label: 'Prep & tools' },
  { key: 'sundries', label: 'Sundries' },
  { key: 'travel', label: 'Travel' },
] as const

type TabKey = (typeof TABS)[number]['key']

/** Document-wide undo/redo snapshot. Holds the full state of every row
 *  across every table the Estimate Detail page owns. Future phases will
 *  extend this with materials, labor, prep_tools, sundries, travel as
 *  those tables come online — add fields here and nothing else changes
 *  for the snapshot mechanism. */
type EstimateSnapshot = {
  areas: EstimateArea[]
  sections: EstimateAreaMeasurement[]
  sectionCoves: EstimateSectionCove[]
}

const UNDO_STACK_LIMIT = 100

interface EstimateDetailClientProps {
  estimate: Estimate
  projectName: string
  projectId: string
  customerId: string
  customerName: string
  initialAreas: EstimateArea[]
  initialSections: EstimateAreaMeasurement[]
  initialSectionCoves: EstimateSectionCove[]
}

export default function EstimateDetailClient({
  estimate,
  projectName,
  projectId,
  customerId,
  customerName,
  initialAreas,
  initialSections,
  initialSectionCoves,
}: EstimateDetailClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [sidebarModules, setSidebarModules] = useState<string[]>(
    () => (estimate as unknown as Record<string, unknown>).sidebar_modules as string[] ?? []
  )

  // ── Areas & measurements state (shared across tabs) ───────────────────────
  const [areas, setAreas] = useState<EstimateArea[]>(initialAreas)
  const [sections, setSections] = useState<EstimateAreaMeasurement[]>(initialSections)
  const [sectionCoves, setSectionCoves] = useState<EstimateSectionCove[]>(initialSectionCoves)

  // ── Page-level auto-save indicator state ──────────────────────────────────
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle')
  // Stable setter to pass deep without forcing rerenders.
  const reportAutoSave = useCallback((s: AutoSaveState) => setAutoSaveState(s), [])

  // ── Undo / redo (document-wide, in-memory only, cleared on tab close) ─────
  const supabase = useMemo(() => createClient(), [])
  const { canEdit } = usePermissions()
  const canEditEstimating = canEdit('estimating')

  const [undoStack, setUndoStack] = useState<EstimateSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<EstimateSnapshot[]>([])
  // When true, captureSnapshot() returns early. Set during runUndo/runRedo
  // so the state writes those functions perform don't generate a new snapshot.
  const isRestoringRef = useRef(false)
  // Single-flight guard so rapid Cmd+Z spam doesn't interleave operations.
  const isUndoRedoInFlightRef = useRef(false)
  const [busy, setBusy] = useState(false) // mirror of isUndoRedoInFlightRef for disabled-state rendering

  // Keep a live ref to current state so captureSnapshot and the runUndo/Redo
  // functions can read the latest values without stale closures.
  const areasRef = useRef(areas)
  const sectionsRef = useRef(sections)
  const sectionCovesRef = useRef(sectionCoves)
  useEffect(() => { areasRef.current = areas }, [areas])
  useEffect(() => { sectionsRef.current = sections }, [sections])
  useEffect(() => { sectionCovesRef.current = sectionCoves }, [sectionCoves])

  const captureSnapshot = useCallback(() => {
    if (isRestoringRef.current) return
    const snapshot: EstimateSnapshot = {
      areas: structuredClone(areasRef.current),
      sections: structuredClone(sectionsRef.current),
      sectionCoves: structuredClone(sectionCovesRef.current),
    }
    setUndoStack((prev) => {
      const next = [...prev, snapshot]
      return next.length > UNDO_STACK_LIMIT ? next.slice(-UNDO_STACK_LIMIT) : next
    })
    setRedoStack([])
  }, [])

  // Compute the DB diff between a "before" and "target" snapshot and apply it.
  // Phases: deletes (child-first), inserts (parent-first), updates (parallel).
  const syncDbToSnapshot = useCallback(
    async (target: EstimateSnapshot, before: EstimateSnapshot) => {
      function diff<T extends { id: string }>(beforeRows: T[], afterRows: T[]) {
        const beforeById = new Map(beforeRows.map((r) => [r.id, r]))
        const afterById = new Map(afterRows.map((r) => [r.id, r]))
        const removed = beforeRows.filter((r) => !afterById.has(r.id))
        const added = afterRows.filter((r) => !beforeById.has(r.id))
        const modified: T[] = []
        for (const a of afterRows) {
          const b = beforeById.get(a.id)
          if (b && JSON.stringify(b) !== JSON.stringify(a)) modified.push(a)
        }
        return { added, removed, modified }
      }

      const areaDiff = diff(before.areas, target.areas)
      const sectionDiff = diff(before.sections, target.sections)
      const coveDiff = diff(before.sectionCoves, target.sectionCoves)

      function throwIfErr(label: string, error: { code?: string; message?: string; hint?: string; details?: string } | null) {
        if (!error) return
        console.error(`Undo/redo: ${label} failed`, { code: error.code, message: error.message, hint: error.hint, details: error.details })
        throw new Error(error.message ?? `${label} failed`)
      }

      // Phase 1: deletes, child → parent. CASCADE would handle children of
      // a deleted area but the snapshot's sections live independently; delete
      // by explicit id to keep behavior predictable.
      if (coveDiff.removed.length > 0) {
        const { error } = await supabase.from('estimate_section_coves').delete().in('id', coveDiff.removed.map((r) => r.id))
        throwIfErr('delete section coves', error)
      }
      if (sectionDiff.removed.length > 0) {
        const { error } = await supabase.from('estimate_area_measurements').delete().in('id', sectionDiff.removed.map((r) => r.id))
        throwIfErr('delete sections', error)
      }
      if (areaDiff.removed.length > 0) {
        const { error } = await supabase.from('estimate_areas').delete().in('id', areaDiff.removed.map((r) => r.id))
        throwIfErr('delete areas', error)
      }

      // Phase 2: inserts, parent → child. Rows carry their original ids and
      // created_at; Postgres accepts explicit values for both.
      if (areaDiff.added.length > 0) {
        const { error } = await supabase.from('estimate_areas').insert(areaDiff.added)
        throwIfErr('insert areas', error)
      }
      if (sectionDiff.added.length > 0) {
        const { error } = await supabase.from('estimate_area_measurements').insert(sectionDiff.added)
        throwIfErr('insert sections', error)
      }
      if (coveDiff.added.length > 0) {
        const { error } = await supabase.from('estimate_section_coves').insert(coveDiff.added)
        throwIfErr('insert section coves', error)
      }

      // Phase 3: updates. No FK ordering required.
      await Promise.all([
        ...areaDiff.modified.map(async (row) => {
          const { error } = await supabase.from('estimate_areas').update(row).eq('id', row.id)
          throwIfErr('update area', error)
        }),
        ...sectionDiff.modified.map(async (row) => {
          const { error } = await supabase.from('estimate_area_measurements').update(row).eq('id', row.id)
          throwIfErr('update section', error)
        }),
        ...coveDiff.modified.map(async (row) => {
          const { error } = await supabase.from('estimate_section_coves').update(row).eq('id', row.id)
          throwIfErr('update section cove', error)
        }),
      ])
    },
    [supabase]
  )

  const runRestore = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (isUndoRedoInFlightRef.current) return
      const sourceStack = direction === 'undo' ? undoStack : redoStack
      if (sourceStack.length === 0) return

      isUndoRedoInFlightRef.current = true
      isRestoringRef.current = true
      setBusy(true)

      const targetSnapshot = sourceStack[sourceStack.length - 1]
      const currentSnapshot: EstimateSnapshot = {
        areas: structuredClone(areasRef.current),
        sections: structuredClone(sectionsRef.current),
        sectionCoves: structuredClone(sectionCovesRef.current),
      }
      const prevUndoStack = undoStack
      const prevRedoStack = redoStack

      // Optimistic: pop target, push current onto the opposite stack, apply
      // state.
      if (direction === 'undo') {
        setUndoStack((prev) => prev.slice(0, -1))
        setRedoStack((prev) => [...prev, currentSnapshot])
      } else {
        setRedoStack((prev) => prev.slice(0, -1))
        setUndoStack((prev) => [...prev, currentSnapshot])
      }
      setAreas(targetSnapshot.areas)
      setSections(targetSnapshot.sections)
      setSectionCoves(targetSnapshot.sectionCoves)

      reportAutoSave('saving')
      try {
        await syncDbToSnapshot(targetSnapshot, currentSnapshot)
        reportAutoSave('saved')
      } catch (err) {
        console.error(`runRestore (${direction}) failed`, { message: err instanceof Error ? err.message : String(err) })
        // Roll back local state + stacks
        setUndoStack(prevUndoStack)
        setRedoStack(prevRedoStack)
        setAreas(currentSnapshot.areas)
        setSections(currentSnapshot.sections)
        setSectionCoves(currentSnapshot.sectionCoves)
        reportAutoSave('error')
      } finally {
        isRestoringRef.current = false
        isUndoRedoInFlightRef.current = false
        setBusy(false)
      }
    },
    [undoStack, redoStack, syncDbToSnapshot, reportAutoSave]
  )

  const runUndo = useCallback(() => { runRestore('undo') }, [runRestore])
  const runRedo = useCallback(() => { runRestore('redo') }, [runRestore])

  // Global keyboard shortcut: Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y)
  // for redo. Skipped when focus is inside an editable element so the browser's
  // native text undo handles intra-input edits.
  useEffect(() => {
    if (!canEditEstimating) return
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
      }
      const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey
      if (!cmdOrCtrl) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        runUndo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        runRedo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canEditEstimating, runUndo, runRedo])

  const canUndo = undoStack.length > 0 && !busy
  const canRedo = redoStack.length > 0 && !busy

  function handleAddModule(moduleId: string) {
    setSidebarModules((prev) => [...prev, moduleId])
  }

  function handleRemoveModule(moduleId: string) {
    setSidebarModules((prev) => prev.filter((m) => m !== moduleId))
  }

  function handleBack() {
    router.push(`/estimating?customer=${customerId}&project=${projectId}`)
  }

  // Total measurements headline = sum of SF-unit areas (Floor, Roof, Walls,
  // Custom default SF). Cove (LF) intentionally excluded per the mockup —
  // mixing SF + LF in the same headline number is misleading.
  const totalSfMeasurements = useMemo(() => {
    let total = 0
    for (const area of areas) {
      if (area.area_type === 'cove') continue
      for (const s of sections) {
        if (s.area_id !== area.id) continue
        if (typeof s.total === 'number') total += s.total
      }
    }
    return total
  }, [areas, sections])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex-none bg-white dark:bg-[#242424] border-b border-gray-200 dark:border-[#2a2a2a] px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={handleBack} className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400">
              {customerName} &middot; {projectName}
            </p>
            <h1 className="text-base font-bold text-gray-900 dark:text-white mt-0.5 truncate">
              {estimate.name}
            </h1>
            {estimate.template_id && (
              <p className="text-[11px] text-gray-400 mt-0.5">From template</p>
            )}
          </div>
          {/* Undo / Redo — only rendered for users who can edit. Tooltips
              live inside the buttons so they fire on the icon's bounding box
              only. Disabled state mirrors empty-stack and in-flight gating. */}
          {canEditEstimating && (
            <div className="flex-shrink-0 flex items-center gap-3 mr-2">
              <Tooltip label="Undo (⌘Z)" placement="bottom">
                <button
                  type="button"
                  onClick={canUndo ? runUndo : undefined}
                  disabled={!canUndo}
                  aria-label="Undo"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-[#3a3a3a] bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50 dark:text-[#a0a0a0] dark:hover:text-white dark:hover:bg-[#2a2a2a] transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:disabled:hover:text-[#a0a0a0]"
                >
                  <Undo2Icon className="w-4 h-4" />
                </button>
              </Tooltip>
              <Tooltip label="Redo (⌘⇧Z)" placement="bottom">
                <button
                  type="button"
                  onClick={canRedo ? runRedo : undefined}
                  disabled={!canRedo}
                  aria-label="Redo"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-[#3a3a3a] bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50 dark:text-[#a0a0a0] dark:hover:text-white dark:hover:bg-[#2a2a2a] transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:disabled:hover:text-[#a0a0a0]"
                >
                  <Redo2Icon className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>
          )}

          {/* Auto-save indicator — pinned to the top-right of the header */}
          <div className="flex-shrink-0">
            <AutoSaveIndicator state={autoSaveState} />
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-none bg-white border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <div className="flex min-w-max px-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — two-column layout */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Mobile-only sidebar */}
          <div className="lg:hidden space-y-3">
            <ConfirmedMeasurementsCard />
            {activeTab === 'areas' && <MeasurementReferences />}
            {sidebarModules.includes('cpi_calculator') && (
              <CpiCalculatorCard onRemove={() => handleRemoveModule('cpi_calculator')} />
            )}
            <AddModuleButton activeModules={sidebarModules} onAddModule={handleAddModule} />
          </div>

          {/* Left column: tab content */}
          <div className="flex-1 min-w-0">
            {activeTab === 'summary' && (
              <SummaryTab
                areas={areas}
                sections={sections}
                totalSfMeasurements={totalSfMeasurements}
              />
            )}
            {activeTab === 'areas' && (
              <AreasTab
                estimateId={estimate.id}
                areas={areas}
                sections={sections}
                sectionCoves={sectionCoves}
                setAreas={setAreas}
                setSections={setSections}
                setSectionCoves={setSectionCoves}
                reportAutoSave={reportAutoSave}
                captureSnapshot={captureSnapshot}
              />
            )}
            {activeTab === 'materials' && <MaterialsTab />}
            {activeTab === 'labor' && <LaborTab />}
            {activeTab === 'prep' && <PrepToolsTab />}
            {activeTab === 'sundries' && <SundriesTab />}
            {activeTab === 'travel' && <TravelTab />}
          </div>

          {/* Right column: sticky sidebar (desktop only) */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-4 space-y-3">
              <ConfirmedMeasurementsCard />
              {activeTab === 'areas' && <MeasurementReferences />}
              {sidebarModules.includes('cpi_calculator') && (
                <CpiCalculatorCard onRemove={() => handleRemoveModule('cpi_calculator')} />
              )}
              <AddModuleButton activeModules={sidebarModules} onAddModule={handleAddModule} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
