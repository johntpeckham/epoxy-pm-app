'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
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
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeftIcon,
  ArrowUpDownIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SupplierModal from './SupplierModal'
import ProductModal, { type ProductFormData } from './ProductModal'
import KitGroupModal, { type KitGroupFormData } from './KitGroupModal'
import AddKitModal, { type AddKitFormData } from './AddKitModal'
import InventorySettingsModal from './InventorySettingsModal'
import StockCheckRequestModal from './StockCheckRequestModal'
import PriceCheckRequestModal from './PriceCheckRequestModal'
import type {
  InventoryKitGroup,
  InventoryProduct,
  InventoryUnit,
  MaterialSupplier,
  UnitType,
  UserRole,
} from '@/types'

export interface InventoryProfileOption {
  id: string
  display_name: string | null
}

export interface PendingStockCheckInfo {
  taskId: string
  assigneeId: string | null
  assigneeName: string
}

export interface PendingPriceCheckInfo {
  taskId: string
  assigneeId: string | null
  assigneeName: string
}

interface Props {
  userRole: UserRole
  currentUserId: string
  initialSuppliers: MaterialSupplier[]
  initialProducts: InventoryProduct[]
  initialKitGroups: InventoryKitGroup[]
  initialUnitTypes: UnitType[]
  profiles: InventoryProfileOption[]
  /** Keyed by task id — the pending stock check task → assignee info. */
  initialPendingStockChecks: Record<string, PendingStockCheckInfo>
  /** Keyed by task id — the pending price check task → assignee info. */
  initialPendingPriceChecks: Record<string, PendingPriceCheckInfo>
}

function formatStockCheckDate(value: string | null): string {
  if (!value) return 'Never'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type StockCheckLevel = 'pending' | 'never' | 'fresh' | 'stale' | 'overdue'

/**
 * Derive a stock check status level for color-coding and status dots.
 * "pending" (an open task exists) always overrides date-based staleness.
 */
function getStockCheckLevel(
  stockCheckDate: string | null,
  hasPendingTask: boolean
): StockCheckLevel {
  if (hasPendingTask) return 'pending'
  if (!stockCheckDate) return 'never'
  const d = new Date(stockCheckDate)
  if (Number.isNaN(d.getTime())) return 'never'
  const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays >= 60) return 'overdue'
  if (ageDays >= 30) return 'stale'
  return 'fresh'
}

function stockCheckDateClass(level: StockCheckLevel): string {
  switch (level) {
    case 'overdue':
      return 'text-red-600 dark:text-red-400 font-medium'
    case 'stale':
      return 'text-amber-600 dark:text-amber-400 font-medium'
    case 'fresh':
      return 'text-green-600 dark:text-green-400'
    case 'pending':
      return 'text-amber-600 dark:text-amber-400'
    case 'never':
    default:
      return 'text-gray-400 dark:text-[#6b6b6b] italic'
  }
}

function stockCheckDotClass(level: StockCheckLevel): string {
  switch (level) {
    case 'overdue':
      return 'bg-red-500'
    case 'stale':
      return 'bg-amber-500'
    case 'fresh':
      return 'bg-green-500'
    case 'pending':
      return 'bg-amber-500 animate-pulse'
    case 'never':
    default:
      return 'bg-gray-300 dark:bg-[#4a4a4a]'
  }
}

function stockCheckDotTitle(level: StockCheckLevel): string {
  switch (level) {
    case 'overdue':
      return 'Overdue — last check was 60+ days ago'
    case 'stale':
      return 'Due soon — last check was 30+ days ago'
    case 'fresh':
      return 'Recently checked'
    case 'pending':
      return 'Stock check requested and pending'
    case 'never':
    default:
      return 'Never checked'
  }
}

type PriceCheckLevel = 'pending' | 'never' | 'fresh' | 'stale' | 'overdue'

function getPriceCheckLevel(
  priceCheckDate: string | null,
  hasPendingTask: boolean
): PriceCheckLevel {
  if (hasPendingTask) return 'pending'
  if (!priceCheckDate) return 'never'
  const d = new Date(priceCheckDate)
  if (Number.isNaN(d.getTime())) return 'never'
  const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays >= 60) return 'overdue'
  if (ageDays >= 30) return 'stale'
  return 'fresh'
}

function priceCheckDateClass(level: PriceCheckLevel): string {
  switch (level) {
    case 'overdue':
      return 'text-red-600 dark:text-red-400 font-medium'
    case 'stale':
      return 'text-amber-600 dark:text-amber-400 font-medium'
    case 'fresh':
      return 'text-green-600 dark:text-green-400'
    case 'pending':
      return 'text-amber-600 dark:text-amber-400'
    case 'never':
    default:
      return 'text-gray-400 dark:text-[#6b6b6b] italic'
  }
}

/* ================================================================== */
/*  SUPPLIER COLOR MAP                                                 */
/* ================================================================== */

const SUPPLIER_COLOR_MAP: Record<string, { bar: string; tint: string }> = {
  amber:  { bar: '#92600a', tint: 'rgba(146, 96, 10, 0.32)' },
  blue:   { bar: '#2563a8', tint: 'rgba(37, 99, 168, 0.32)' },
  teal:   { bar: '#1d6b4f', tint: 'rgba(29, 107, 79, 0.32)' },
  purple: { bar: '#7c3aed', tint: 'rgba(124, 58, 237, 0.32)' },
  coral:  { bar: '#d85a30', tint: 'rgba(216, 90, 48, 0.32)' },
  pink:   { bar: '#d4537e', tint: 'rgba(212, 83, 126, 0.32)' },
  green:  { bar: '#4a9e22', tint: 'rgba(74, 158, 34, 0.32)' },
  red:    { bar: '#c53030', tint: 'rgba(197, 48, 48, 0.32)' },
  gray:   { bar: '#666666', tint: 'rgba(102, 102, 102, 0.32)' },
  navy:   { bar: '#2d3a8c', tint: 'rgba(45, 58, 140, 0.32)' },
  olive:  { bar: '#6b7c4a', tint: 'rgba(107, 124, 74, 0.32)' },
  cyan:   { bar: '#0891b2', tint: 'rgba(8, 145, 178, 0.32)' },
}

function getSupplierColors(colorKey: string | null) {
  return SUPPLIER_COLOR_MAP[colorKey ?? 'amber'] ?? SUPPLIER_COLOR_MAP.amber
}

/** Convert a timestamptz to a YYYY-MM-DD string for <input type="date">. */
function toDateInputValue(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ================================================================== */
/*  INLINE QUANTITY EDITOR                                             */
/* ================================================================== */

interface InlineQuantityEditorProps {
  quantity: number
  unit: InventoryUnit
  disabled: boolean
  onSave: (newQuantity: number) => Promise<void>
}

/**
 * A click-to-edit quantity cell. Clicking the value replaces it with a
 * number input pre-filled with the current value. Enter / blur commits;
 * Escape cancels. A brief green flash + checkmark signals a successful
 * save. When the user has no manage permission, the cell is a plain
 * read-only span.
 */
function InlineQuantityEditor({
  quantity,
  unit,
  disabled,
  onSave,
}: InlineQuantityEditorProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(String(quantity))
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  const unitLabel = unit === 'gallons' ? 'gal' : unit

  // Keep the local editor value in sync with external changes when we're
  // not actively editing (e.g. stock check completion updates the row).
  useEffect(() => {
    if (!editing) setValue(String(quantity))
  }, [quantity, editing])

  // Focus + select when entering edit mode so the user can type immediately.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEdit() {
    if (disabled) return
    committedRef.current = false
    setValue(String(quantity))
    setEditing(true)
  }

  async function commit() {
    if (committedRef.current) return
    committedRef.current = true
    const parsed = parseFloat(value)
    if (Number.isNaN(parsed) || parsed < 0 || parsed === quantity) {
      // No change or invalid — just exit edit mode without saving.
      setValue(String(quantity))
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(parsed)
      setEditing(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 900)
    } catch {
      setValue(String(quantity))
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    committedRef.current = true
    setValue(String(quantity))
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-[76px] text-sm text-right text-gray-600 dark:text-[#a0a0a0]">
          {quantity}
        </span>
        <span className="w-[40px] text-xs text-gray-500 dark:text-[#6b6b6b] text-left">{unitLabel}</span>
      </span>
    )
  }

  // Both editing and display states use the same fixed-width input so the
  // layout never shifts. In display mode the input is read-only; clicking
  // it enters edit mode.
  const isActive = editing
  const borderColor = justSaved
    ? undefined
    : isActive
      ? 'rgba(180, 83, 9, 0.5)'
      : 'rgba(255, 255, 255, 0.12)'

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={editing ? value : String(quantity)}
        readOnly={!editing}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onClick={() => { if (!editing) startEdit() }}
        onBlur={() => { if (editing) commit() }}
        onKeyDown={editing ? handleKeyDown : undefined}
        aria-label="Quantity"
        className={`w-[76px] rounded px-1.5 py-0.5 text-sm text-right bg-transparent focus:outline-none inventory-qty-input ${
          justSaved
            ? 'border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : isActive
              ? 'border text-gray-900 dark:text-white'
              : 'border text-gray-600 dark:text-[#a0a0a0] cursor-text'
        }`}
        style={
          justSaved
            ? undefined
            : { borderColor: borderColor }
        }
        onMouseEnter={(e) => {
          if (!editing && !justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.22)'
        }}
        onMouseLeave={(e) => {
          if (!editing && !justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
        }}
        onFocus={(e) => {
          if (!justSaved) e.currentTarget.style.borderColor = 'rgba(180, 83, 9, 0.5)'
        }}
        title="Click to edit quantity"
      />
      <span
        className={`w-[40px] text-left ${
          justSaved
            ? 'text-xs text-green-600 dark:text-green-400'
            : 'text-xs text-gray-500 dark:text-[#6b6b6b]'
        }`}
      >
        {unitLabel}
      </span>
      {justSaved && <CheckIcon className="w-3 h-3 text-green-600 dark:text-green-400" />}
    </span>
  )
}

/* ================================================================== */
/*  INLINE PRICE EDITOR                                                */
/* ================================================================== */

interface InlinePriceEditorProps {
  price: number | null
  disabled: boolean
  onSave: (newPrice: number) => Promise<void>
}

function InlinePriceEditor({
  price,
  disabled,
  onSave,
}: InlinePriceEditorProps) {
  const displayPrice = price ?? 0
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(displayPrice.toFixed(2))
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    if (!editing) setValue((price ?? 0).toFixed(2))
  }, [price, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEdit() {
    if (disabled) return
    committedRef.current = false
    setValue(displayPrice.toFixed(2))
    setEditing(true)
  }

  async function commit() {
    if (committedRef.current) return
    committedRef.current = true
    const parsed = parseFloat(value)
    if (Number.isNaN(parsed) || parsed < 0) {
      setValue(displayPrice.toFixed(2))
      setEditing(false)
      return
    }
    const rounded = Math.round(parsed * 100) / 100
    if (rounded === displayPrice) {
      setValue(displayPrice.toFixed(2))
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(rounded)
      setEditing(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 900)
    } catch {
      setValue(displayPrice.toFixed(2))
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    committedRef.current = true
    setValue(displayPrice.toFixed(2))
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (disabled) {
    return (
      <span className="inline-flex items-center">
        <span className="text-xs text-gray-500 dark:text-[#6b6b6b] mr-0.5">$</span>
        <span className="w-[72px] text-sm text-right text-gray-600 dark:text-[#a0a0a0]">
          {displayPrice.toFixed(2)}
        </span>
      </span>
    )
  }

  const isActive = editing
  const borderColor = justSaved
    ? undefined
    : isActive
      ? 'rgba(180, 83, 9, 0.5)'
      : 'rgba(255, 255, 255, 0.12)'

  return (
    <span className="inline-flex items-center">
      <span
        className={`text-xs mr-0.5 ${
          justSaved
            ? 'text-green-600 dark:text-green-400'
            : 'text-gray-500 dark:text-[#6b6b6b]'
        }`}
      >
        $
      </span>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={editing ? value : displayPrice.toFixed(2)}
        readOnly={!editing}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onClick={() => { if (!editing) startEdit() }}
        onBlur={() => { if (editing) commit() }}
        onKeyDown={editing ? handleKeyDown : undefined}
        aria-label="Price"
        className={`w-[72px] rounded px-1.5 py-0.5 text-sm text-right bg-transparent focus:outline-none inventory-qty-input ${
          justSaved
            ? 'border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : isActive
              ? 'border text-gray-900 dark:text-white'
              : 'border text-gray-600 dark:text-[#a0a0a0] cursor-text'
        }`}
        style={
          justSaved
            ? undefined
            : { borderColor: borderColor }
        }
        onMouseEnter={(e) => {
          if (!editing && !justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.22)'
        }}
        onMouseLeave={(e) => {
          if (!editing && !justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
        }}
        onFocus={(e) => {
          if (!justSaved) e.currentTarget.style.borderColor = 'rgba(180, 83, 9, 0.5)'
        }}
        title="Click to edit price"
      />
      {justSaved && <CheckIcon className="w-3 h-3 ml-0.5 text-green-600 dark:text-green-400" />}
    </span>
  )
}

/* ================================================================== */
/*  SORTABLE WRAPPERS                                                  */
/* ================================================================== */

/**
 * A thin wrapper that applies useSortable to a supplier section. We need a
 * separate component because hooks can't be called inside .map().
 */
function SortableSupplierSection({
  id,
  reorderMode,
  children,
  dragHandle,
}: {
  id: string
  reorderMode: boolean
  children: React.ReactNode
  dragHandle?: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? 'z-50 opacity-80' : ''}`}
    >
      {reorderMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -left-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white cursor-grab active:cursor-grabbing touch-none z-10 hidden sm:flex items-center"
          title="Drag to reorder supplier"
        >
          <GripVerticalIcon className="w-4 h-4" />
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * A thin sortable wrapper for product/kit rows.
 */
function SortableItemRow({
  id,
  reorderMode,
  children,
}: {
  id: string
  reorderMode: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center ${isDragging ? 'z-50 relative opacity-80 bg-amber-50 dark:bg-amber-900/10' : ''}`}
    >
      {reorderMode && (
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 w-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white cursor-grab active:cursor-grabbing touch-none"
          title="Drag to reorder"
        >
          <GripVerticalIcon className="w-3.5 h-3.5" />
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export default function InventoryPageClient({
  userRole,
  currentUserId,
  initialSuppliers,
  initialProducts,
  initialKitGroups,
  initialUnitTypes,
  profiles,
  initialPendingStockChecks,
  initialPendingPriceChecks,
}: Props) {
  const supabase = createClient()

  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>(initialSuppliers)
  const [products, setProducts] = useState<InventoryProduct[]>(initialProducts)
  const [kitGroups, setKitGroups] = useState<InventoryKitGroup[]>(initialKitGroups)
  const [unitTypes, setUnitTypes] = useState<UnitType[]>(initialUnitTypes)

  // Pending stock check lookup keyed by task id. When a new request is made,
  // we insert the new task info here keyed by the newly created task id.
  const [pendingStockChecks, setPendingStockChecks] = useState<
    Record<string, PendingStockCheckInfo>
  >(initialPendingStockChecks)

  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set())

  // Reorder mode (admin only)
  const [reorderModeRaw, setReorderMode] = useState(false)
  const reorderMode = reorderModeRaw && (userRole === 'admin')

  // Settings modal state
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  // Supplier modal state
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<MaterialSupplier | null>(null)

  // Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)
  const [productModalSupplierId, setProductModalSupplierId] = useState<string | null>(null)

  // Kit group EDIT modal state (reuses the legacy KitGroupModal for edits —
  // the new Add flow uses AddKitModal, which creates kit + products in one
  // step).
  const [kitGroupModalOpen, setKitGroupModalOpen] = useState(false)
  const [editingKitGroup, setEditingKitGroup] = useState<InventoryKitGroup | null>(null)
  const [kitGroupModalSupplierId, setKitGroupModalSupplierId] = useState<string | null>(null)

  // Combined Add Kit modal state — captures kit name + sub-item product rows
  // in a single step.
  const [addKitModalOpen, setAddKitModalOpen] = useState(false)
  const [addKitSupplierId, setAddKitSupplierId] = useState<string | null>(null)

  // Stock check request modal state
  const [stockCheckProduct, setStockCheckProduct] = useState<InventoryProduct | null>(null)

  // Price check request modal state + pending lookup (mirrors stock check)
  const [priceCheckProduct, setPriceCheckProduct] = useState<InventoryProduct | null>(null)
  const [pendingPriceChecks, setPendingPriceChecks] = useState<
    Record<string, PendingPriceCheckInfo>
  >(initialPendingPriceChecks)

  // Hidden date input used to open a native date picker for manual override.
  // We reuse a single input and re-target it per product to avoid one input
  // per row.
  const manualDateInputRef = useRef<HTMLInputElement>(null)
  const [manualDateProductId, setManualDateProductId] = useState<string | null>(null)

  // Hidden date input for manual price check date override.
  const manualPriceDateInputRef = useRef<HTMLInputElement>(null)
  const [manualPriceDateProductId, setManualPriceDateProductId] = useState<string | null>(null)

  // Delete confirm state
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<MaterialSupplier | null>(null)
  const [deleteProductTarget, setDeleteProductTarget] = useState<InventoryProduct | null>(null)
  const [deleteKitGroupTarget, setDeleteKitGroupTarget] = useState<InventoryKitGroup | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canManage =
    userRole === 'admin' || userRole === 'office_manager' || userRole === 'salesman'
  const canDelete = userRole === 'admin' || userRole === 'office_manager'
  const canReorder = userRole === 'admin'

  // dnd-kit sensors: 5px distance before drag starts to avoid accidental drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  // Group products by supplier id for quick render.
  const productsBySupplier = useMemo(() => {
    const map = new Map<string, InventoryProduct[]>()
    for (const p of products) {
      const arr = map.get(p.supplier_id) ?? []
      arr.push(p)
      map.set(p.supplier_id, arr)
    }
    return map
  }, [products])

  // Group kit groups by supplier id.
  const kitGroupsBySupplier = useMemo(() => {
    const map = new Map<string, InventoryKitGroup[]>()
    const sorted = [...kitGroups].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.name.localeCompare(b.name)
    })
    for (const g of sorted) {
      const arr = map.get(g.supplier_id) ?? []
      arr.push(g)
      map.set(g.supplier_id, arr)
    }
    return map
  }, [kitGroups])

  function toggleSupplierCollapsed(id: string) {
    setCollapsedSuppliers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* ================================================================ */
  /*  SUPPLIER CRUD                                                    */
  /* ================================================================ */

  function openAddSupplier() {
    setEditingSupplier(null)
    setSupplierModalOpen(true)
  }

  function openEditSupplier(supplier: MaterialSupplier) {
    setEditingSupplier(supplier)
    setSupplierModalOpen(true)
  }

  async function saveSupplier(name: string, color: string) {
    const trimmed = name.trim()
    if (!trimmed) return

    if (editingSupplier) {
      const previous = editingSupplier
      setSuppliers((prev) =>
        prev.map((s) => (s.id === previous.id ? { ...s, name: trimmed, color } : s))
      )
      const { error } = await supabase
        .from('material_suppliers')
        .update({ name: trimmed, color })
        .eq('id', previous.id)
      if (error) {
        setSuppliers((prev) =>
          prev.map((s) => (s.id === previous.id ? previous : s))
        )
      }
    } else {
      const { data, error } = await supabase
        .from('material_suppliers')
        .insert({ name: trimmed, color })
        .select()
        .single()
      if (!error && data) {
        setSuppliers((prev) =>
          [...prev, data as MaterialSupplier].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        )
      }
    }

    setSupplierModalOpen(false)
    setEditingSupplier(null)
  }

  async function confirmDeleteSupplier() {
    if (!deleteSupplierTarget) return
    const target = deleteSupplierTarget
    setDeleting(true)
    const { error } = await supabase
      .from('material_suppliers')
      .delete()
      .eq('id', target.id)
    if (!error) {
      setSuppliers((prev) => prev.filter((s) => s.id !== target.id))
      setProducts((prev) => prev.filter((p) => p.supplier_id !== target.id))
      setKitGroups((prev) => prev.filter((g) => g.supplier_id !== target.id))
    }
    setDeleting(false)
    setDeleteSupplierTarget(null)
  }

  /* ================================================================ */
  /*  PRODUCT CRUD                                                     */
  /* ================================================================ */

  function openAddProduct(supplierId?: string) {
    setEditingProduct(null)
    setProductModalSupplierId(supplierId ?? null)
    setProductModalOpen(true)
  }

  function openEditProduct(product: InventoryProduct) {
    setEditingProduct(product)
    setProductModalSupplierId(product.supplier_id)
    setProductModalOpen(true)
  }

  async function saveProduct(data: ProductFormData) {
    const trimmedName = data.name.trim()
    // For edits use the existing product's supplier; for adds use the form's supplier_id.
    const supplierId = editingProduct
      ? productModalSupplierId ?? editingProduct.supplier_id
      : data.supplier_id ?? productModalSupplierId
    if (!trimmedName || !supplierId) return

    if (editingProduct) {
      const previous = editingProduct
      setProducts((prev) =>
        prev.map((p) =>
          p.id === previous.id
            ? {
                ...p,
                name: trimmedName,
                quantity: data.quantity,
                unit: data.unit,
                kit_group_id: data.kit_group_id,
              }
            : p
        )
      )
      const { error } = await supabase
        .from('inventory_products')
        .update({
          name: trimmedName,
          quantity: data.quantity,
          unit: data.unit,
          kit_group_id: data.kit_group_id,
        })
        .eq('id', previous.id)
      if (error) {
        setProducts((prev) => prev.map((p) => (p.id === previous.id ? previous : p)))
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('inventory_products')
        .insert({
          supplier_id: supplierId,
          name: trimmedName,
          quantity: data.quantity,
          unit: data.unit,
          kit_group_id: data.kit_group_id,
        })
        .select()
        .single()
      if (!error && inserted) {
        setProducts((prev) => [...prev, inserted as InventoryProduct])
      }
    }

    setProductModalOpen(false)
    setEditingProduct(null)
    setProductModalSupplierId(null)
  }

  async function confirmDeleteProduct() {
    if (!deleteProductTarget) return
    const target = deleteProductTarget
    setDeleting(true)
    const { error } = await supabase
      .from('inventory_products')
      .delete()
      .eq('id', target.id)
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== target.id))
    }
    setDeleting(false)
    setDeleteProductTarget(null)
  }

  /* ================================================================ */
  /*  KIT GROUP CRUD                                                   */
  /* ================================================================ */

  function openAddKit(supplierId?: string) {
    setAddKitSupplierId(supplierId ?? null)
    setAddKitModalOpen(true)
  }

  function openEditKitGroup(kitGroup: InventoryKitGroup) {
    setEditingKitGroup(kitGroup)
    setKitGroupModalSupplierId(kitGroup.supplier_id)
    setKitGroupModalOpen(true)
  }

  /**
   * Combined save handler for the new Add Kit modal. Inserts the kit_group
   * row, then inserts an inventory_products row per sub-item linked via
   * kit_group_id. On sub-item failure the freshly-created kit is rolled
   * back so the UI isn't left with an empty phantom kit.
   */
  async function saveNewKit(data: AddKitFormData) {
    const supplierId = data.supplier_id ?? addKitSupplierId
    if (!supplierId) return

    // 1. Insert the kit group. The legacy full_kits/partial_kits columns
    //    still exist on the table (Phase 4 only hid them) so we pass
    //    explicit zeros to satisfy any NOT NULL constraints.
    const { data: insertedKit, error: kitErr } = await supabase
      .from('inventory_kit_groups')
      .insert({
        supplier_id: supplierId,
        name: data.name,
        full_kits: 0,
        full_kit_size: null,
        partial_kits: 0,
        partial_kit_size: null,
      })
      .select()
      .single()
    if (kitErr || !insertedKit) {
      throw kitErr ?? new Error('Failed to create kit.')
    }
    const kit = insertedKit as InventoryKitGroup

    // 2. Insert the sub-item products, all linked to the new kit.
    if (data.products.length > 0) {
      const rows = data.products.map((p) => ({
        supplier_id: supplierId,
        kit_group_id: kit.id,
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
      }))
      const { data: insertedProducts, error: prodErr } = await supabase
        .from('inventory_products')
        .insert(rows)
        .select()
      if (prodErr) {
        // Roll back the kit so we don't leave an orphan.
        await supabase.from('inventory_kit_groups').delete().eq('id', kit.id)
        throw prodErr
      }
      setProducts((prev) => [
        ...prev,
        ...((insertedProducts ?? []) as InventoryProduct[]),
      ])
    }

    setKitGroups((prev) => [...prev, kit])
    setAddKitModalOpen(false)
    setAddKitSupplierId(null)
  }

  /**
   * Persist a new quantity for a product (called from the inline editor).
   * Optimistic update with rollback on Supabase error. Throws so the editor
   * can reset its local display when the save fails.
   */
  async function saveProductQuantity(productId: string, newQuantity: number) {
    const previous = products.find((p) => p.id === productId)
    if (!previous) return
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, quantity: newQuantity } : p))
    )
    const { error } = await supabase
      .from('inventory_products')
      .update({ quantity: newQuantity })
      .eq('id', productId)
    if (error) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? previous : p))
      )
      throw error
    }
  }

  /**
   * Persist a new price for a product (called from the inline price editor).
   */
  async function saveProductPrice(productId: string, newPrice: number) {
    const previous = products.find((p) => p.id === productId)
    if (!previous) return
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, price: newPrice } : p))
    )
    const { error } = await supabase
      .from('inventory_products')
      .update({ price: newPrice })
      .eq('id', productId)
    if (error) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? previous : p))
      )
      throw error
    }
  }

  /**
   * Persist a new kit_price for a kit group (called from the inline price
   * editor on kit group header rows).
   */
  async function saveKitGroupPrice(kitGroupId: string, newPrice: number) {
    const previous = kitGroups.find((g) => g.id === kitGroupId)
    if (!previous) return
    setKitGroups((prev) =>
      prev.map((g) => (g.id === kitGroupId ? { ...g, kit_price: newPrice } : g))
    )
    const { error } = await supabase
      .from('inventory_kit_groups')
      .update({ kit_price: newPrice })
      .eq('id', kitGroupId)
    if (error) {
      setKitGroups((prev) =>
        prev.map((g) => (g.id === kitGroupId ? previous : g))
      )
      throw error
    }
  }

  async function saveKitGroup(data: KitGroupFormData) {
    if (!kitGroupModalSupplierId) return

    if (editingKitGroup) {
      const previous = editingKitGroup
      setKitGroups((prev) =>
        prev.map((g) =>
          g.id === previous.id
            ? {
                ...g,
                name: data.name,
                full_kits: data.full_kits,
                full_kit_size: data.full_kit_size,
                partial_kits: data.partial_kits,
                partial_kit_size: data.partial_kit_size,
              }
            : g
        )
      )
      const { error } = await supabase
        .from('inventory_kit_groups')
        .update({
          name: data.name,
          full_kits: data.full_kits,
          full_kit_size: data.full_kit_size,
          partial_kits: data.partial_kits,
          partial_kit_size: data.partial_kit_size,
        })
        .eq('id', previous.id)
      if (error) {
        setKitGroups((prev) => prev.map((g) => (g.id === previous.id ? previous : g)))
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('inventory_kit_groups')
        .insert({
          supplier_id: kitGroupModalSupplierId,
          name: data.name,
          full_kits: data.full_kits,
          full_kit_size: data.full_kit_size,
          partial_kits: data.partial_kits,
          partial_kit_size: data.partial_kit_size,
        })
        .select()
        .single()
      if (!error && inserted) {
        setKitGroups((prev) => [...prev, inserted as InventoryKitGroup])
      }
    }

    setKitGroupModalOpen(false)
    setEditingKitGroup(null)
    setKitGroupModalSupplierId(null)
  }

  async function confirmDeleteKitGroup() {
    if (!deleteKitGroupTarget) return
    const target = deleteKitGroupTarget
    setDeleting(true)
    const { error } = await supabase
      .from('inventory_kit_groups')
      .delete()
      .eq('id', target.id)
    if (!error) {
      setKitGroups((prev) => prev.filter((g) => g.id !== target.id))
      // ON DELETE SET NULL on the FK unlinks products in the DB — mirror it
      // locally so the UI shows them as standalone immediately.
      setProducts((prev) =>
        prev.map((p) =>
          p.kit_group_id === target.id ? { ...p, kit_group_id: null } : p
        )
      )
    }
    setDeleting(false)
    setDeleteKitGroupTarget(null)
  }

  /* ================================================================ */
  /*  STOCK CHECK REQUEST                                              */
  /* ================================================================ */

  /**
   * Create an office_task assigned to the selected user and link it back to
   * the product via inventory_products.stock_check_task_id. When the assignee
   * marks the task complete from My Work / Office Tasks, the shared
   * toggleOfficeTaskCompletion utility auto-updates stock_check_date and
   * clears the link (see src/lib/officeTaskCompletion.ts).
   */
  async function submitStockCheckRequest(assignedToId: string) {
    if (!stockCheckProduct) return
    const product = stockCheckProduct
    const supplier = suppliers.find((s) => s.id === product.supplier_id)
    const supplierName = supplier?.name ?? ''
    const title = supplierName
      ? `Stock Check: ${product.name} (${supplierName})`
      : `Stock Check: ${product.name}`

    // Insert the office task first so we have an id to link back.
    const { data: inserted, error: taskErr } = await supabase
      .from('office_tasks')
      .insert({
        title,
        description: `Stock check request for ${product.name}. Please count current inventory and mark this task complete — the Stock Check Date on the product will update automatically.`,
        assigned_to: assignedToId,
        priority: 'Normal',
        created_by: currentUserId,
      })
      .select('id')
      .single()
    if (taskErr || !inserted) {
      throw taskErr ?? new Error('Failed to create stock check task.')
    }
    const newTaskId = (inserted as { id: string }).id

    // Link the product to the new task.
    const { error: linkErr } = await supabase
      .from('inventory_products')
      .update({ stock_check_task_id: newTaskId })
      .eq('id', product.id)
    if (linkErr) {
      // Best-effort cleanup so we don't leave an orphaned task lying around.
      await supabase.from('office_tasks').delete().eq('id', newTaskId)
      throw linkErr
    }

    // Update local state optimistically so the row flips to "Pending" immediately.
    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id ? { ...p, stock_check_task_id: newTaskId } : p
      )
    )
    const assignee = profiles.find((p) => p.id === assignedToId)
    setPendingStockChecks((prev) => ({
      ...prev,
      [newTaskId]: {
        taskId: newTaskId,
        assigneeId: assignedToId,
        assigneeName: assignee?.display_name ?? 'Unknown',
      },
    }))

    setStockCheckProduct(null)
  }

  /* ================================================================ */
  /*  MANUAL STOCK CHECK DATE OVERRIDE                                 */
  /* ================================================================ */

  function openManualDatePicker(product: InventoryProduct) {
    if (!canManage) return
    setManualDateProductId(product.id)
    // Defer so the hidden input is in the DOM and targeting the new id.
    requestAnimationFrame(() => {
      const input = manualDateInputRef.current
      if (!input) return
      input.value = toDateInputValue(product.stock_check_date)
      // Use showPicker() when available so the native date UI appears right
      // at the click location. Fall back to focus()+click() on browsers
      // without showPicker support.
      if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
        ;(input as HTMLInputElement & { showPicker: () => void }).showPicker()
      } else {
        input.focus()
        input.click()
      }
    })
  }

  async function handleManualDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const productId = manualDateProductId
    const newValue = e.target.value
    setManualDateProductId(null)
    if (!productId || !newValue) return

    const previous = products.find((p) => p.id === productId)
    if (!previous) return

    // Store at local noon so the rendered date matches what the user picked
    // regardless of timezone offset.
    const isoDate = new Date(`${newValue}T12:00:00`).toISOString()

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stock_check_date: isoDate } : p))
    )
    const { error } = await supabase
      .from('inventory_products')
      .update({ stock_check_date: isoDate })
      .eq('id', productId)
    if (error) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, stock_check_date: previous.stock_check_date } : p
        )
      )
    }
  }

  /* ================================================================ */
  /*  PRICE CHECK REQUEST                                              */
  /* ================================================================ */

  async function submitPriceCheckRequest(assignedToId: string) {
    if (!priceCheckProduct) return
    const product = priceCheckProduct
    const supplier = suppliers.find((s) => s.id === product.supplier_id)
    const supplierName = supplier?.name ?? ''
    const title = supplierName
      ? `Price Check: ${product.name} (${supplierName})`
      : `Price Check: ${product.name}`

    const { data: inserted, error: taskErr } = await supabase
      .from('office_tasks')
      .insert({
        title,
        description: `Price check request for ${product.name}. Please verify the current price with the supplier and mark this task complete — the Price Check Date on the product will update automatically.`,
        assigned_to: assignedToId,
        priority: 'Normal',
        created_by: currentUserId,
      })
      .select('id')
      .single()
    if (taskErr || !inserted) {
      throw taskErr ?? new Error('Failed to create price check task.')
    }
    const newTaskId = (inserted as { id: string }).id

    const { error: linkErr } = await supabase
      .from('inventory_products')
      .update({ price_check_task_id: newTaskId })
      .eq('id', product.id)
    if (linkErr) {
      await supabase.from('office_tasks').delete().eq('id', newTaskId)
      throw linkErr
    }

    setProducts((prev) =>
      prev.map((p) =>
        p.id === product.id ? { ...p, price_check_task_id: newTaskId } : p
      )
    )
    const assignee = profiles.find((p) => p.id === assignedToId)
    setPendingPriceChecks((prev) => ({
      ...prev,
      [newTaskId]: {
        taskId: newTaskId,
        assigneeId: assignedToId,
        assigneeName: assignee?.display_name ?? 'Unknown',
      },
    }))

    setPriceCheckProduct(null)
  }

  /* ================================================================ */
  /*  MANUAL PRICE CHECK DATE OVERRIDE                                 */
  /* ================================================================ */

  function openManualPriceDatePicker(product: InventoryProduct) {
    if (!canManage) return
    setManualPriceDateProductId(product.id)
    requestAnimationFrame(() => {
      const input = manualPriceDateInputRef.current
      if (!input) return
      input.value = toDateInputValue(product.price_check_date)
      if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
        ;(input as HTMLInputElement & { showPicker: () => void }).showPicker()
      } else {
        input.focus()
        input.click()
      }
    })
  }

  async function handleManualPriceDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const productId = manualPriceDateProductId
    const newValue = e.target.value
    setManualPriceDateProductId(null)
    if (!productId || !newValue) return

    const previous = products.find((p) => p.id === productId)
    if (!previous) return

    const isoDate = new Date(`${newValue}T12:00:00`).toISOString()

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, price_check_date: isoDate } : p))
    )
    const { error } = await supabase
      .from('inventory_products')
      .update({ price_check_date: isoDate })
      .eq('id', productId)
    if (error) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, price_check_date: previous.price_check_date } : p
        )
      )
    }
  }

  /* ================================================================ */
  /*  DRAG-AND-DROP REORDER                                            */
  /* ================================================================ */

  async function handleSupplierDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = suppliers.findIndex((s) => s.id === active.id)
    const newIdx = suppliers.findIndex((s) => s.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = [...suppliers]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, sort_order: i + 1 }))
    setSuppliers(updated)
    for (const s of updated) {
      await supabase.from('material_suppliers').update({ sort_order: s.sort_order }).eq('id', s.id)
    }
  }

  /**
   * Reorder items within a single supplier. The items list is a flat array of
   * product ids and kit-group ids (prefixed with "kg-" to avoid id collisions).
   * After reorder we write sort_order back to both inventory_products and
   * inventory_kit_groups tables for the affected supplier.
   */
  async function handleItemDragEnd(supplierId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Build a flat ordered list of items for this supplier: standalone products
    // first, then kit groups interleaved with their nested products — matching
    // the render order.
    const supplierProducts = productsBySupplier.get(supplierId) ?? []
    const supplierKitGroups = kitGroupsBySupplier.get(supplierId) ?? []
    const standalone = supplierProducts
      .filter((p) => !p.kit_group_id)
      .sort((a, b) => (a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name)))
    const productsByGroup = new Map<string, InventoryProduct[]>()
    for (const p of supplierProducts) {
      if (!p.kit_group_id) continue
      const arr = productsByGroup.get(p.kit_group_id) ?? []
      arr.push(p)
      productsByGroup.set(p.kit_group_id, arr)
    }

    type FlatItem = { type: 'product'; id: string } | { type: 'kitgroup'; id: string }
    const flatItems: FlatItem[] = []
    for (const p of standalone) flatItems.push({ type: 'product', id: p.id })
    for (const g of supplierKitGroups) {
      flatItems.push({ type: 'kitgroup', id: g.id })
      const gp = [...(productsByGroup.get(g.id) ?? [])].sort((a, b) =>
        a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name)
      )
      for (const p of gp) flatItems.push({ type: 'product', id: p.id })
    }

    const activeKey = active.id as string
    const overKey = over.id as string
    const oldIdx = flatItems.findIndex((item) =>
      item.type === 'kitgroup' ? `kg-${item.id}` === activeKey : item.id === activeKey
    )
    const newIdx = flatItems.findIndex((item) =>
      item.type === 'kitgroup' ? `kg-${item.id}` === overKey : item.id === overKey
    )
    if (oldIdx < 0 || newIdx < 0) return

    const reordered = [...flatItems]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)

    // Write back sort_order separately for products and kit groups.
    let productOrder = 1
    let kitGroupOrder = 1
    const productUpdates: { id: string; sort_order: number }[] = []
    const kitGroupUpdates: { id: string; sort_order: number }[] = []
    for (const item of reordered) {
      if (item.type === 'product') {
        productUpdates.push({ id: item.id, sort_order: productOrder++ })
      } else {
        kitGroupUpdates.push({ id: item.id, sort_order: kitGroupOrder++ })
      }
    }

    // Optimistic local update
    setProducts((prev) => {
      const updates = new Map(productUpdates.map((u) => [u.id, u.sort_order]))
      return prev.map((p) => (updates.has(p.id) ? { ...p, sort_order: updates.get(p.id)! } : p))
    })
    setKitGroups((prev) => {
      const updates = new Map(kitGroupUpdates.map((u) => [u.id, u.sort_order]))
      return prev.map((g) => (updates.has(g.id) ? { ...g, sort_order: updates.get(g.id)! } : g))
    })

    // Persist
    for (const u of productUpdates) {
      await supabase.from('inventory_products').update({ sort_order: u.sort_order }).eq('id', u.id)
    }
    for (const u of kitGroupUpdates) {
      await supabase.from('inventory_kit_groups').update({ sort_order: u.sort_order }).eq('id', u.id)
    }
  }

  /* ================================================================ */
  /*  RENDER HELPERS                                                   */
  /* ================================================================ */

  function renderProductRow(product: InventoryProduct, nested = false) {
    const pendingInfo = product.stock_check_task_id
      ? pendingStockChecks[product.stock_check_task_id]
      : undefined
    const hasPending = !!product.stock_check_task_id
    const level = getStockCheckLevel(product.stock_check_date, hasPending)
    const dateText = formatStockCheckDate(product.stock_check_date)
    const dateClass = stockCheckDateClass(level)

    const pricePendingInfo = product.price_check_task_id
      ? pendingPriceChecks[product.price_check_task_id]
      : undefined
    const hasPricePending = !!product.price_check_task_id
    const priceLevel = getPriceCheckLevel(product.price_check_date, hasPricePending)
    const priceDateText = formatStockCheckDate(product.price_check_date)
    const priceDateClass = priceCheckDateClass(priceLevel)

    return (
      <div
        key={product.id}
        className="sm:grid sm:grid-cols-[1fr_100px_120px_120px_90px_120px_120px_60px] gap-2 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors min-w-[900px]"
      >
        {/* Product name + status dot */}
        <div
          className={`flex items-center gap-2 min-w-0 ${nested ? 'pl-5 sm:pl-6' : ''}`}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${stockCheckDotClass(level)}`}
            title={stockCheckDotTitle(level)}
            aria-label={stockCheckDotTitle(level)}
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {product.name}
          </span>
        </div>
        {/* Quantity */}
        <div className="mt-1 sm:mt-0 text-sm text-gray-600 dark:text-[#a0a0a0] sm:text-right">
          <span className="sm:hidden text-xs text-gray-400 dark:text-[#6b6b6b] mr-1">
            Qty:
          </span>
          <InlineQuantityEditor
            quantity={product.quantity}
            unit={product.unit as InventoryUnit}
            disabled={!canManage}
            onSave={(q) => saveProductQuantity(product.id, q)}
          />
        </div>
        {/* Stock check request */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
            Stock check:
          </span>
          {hasPending ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40"
              title={`Pending — assigned to ${pendingInfo?.assigneeName ?? 'Unknown'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Pending
              {pendingInfo?.assigneeName && (
                <span className="hidden lg:inline text-amber-600 dark:text-amber-400 font-normal">
                  · {pendingInfo.assigneeName}
                </span>
              )}
            </span>
          ) : canManage ? (
            <button
              type="button"
              onClick={() => setStockCheckProduct(product)}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40 transition-colors"
              title="Request a stock check"
            >
              Stock Check
            </button>
          ) : (
            <span className="text-gray-400 dark:text-[#6b6b6b]">—</span>
          )}
        </div>
        {/* Stock check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
            Stock date:
          </span>
          {canManage ? (
            <button
              type="button"
              onClick={() => openManualDatePicker(product)}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors ${dateClass}`}
              title="Click to set the date manually"
            >
              <CalendarIcon className="w-3 h-3 opacity-60" />
              {dateText}
            </button>
          ) : (
            <span className={dateClass}>{dateText}</span>
          )}
        </div>
        {/* Price */}
        <div className="mt-1 sm:mt-0 text-sm text-gray-600 dark:text-[#a0a0a0] sm:text-right">
          <span className="sm:hidden text-xs text-gray-400 dark:text-[#6b6b6b] mr-1">
            Price:
          </span>
          <InlinePriceEditor
            price={product.price}
            disabled={!canManage}
            onSave={(p) => saveProductPrice(product.id, p)}
          />
        </div>
        {/* Price check request */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
            Price check:
          </span>
          {hasPricePending ? (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40"
              title={`Pending — assigned to ${pricePendingInfo?.assigneeName ?? 'Unknown'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Pending
              {pricePendingInfo?.assigneeName && (
                <span className="hidden lg:inline text-amber-600 dark:text-amber-400 font-normal">
                  · {pricePendingInfo.assigneeName}
                </span>
              )}
            </span>
          ) : canManage ? (
            <button
              type="button"
              onClick={() => setPriceCheckProduct(product)}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40 transition-colors"
              title="Request a price check"
            >
              Price Check
            </button>
          ) : (
            <span className="text-gray-400 dark:text-[#6b6b6b]">—</span>
          )}
        </div>
        {/* Price check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
            Price date:
          </span>
          {canManage ? (
            <button
              type="button"
              onClick={() => openManualPriceDatePicker(product)}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors ${priceDateClass}`}
              title="Click to set the price check date manually"
            >
              <CalendarIcon className="w-3 h-3 opacity-60" />
              {priceDateText}
            </button>
          ) : (
            <span className={priceDateClass}>{priceDateText}</span>
          )}
        </div>
        {/* Actions */}
        <div className="mt-2 sm:mt-0 flex sm:justify-end items-center gap-1">
          {canManage && (
            <button
              onClick={() => openEditProduct(product)}
              className="p-1.5 text-gray-400 hover:text-amber-500 dark:text-[#6b6b6b] dark:hover:text-amber-400 transition-colors"
              title="Edit product"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteProductTarget(product)}
              className="p-1.5 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 transition-colors"
              title="Delete product"
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  /**
   * Renders a kit group name as a regular-looking product row (same font,
   * weight, color, and column layout as standalone products). The quantity,
   * stock check request, and stock check date cells are intentionally dashes
   * because those are properties of individual products, not of the group
   * itself. Edit/delete actions for the group live in the Actions column.
   */
  function renderKitGroupHeaderRow(group: InventoryKitGroup) {
    return (
      <div
        key={`kit-group-${group.id}`}
        className="sm:grid sm:grid-cols-[1fr_100px_120px_120px_90px_120px_120px_60px] gap-2 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors min-w-[900px]"
      >
        {/* Group name */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {group.name}
          </span>
        </div>
        {/* Quantity */}
        <div className="mt-1 sm:mt-0 text-sm text-gray-400 dark:text-[#6b6b6b] sm:text-right">
          <span className="sm:hidden text-xs text-gray-400 dark:text-[#6b6b6b] mr-1">
            Qty:
          </span>
          —
        </div>
        {/* Stock check request */}
        <div className="mt-1 sm:mt-0 text-xs text-gray-400 dark:text-[#6b6b6b] sm:text-center">
          <span className="sm:hidden mr-1">Stock check:</span>
          —
        </div>
        {/* Stock check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm text-gray-400 dark:text-[#6b6b6b] sm:text-center">
          <span className="sm:hidden mr-1">Stock date:</span>
          —
        </div>
        {/* Kit Price — editable on the kit group row */}
        <div className="mt-1 sm:mt-0 text-sm text-gray-600 dark:text-[#a0a0a0] sm:text-right">
          <span className="sm:hidden text-xs text-gray-400 dark:text-[#6b6b6b] mr-1">
            Price:
          </span>
          <InlinePriceEditor
            price={group.kit_price}
            disabled={!canManage}
            onSave={(p) => saveKitGroupPrice(group.id, p)}
          />
        </div>
        {/* Price check request */}
        <div className="mt-1 sm:mt-0 text-xs text-gray-400 dark:text-[#6b6b6b] sm:text-center">
          <span className="sm:hidden mr-1">Price check:</span>
          —
        </div>
        {/* Price check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm text-gray-400 dark:text-[#6b6b6b] sm:text-center">
          <span className="sm:hidden mr-1">Price date:</span>
          —
        </div>
        {/* Actions */}
        <div className="mt-2 sm:mt-0 flex sm:justify-end items-center gap-1">
          {canManage && (
            <button
              onClick={() => openEditKitGroup(group)}
              className="p-1.5 text-gray-400 hover:text-amber-500 dark:text-[#6b6b6b] dark:hover:text-amber-400 transition-colors"
              title="Edit kit group"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteKitGroupTarget(group)}
              className="p-1.5 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 transition-colors"
              title="Delete kit group"
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="w-full min-h-full bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#242424]">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/office"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-[#a0a0a0] dark:hover:text-white transition-colors mr-2"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Office</span>
          </Link>
          <PackageIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate">
            Inventory Management
          </h1>
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {canReorder && (
              <button
                onClick={() => setReorderMode((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${
                  reorderMode
                    ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-300 dark:ring-amber-700'
                    : 'text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2e2e2e]'
                }`}
                title={reorderMode ? 'Exit reorder mode' : 'Reorder items'}
              >
                <ArrowUpDownIcon className="w-4.5 h-4.5" />
              </button>
            )}
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-lg transition-colors"
              title="Inventory Settings"
            >
              <Settings2Icon className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => openAddProduct()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition border border-gray-300 dark:border-[#3a3a3a] text-gray-700 dark:text-[#a0a0a0] bg-white dark:bg-[#2e2e2e] hover:bg-gray-50 dark:hover:bg-[#3a3a3a]"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Product
            </button>
            <button
              onClick={() => openAddKit()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition border border-gray-300 dark:border-[#3a3a3a] text-gray-700 dark:text-[#a0a0a0] bg-white dark:bg-[#2e2e2e] hover:bg-gray-50 dark:hover:bg-[#3a3a3a]"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Kit
            </button>
            <button
              onClick={openAddSupplier}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Supplier</span>
              <span className="sm:hidden">Supplier</span>
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
        {suppliers.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-[#2e2e2e] mb-4">
              <PackageIcon className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 dark:text-[#a0a0a0] font-medium">
              No suppliers yet
            </p>
            <p className="text-gray-400 dark:text-[#6b6b6b] text-sm mt-1">
              {canManage
                ? 'Click "+ Add Supplier" to get started.'
                : 'No suppliers have been added yet.'}
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSupplierDragEnd}>
          <SortableContext items={suppliers.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-8">
            {suppliers.map((supplier) => {
              const supplierProducts = productsBySupplier.get(supplier.id) ?? []
              const supplierKitGroups = kitGroupsBySupplier.get(supplier.id) ?? []
              const collapsed = collapsedSuppliers.has(supplier.id)

              // Split products into standalone vs. grouped.
              const standaloneProducts = supplierProducts
                .filter((p) => !p.kit_group_id)
                .sort((a, b) => {
                  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
                  return a.name.localeCompare(b.name)
                })
              const productsByGroup = new Map<string, InventoryProduct[]>()
              for (const p of supplierProducts) {
                if (!p.kit_group_id) continue
                const arr = productsByGroup.get(p.kit_group_id) ?? []
                arr.push(p)
                productsByGroup.set(p.kit_group_id, arr)
              }

              const hasAnyContent =
                standaloneProducts.length > 0 || supplierKitGroups.length > 0

              const supplierColors = getSupplierColors(supplier.color)

              // Build flat item ids for the inner DndContext on this supplier.
              const innerSortableIds: string[] = []
              for (const p of standaloneProducts) innerSortableIds.push(p.id)
              for (const g of supplierKitGroups) {
                innerSortableIds.push(`kg-${g.id}`)
                const gp = [...(productsByGroup.get(g.id) ?? [])].sort((a, b) =>
                  a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name)
                )
                for (const p of gp) innerSortableIds.push(p.id)
              }

              return (
                <SortableSupplierSection key={supplier.id} id={supplier.id} reorderMode={reorderMode}>
                  {/* Unified card: supplier header + product table */}
                  <div className={`bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#3a3a3a] rounded-xl overflow-hidden ${reorderMode ? 'sm:ml-5' : ''}`}>
                    {/* Supplier header — Option 4 style: accent bar + tinted background */}
                    <div
                      className="flex items-center gap-3"
                      style={{
                        borderLeft: `4px solid ${supplierColors.bar}`,
                        backgroundColor: supplierColors.tint,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSupplierCollapsed(supplier.id)}
                        className="p-1 ml-2 text-gray-400 hover:text-gray-600 dark:text-[#8a8a8a] dark:hover:text-white transition-colors flex-shrink-0"
                        aria-label={collapsed ? 'Expand supplier' : 'Collapse supplier'}
                      >
                        {collapsed ? (
                          <ChevronRightIcon className="w-4 h-4" />
                        ) : (
                          <ChevronDownIcon className="w-4 h-4" />
                        )}
                      </button>
                      <h2
                        className="text-[18px] font-medium uppercase tracking-wider text-gray-900 dark:text-[#f0f0f0] flex-1 truncate cursor-pointer py-3"
                        onClick={() => toggleSupplierCollapsed(supplier.id)}
                      >
                        {supplier.name}
                      </h2>
                      <span className="text-[11px] text-gray-500 dark:text-[#a0a0a0] bg-white/60 dark:bg-[#2e2e2e]/80 px-2.5 py-0.5 rounded-full font-medium">
                        {supplierProducts.length}{' '}
                        {supplierProducts.length === 1 ? 'product' : 'products'}
                      </span>
                      {canManage && (
                        <button
                          onClick={() => openEditSupplier(supplier)}
                          className="p-1.5 text-gray-400 hover:text-amber-500 dark:text-[#6b6b6b] dark:hover:text-amber-400 transition-colors"
                          title="Edit supplier"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteSupplierTarget(supplier)}
                          className="p-1.5 mr-2 text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 transition-colors"
                          title="Delete supplier"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {!collapsed && (
                      <div className="overflow-x-auto">
                        {/* Desktop/tablet table header */}
                        <div className="hidden sm:grid grid-cols-[1fr_100px_120px_120px_90px_120px_120px_60px] gap-2 px-4 py-2.5 bg-gray-50 dark:bg-[#2e2e2e] border-t border-b border-gray-200 dark:border-[#3a3a3a] text-[11px] font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide min-w-[900px]">
                          <div>Product Name</div>
                          <div className="text-right">Quantity</div>
                          <div className="text-center">Stock Check</div>
                          <div className="text-center">Stock Date</div>
                          <div className="text-right">Price</div>
                          <div className="text-center">Price Check</div>
                          <div className="text-center">Price Date</div>
                          <div className="text-right">Actions</div>
                        </div>

                        {!hasAnyContent ? (
                          <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-[#6b6b6b]">
                            No products or kit groups yet
                          </div>
                        ) : reorderMode ? (
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleItemDragEnd(supplier.id, e)}>
                          <SortableContext items={innerSortableIds} strategy={verticalListSortingStrategy}>
                          <div className="divide-y divide-gray-100 dark:divide-[#3a3a3a]">
                            {standaloneProducts.map((p) => (
                              <SortableItemRow key={p.id} id={p.id} reorderMode={reorderMode}>
                                {renderProductRow(p)}
                              </SortableItemRow>
                            ))}
                            {supplierKitGroups.flatMap((group) => {
                              const groupProducts = [
                                ...(productsByGroup.get(group.id) ?? []),
                              ].sort((a, b) => {
                                if (a.sort_order !== b.sort_order)
                                  return a.sort_order - b.sort_order
                                return a.name.localeCompare(b.name)
                              })
                              return [
                                <SortableItemRow key={`kg-${group.id}`} id={`kg-${group.id}`} reorderMode={reorderMode}>
                                  {renderKitGroupHeaderRow(group)}
                                </SortableItemRow>,
                                ...groupProducts.map((p) => (
                                  <SortableItemRow key={p.id} id={p.id} reorderMode={reorderMode}>
                                    {renderProductRow(p, true)}
                                  </SortableItemRow>
                                )),
                              ]
                            })}
                          </div>
                          </SortableContext>
                          </DndContext>
                        ) : (
                          <div className="divide-y divide-gray-100 dark:divide-[#3a3a3a]">
                            {standaloneProducts.map((p) => renderProductRow(p))}
                            {supplierKitGroups.flatMap((group) => {
                              const groupProducts = [
                                ...(productsByGroup.get(group.id) ?? []),
                              ].sort((a, b) => {
                                if (a.sort_order !== b.sort_order)
                                  return a.sort_order - b.sort_order
                                return a.name.localeCompare(b.name)
                              })
                              return [
                                renderKitGroupHeaderRow(group),
                                ...groupProducts.map((p) => renderProductRow(p, true)),
                              ]
                            })}
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                </SortableSupplierSection>
              )
            })}
          </div>
          </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Supplier modal */}
      {supplierModalOpen && (
        <SupplierModal
          supplier={editingSupplier}
          onClose={() => {
            setSupplierModalOpen(false)
            setEditingSupplier(null)
          }}
          onSave={saveSupplier}
        />
      )}

      {/* Settings modal */}
      {settingsModalOpen && (
        <InventorySettingsModal
          unitTypes={unitTypes}
          onClose={() => setSettingsModalOpen(false)}
          onUnitTypesChange={setUnitTypes}
        />
      )}

      {/* Product modal */}
      {productModalOpen && (
        <ProductModal
          product={editingProduct}
          supplierName={
            productModalSupplierId
              ? suppliers.find((s) => s.id === productModalSupplierId)?.name ?? ''
              : ''
          }
          suppliers={suppliers}
          kitGroups={productModalSupplierId ? (kitGroupsBySupplier.get(productModalSupplierId) ?? []) : []}
          kitGroupsBySupplier={kitGroupsBySupplier}
          unitTypes={unitTypes}
          initialSupplierId={productModalSupplierId}
          onClose={() => {
            setProductModalOpen(false)
            setEditingProduct(null)
            setProductModalSupplierId(null)
          }}
          onSave={saveProduct}
        />
      )}

      {/* Kit group EDIT modal (legacy KitGroupModal — only used for edits). */}
      {kitGroupModalOpen && kitGroupModalSupplierId && (
        <KitGroupModal
          kitGroup={editingKitGroup}
          supplierName={
            suppliers.find((s) => s.id === kitGroupModalSupplierId)?.name ?? ''
          }
          onClose={() => {
            setKitGroupModalOpen(false)
            setEditingKitGroup(null)
            setKitGroupModalSupplierId(null)
          }}
          onSave={saveKitGroup}
        />
      )}

      {/* Combined Add Kit modal — creates kit + sub-items in one step. */}
      {addKitModalOpen && (
        <AddKitModal
          supplierName={
            addKitSupplierId
              ? suppliers.find((s) => s.id === addKitSupplierId)?.name ?? ''
              : ''
          }
          suppliers={suppliers}
          unitTypes={unitTypes}
          initialSupplierId={addKitSupplierId}
          onClose={() => {
            setAddKitModalOpen(false)
            setAddKitSupplierId(null)
          }}
          onSave={saveNewKit}
        />
      )}

      {/* Delete supplier confirm */}
      {deleteSupplierTarget && (
        <ConfirmDialog
          title="Delete Supplier"
          message={`Delete "${deleteSupplierTarget.name}"? All products and kit groups under this supplier will also be deleted. This cannot be undone.`}
          confirmLabel="Delete Supplier"
          onConfirm={confirmDeleteSupplier}
          onCancel={() => setDeleteSupplierTarget(null)}
          loading={deleting}
        />
      )}

      {/* Delete product confirm */}
      {deleteProductTarget && (
        <ConfirmDialog
          title="Delete Product"
          message={`Delete "${deleteProductTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete Product"
          onConfirm={confirmDeleteProduct}
          onCancel={() => setDeleteProductTarget(null)}
          loading={deleting}
        />
      )}

      {/* Delete kit group confirm */}
      {deleteKitGroupTarget && (
        <ConfirmDialog
          title="Delete Kit Group"
          message={`Delete kit group "${deleteKitGroupTarget.name}"? Products in this group will be unlinked (not deleted) and shown as standalone products.`}
          confirmLabel="Delete Kit Group"
          onConfirm={confirmDeleteKitGroup}
          onCancel={() => setDeleteKitGroupTarget(null)}
          loading={deleting}
        />
      )}

      {/* Stock check request modal */}
      {stockCheckProduct && (
        <StockCheckRequestModal
          productName={stockCheckProduct.name}
          supplierName={
            suppliers.find((s) => s.id === stockCheckProduct.supplier_id)?.name ?? ''
          }
          profiles={profiles}
          onClose={() => setStockCheckProduct(null)}
          onSubmit={submitStockCheckRequest}
        />
      )}

      {/* Price check request modal */}
      {priceCheckProduct && (
        <PriceCheckRequestModal
          productName={priceCheckProduct.name}
          supplierName={
            suppliers.find((s) => s.id === priceCheckProduct.supplier_id)?.name ?? ''
          }
          profiles={profiles}
          onClose={() => setPriceCheckProduct(null)}
          onSubmit={submitPriceCheckRequest}
        />
      )}

      {/* Hidden date input used by the manual stock check date override. One
          input is reused across all product rows — openManualDatePicker
          re-targets it per product before opening the native picker. */}
      <input
        ref={manualDateInputRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleManualDateChange}
      />

      {/* Hidden date input for manual price check date override. */}
      <input
        ref={manualPriceDateInputRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleManualPriceDateChange}
      />
    </div>
  )
}
