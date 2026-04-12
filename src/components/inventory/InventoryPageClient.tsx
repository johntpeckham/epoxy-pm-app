'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SupplierModal from './SupplierModal'
import ProductModal, { type ProductFormData } from './ProductModal'
import KitGroupModal, { type KitGroupFormData } from './KitGroupModal'
import AddKitModal, { type AddKitFormData } from './AddKitModal'
import StockCheckRequestModal from './StockCheckRequestModal'
import type {
  InventoryKitGroup,
  InventoryProduct,
  InventoryUnit,
  MaterialSupplier,
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

interface Props {
  userRole: UserRole
  currentUserId: string
  initialSuppliers: MaterialSupplier[]
  initialProducts: InventoryProduct[]
  initialKitGroups: InventoryKitGroup[]
  profiles: InventoryProfileOption[]
  /** Keyed by task id — the pending stock check task → assignee info. */
  initialPendingStockChecks: Record<string, PendingStockCheckInfo>
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

/* ================================================================== */
/*  SUPPLIER COLOR MAP                                                 */
/* ================================================================== */

const SUPPLIER_COLOR_MAP: Record<string, { bar: string; tint: string }> = {
  amber:  { bar: '#92600a', tint: 'rgba(146, 96, 10, 0.1)' },
  blue:   { bar: '#2563a8', tint: 'rgba(37, 99, 168, 0.1)' },
  teal:   { bar: '#1d6b4f', tint: 'rgba(29, 107, 79, 0.1)' },
  purple: { bar: '#7c3aed', tint: 'rgba(124, 58, 237, 0.1)' },
  coral:  { bar: '#d85a30', tint: 'rgba(216, 90, 48, 0.1)' },
  pink:   { bar: '#d4537e', tint: 'rgba(212, 83, 126, 0.1)' },
  green:  { bar: '#4a9e22', tint: 'rgba(74, 158, 34, 0.1)' },
  red:    { bar: '#c53030', tint: 'rgba(197, 48, 48, 0.1)' },
  gray:   { bar: '#666666', tint: 'rgba(102, 102, 102, 0.1)' },
  navy:   { bar: '#2d3a8c', tint: 'rgba(45, 58, 140, 0.1)' },
  olive:  { bar: '#6b7c4a', tint: 'rgba(107, 124, 74, 0.1)' },
  cyan:   { bar: '#0891b2', tint: 'rgba(8, 145, 178, 0.1)' },
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

  const unitLabel = unit === 'parts' ? 'parts' : 'gal'

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
      <span className="text-sm text-gray-600 dark:text-[#a0a0a0]">
        {quantity} {unitLabel}
      </span>
    )
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          aria-label="Quantity"
          className="w-16 border border-amber-400 dark:border-amber-500 rounded px-1.5 py-0.5 text-sm text-right bg-white dark:bg-[#2e2e2e] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
        <span className="text-xs text-gray-500 dark:text-[#a0a0a0]">{unitLabel}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm transition-all cursor-text ${
        justSaved
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700'
          : 'text-gray-600 dark:text-[#a0a0a0] hover:bg-gray-100 dark:hover:bg-[#2e2e2e]'
      }`}
      style={
        justSaved
          ? undefined
          : {
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'transparent',
            }
      }
      onMouseEnter={(e) => {
        if (!justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.22)'
      }}
      onMouseLeave={(e) => {
        if (!justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
      }}
      onFocus={(e) => {
        if (!justSaved) e.currentTarget.style.borderColor = 'rgba(180, 83, 9, 0.5)'
      }}
      onBlur={(e) => {
        if (!justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
      }}
      title="Click to edit quantity"
    >
      <span>{quantity}</span>
      <span
        className={
          justSaved
            ? 'text-xs text-green-600 dark:text-green-400'
            : 'text-xs text-gray-500 dark:text-[#6b6b6b]'
        }
      >
        {unitLabel}
      </span>
      {justSaved && <CheckIcon className="w-3 h-3 text-green-600 dark:text-green-400" />}
    </button>
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
  profiles,
  initialPendingStockChecks,
}: Props) {
  const supabase = createClient()

  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>(initialSuppliers)
  const [products, setProducts] = useState<InventoryProduct[]>(initialProducts)
  const [kitGroups, setKitGroups] = useState<InventoryKitGroup[]>(initialKitGroups)

  // Pending stock check lookup keyed by task id. When a new request is made,
  // we insert the new task info here keyed by the newly created task id.
  const [pendingStockChecks, setPendingStockChecks] = useState<
    Record<string, PendingStockCheckInfo>
  >(initialPendingStockChecks)

  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set())

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

  // Hidden date input used to open a native date picker for manual override.
  // We reuse a single input and re-target it per product to avoid one input
  // per row.
  const manualDateInputRef = useRef<HTMLInputElement>(null)
  const [manualDateProductId, setManualDateProductId] = useState<string | null>(null)

  // Delete confirm state
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<MaterialSupplier | null>(null)
  const [deleteProductTarget, setDeleteProductTarget] = useState<InventoryProduct | null>(null)
  const [deleteKitGroupTarget, setDeleteKitGroupTarget] = useState<InventoryKitGroup | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canManage =
    userRole === 'admin' || userRole === 'office_manager' || userRole === 'salesman'
  const canDelete = userRole === 'admin' || userRole === 'office_manager'

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

  function openAddProduct(supplierId: string) {
    setEditingProduct(null)
    setProductModalSupplierId(supplierId)
    setProductModalOpen(true)
  }

  function openEditProduct(product: InventoryProduct) {
    setEditingProduct(product)
    setProductModalSupplierId(product.supplier_id)
    setProductModalOpen(true)
  }

  async function saveProduct(data: ProductFormData) {
    const trimmedName = data.name.trim()
    if (!trimmedName || !productModalSupplierId) return

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
          supplier_id: productModalSupplierId,
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

  function openAddKit(supplierId: string) {
    setAddKitSupplierId(supplierId)
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
    if (!addKitSupplierId) return
    const supplierId = addKitSupplierId

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

    return (
      <div
        key={product.id}
        className="sm:grid sm:grid-cols-[1fr_120px_160px_140px_80px] gap-3 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
      >
        {/* Product name + status dot. Grouped products get a subtle left
            indent so they visually read as sub-items of the kit group
            header above them, while keeping the grid columns aligned
            with every other row. */}
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
        {/* Quantity — click to edit inline without opening the modal. */}
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
            Stock check request:
          </span>
          {hasPending ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40"
              title={`Pending — assigned to ${pendingInfo?.assigneeName ?? 'Unknown'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Pending
              {pendingInfo?.assigneeName && (
                <span className="hidden md:inline text-amber-600 dark:text-amber-400 font-normal">
                  · {pendingInfo.assigneeName}
                </span>
              )}
            </span>
          ) : canManage ? (
            <button
              type="button"
              onClick={() => setStockCheckProduct(product)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40 transition-colors"
              title="Request a stock check"
            >
              <ClipboardListIcon className="w-3 h-3" />
              Request Check
            </button>
          ) : (
            <span className="text-gray-400 dark:text-[#6b6b6b]">—</span>
          )}
        </div>
        {/* Stock check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">
            Last checked:
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
        className="sm:grid sm:grid-cols-[1fr_120px_160px_140px_80px] gap-3 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
      >
        {/* Group name — styled identically to a product name cell, minus the
            stock-check status dot (which has no meaning at the group level). */}
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
          <span className="sm:hidden mr-1">Stock check request:</span>
          —
        </div>
        {/* Stock check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm text-gray-400 dark:text-[#6b6b6b] sm:text-center">
          <span className="sm:hidden mr-1">Last checked:</span>
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
          <button
            onClick={openAddSupplier}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition flex-shrink-0"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Supplier</span>
            <span className="sm:hidden">Supplier</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
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

              return (
                <section key={supplier.id}>
                  {/* Unified card: supplier header + product table */}
                  <div className="bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#3a3a3a] rounded-xl overflow-hidden">
                    {/* Supplier header — Option 4 style: accent bar + tinted background */}
                    <div
                      className="flex items-center gap-3"
                      style={{
                        borderLeft: `3px solid ${supplierColors.bar}`,
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
                      <>
                        {/* Desktop/tablet table header */}
                        <div className="hidden sm:grid grid-cols-[1fr_120px_160px_140px_80px] gap-3 px-4 py-2.5 bg-gray-50 dark:bg-[#2e2e2e] border-t border-b border-gray-200 dark:border-[#3a3a3a] text-[11px] font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide">
                          <div>Product Name</div>
                          <div className="text-right">Gallons / Parts</div>
                          <div className="text-center">Stock Check Request</div>
                          <div className="text-center">Stock Check Date</div>
                          <div className="text-right">Actions</div>
                        </div>

                        {!hasAnyContent ? (
                          <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-[#6b6b6b]">
                            No products or kit groups yet
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100 dark:divide-[#3a3a3a]">
                            {/* Standalone products first */}
                            {standaloneProducts.map((p) => renderProductRow(p))}

                            {/* Kit group header rows followed by their nested
                                products. flatMap keeps everything as direct
                                children of the divide-y container so dividers
                                render consistently between every row. */}
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

                        {canManage && (
                          <div className="border-t border-gray-100 dark:border-[#3a3a3a] px-4 py-2.5 bg-gray-50/50 dark:bg-[#2a2a2a] flex items-center gap-4 flex-wrap">
                            <button
                              onClick={() => openAddProduct(supplier.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                            >
                              <PlusIcon className="w-3.5 h-3.5" />
                              Add Single Product
                            </button>
                            <button
                              onClick={() => openAddKit(supplier.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                            >
                              <PlusIcon className="w-3.5 h-3.5" />
                              Add Kit
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
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

      {/* Product modal */}
      {productModalOpen && productModalSupplierId && (
        <ProductModal
          product={editingProduct}
          supplierName={
            suppliers.find((s) => s.id === productModalSupplierId)?.name ?? ''
          }
          kitGroups={kitGroupsBySupplier.get(productModalSupplierId) ?? []}
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
      {addKitModalOpen && addKitSupplierId && (
        <AddKitModal
          supplierName={
            suppliers.find((s) => s.id === addKitSupplierId)?.name ?? ''
          }
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
    </div>
  )
}
