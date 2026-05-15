'use client'

import { useMemo, useRef, useState } from 'react'
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
  FileTextIcon,
  GripVerticalIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import KebabMenu, { type KebabMenuItem } from '@/components/ui/KebabMenu'
import MasterSupplierModal from './MasterSupplierModal'
import MasterProductModal, { type MasterProductFormData } from './MasterProductModal'
import MasterKitGroupModal, { type MasterKitGroupFormData } from './MasterKitGroupModal'
import MasterAddKitModal, { type MasterAddKitFormData } from './MasterAddKitModal'
import MasterPriceCheckRequestModal from './MasterPriceCheckRequestModal'
import MasterSettingsModal from './MasterSettingsModal'
import DocumentUploadModal from './DocumentUploadModal'
import DocumentViewerModal, { type DocumentFileType } from './DocumentViewerModal'
import { usePermissions } from '@/lib/usePermissions'
import type {
  MasterKitGroup,
  MasterProduct,
  MasterProductDocument,
  MasterSupplier,
  UnitType,
  UserRole,
} from '@/types'

/* ================================================================== */
/*  UTILITY FUNCTIONS                                                  */
/* ================================================================== */

function formatCheckDate(value: string | null): string {
  if (!value) return 'Never'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type CheckLevel = 'pending' | 'never' | 'fresh' | 'stale' | 'overdue'

function getPriceCheckLevel(date: string | null, hasPending: boolean): CheckLevel {
  if (hasPending) return 'pending'
  if (!date) return 'never'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return 'never'
  const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays >= 60) return 'overdue'
  if (ageDays >= 30) return 'stale'
  return 'fresh'
}

function checkDateClass(level: CheckLevel): string {
  switch (level) {
    case 'overdue': return 'text-red-600 dark:text-red-400 font-medium'
    case 'stale': return 'text-amber-600 dark:text-amber-400 font-medium'
    case 'fresh': return 'text-green-600 dark:text-green-400'
    case 'pending': return 'text-amber-600 dark:text-amber-400'
    case 'never': default: return 'text-gray-400 dark:text-[#6b6b6b] italic'
  }
}

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

function toDateInputValue(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ================================================================== */
/*  INLINE PRICE EDITOR                                                */
/* ================================================================== */

interface InlinePriceEditorProps {
  price: number | null
  disabled: boolean
  onSave: (newPrice: number) => Promise<void>
}

function InlinePriceEditor({ price, disabled, onSave }: InlinePriceEditorProps) {
  const displayPrice = price ?? 0
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(displayPrice.toFixed(2))
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  // Keep value in sync when not editing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  if (!editing && value !== (price ?? 0).toFixed(2)) {
    setValue((price ?? 0).toFixed(2))
  }

  function startEdit() {
    if (disabled) return
    committedRef.current = false
    setValue(displayPrice.toFixed(2))
    setEditing(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
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
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
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
  const borderColor = justSaved ? undefined : isActive ? 'rgba(180, 83, 9, 0.5)' : 'rgba(255, 255, 255, 0.12)'

  return (
    <span className="inline-flex items-center">
      <span className={`text-xs mr-0.5 ${justSaved ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-[#6b6b6b]'}`}>$</span>
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
        style={justSaved ? undefined : { borderColor }}
        onMouseEnter={(e) => { if (!editing && !justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.22)' }}
        onMouseLeave={(e) => { if (!editing && !justSaved) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)' }}
        onFocus={(e) => { if (!justSaved) e.currentTarget.style.borderColor = 'rgba(180, 83, 9, 0.5)' }}
        title="Click to edit price"
      />
      {justSaved && <CheckIcon className="w-3 h-3 ml-0.5 text-green-600 dark:text-green-400" />}
    </span>
  )
}

/* ================================================================== */
/*  SORTABLE WRAPPERS                                                  */
/* ================================================================== */

function SortableSupplierSection({ id, reorderMode, children }: { id: string; reorderMode: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <section ref={setNodeRef} style={style} className={`relative ${isDragging ? 'z-50 opacity-80' : ''}`}>
      {reorderMode && (
        <div {...attributes} {...listeners} className="absolute -left-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white cursor-grab active:cursor-grabbing touch-none z-10 hidden sm:flex items-center" title="Drag to reorder supplier">
          <GripVerticalIcon className="w-4 h-4" />
        </div>
      )}
      {children}
    </section>
  )
}

function SortableItemRow({ id, reorderMode, children }: { id: string; reorderMode: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={`flex items-center ${isDragging ? 'z-50 relative opacity-80 bg-amber-50 dark:bg-amber-900/10' : ''}`}>
      {reorderMode && (
        <div {...attributes} {...listeners} className="flex-shrink-0 w-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:text-[#6b6b6b] dark:hover:text-white cursor-grab active:cursor-grabbing touch-none" title="Drag to reorder">
          <GripVerticalIcon className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export interface MaterialProfileOption {
  id: string
  display_name: string | null
}

export interface PendingPriceCheckInfo {
  taskId: string
  assigneeId: string | null
  assigneeName: string
}

interface Props {
  userRole: UserRole
  currentUserId: string
  initialSuppliers: MasterSupplier[]
  initialProducts: MasterProduct[]
  initialKitGroups: MasterKitGroup[]
  initialDocuments: MasterProductDocument[]
  initialUnitTypes: UnitType[]
  profiles: MaterialProfileOption[]
  initialPendingPriceChecks: Record<string, PendingPriceCheckInfo>
}

export default function MaterialManagementClient({
  userRole,
  currentUserId,
  initialSuppliers,
  initialProducts,
  initialKitGroups,
  initialDocuments,
  initialUnitTypes,
  profiles,
  initialPendingPriceChecks,
}: Props) {
  const supabase = createClient()
  const { canCreate, canEdit } = usePermissions()

  const [suppliers, setSuppliers] = useState<MasterSupplier[]>(initialSuppliers)
  const [products, setProducts] = useState<MasterProduct[]>(initialProducts)
  const [kitGroups, setKitGroups] = useState<MasterKitGroup[]>(initialKitGroups)
  const [documents, setDocuments] = useState<MasterProductDocument[]>(initialDocuments)
  const [unitTypes, setUnitTypes] = useState<UnitType[]>(initialUnitTypes)

  // Pending price check lookup
  const [pendingPriceChecks, setPendingPriceChecks] = useState<Record<string, PendingPriceCheckInfo>>(initialPendingPriceChecks)

  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set())
  const [reorderModeRaw, setReorderMode] = useState(false)
  const reorderMode = reorderModeRaw && canEdit('user_management')

  // Settings modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  // Supplier modal
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<MasterSupplier | null>(null)

  // Product modal
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<MasterProduct | null>(null)
  const [productModalSupplierId, setProductModalSupplierId] = useState<string | null>(null)

  // Kit group edit modal
  const [kitGroupModalOpen, setKitGroupModalOpen] = useState(false)
  const [editingKitGroup, setEditingKitGroup] = useState<MasterKitGroup | null>(null)
  const [kitGroupModalSupplierId, setKitGroupModalSupplierId] = useState<string | null>(null)

  // Add kit modal
  const [addKitModalOpen, setAddKitModalOpen] = useState(false)
  const [addKitSupplierId, setAddKitSupplierId] = useState<string | null>(null)

  // Price check request modal — products and kit groups share the modal
  // component but track separate target state so we know which entity to
  // update on submit.
  const [priceCheckProduct, setPriceCheckProduct] = useState<MasterProduct | null>(null)
  const [priceCheckKitGroup, setPriceCheckKitGroup] = useState<MasterKitGroup | null>(null)

  // Document upload modal
  const [docUploadProduct, setDocUploadProduct] = useState<MasterProduct | null>(null)
  const [docUploadInitialType, setDocUploadInitialType] = useState<'PDS' | 'SDS' | undefined>(undefined)

  // Document viewer modal — opens when the user clicks an attached PDS/SDS
  // indicator. We resolve the public URL up-front so the viewer doesn't need
  // a supabase client reference.
  const [viewingDoc, setViewingDoc] = useState<{
    fileUrl: string
    fileName: string
    fileType: DocumentFileType
  } | null>(null)

  function openDocUpload(product: MasterProduct, initialType?: 'PDS' | 'SDS') {
    setDocUploadProduct(product)
    setDocUploadInitialType(initialType)
  }

  function closeDocUpload() {
    setDocUploadProduct(null)
    setDocUploadInitialType(undefined)
  }

  // Manual price check date override
  const manualPriceDateInputRef = useRef<HTMLInputElement>(null)
  const [manualPriceDateProductId, setManualPriceDateProductId] = useState<string | null>(null)

  // Delete confirm state
  const [deleteSupplierTarget, setDeleteSupplierTarget] = useState<MasterSupplier | null>(null)
  const [deleteProductTarget, setDeleteProductTarget] = useState<MasterProduct | null>(null)
  const [deleteKitGroupTarget, setDeleteKitGroupTarget] = useState<MasterKitGroup | null>(null)
  // Doc delete supports both new column-based files on master_products and
  // legacy rows in master_product_documents. We keep references to both
  // sources so the confirm handler can clean up whatever exists.
  const [deleteDocTarget, setDeleteDocTarget] = useState<{
    productId: string
    productName: string
    type: 'PDS' | 'SDS'
    columnPath: string | null
    legacyDoc: MasterProductDocument | null
  } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // material_management maps: any create access lets you manage, edit lets
  // you delete, and reorder stays admin-only (via user_management proxy).
  const canManage = canCreate('material_management')
  const canDelete = canEdit('material_management')
  const canReorder = canEdit('user_management')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  // Group products by supplier id
  const productsBySupplier = useMemo(() => {
    const map = new Map<string, MasterProduct[]>()
    for (const p of products) {
      const arr = map.get(p.supplier_id) ?? []
      arr.push(p)
      map.set(p.supplier_id, arr)
    }
    return map
  }, [products])

  // Group kit groups by supplier id
  const kitGroupsBySupplier = useMemo(() => {
    const map = new Map<string, MasterKitGroup[]>()
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

  // Group documents by product id
  const documentsByProduct = useMemo(() => {
    const map = new Map<string, MasterProductDocument[]>()
    for (const d of documents) {
      const arr = map.get(d.product_id) ?? []
      arr.push(d)
      map.set(d.product_id, arr)
    }
    return map
  }, [documents])

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

  function openEditSupplier(supplier: MasterSupplier) {
    setEditingSupplier(supplier)
    setSupplierModalOpen(true)
  }

  async function saveSupplier(name: string, color: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (editingSupplier) {
      const previous = editingSupplier
      setSuppliers((prev) => prev.map((s) => (s.id === previous.id ? { ...s, name: trimmed, color } : s)))
      const { error } = await supabase.from('master_suppliers').update({ name: trimmed, color }).eq('id', previous.id)
      if (error) setSuppliers((prev) => prev.map((s) => (s.id === previous.id ? previous : s)))
    } else {
      const { data, error } = await supabase.from('master_suppliers').insert({ name: trimmed, color }).select().single()
      if (!error && data) setSuppliers((prev) => [...prev, data as MasterSupplier].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setSupplierModalOpen(false)
    setEditingSupplier(null)
  }

  async function confirmDeleteSupplier() {
    if (!deleteSupplierTarget) return
    const target = deleteSupplierTarget
    setDeleting(true)
    const { error } = await supabase.from('master_suppliers').delete().eq('id', target.id)
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

  function openEditProduct(product: MasterProduct) {
    setEditingProduct(product)
    setProductModalSupplierId(product.supplier_id)
    setProductModalOpen(true)
  }

  async function saveProduct(data: MasterProductFormData) {
    const trimmedName = data.name.trim()
    const supplierId = editingProduct ? productModalSupplierId ?? editingProduct.supplier_id : data.supplier_id ?? productModalSupplierId
    if (!trimmedName || !supplierId) return

    // Material Systems Wave 1: include the five default_* fields on every
    // master_products write. Null values are written explicitly so an edit
    // that clears the defaults persists the cleared state.
    const defaultsPayload = {
      default_quantity_mode: data.default_quantity_mode,
      default_coverage_amount: data.default_coverage_amount,
      default_coverage_basis: data.default_coverage_basis,
      default_fixed_quantity: data.default_fixed_quantity,
      default_unit: data.default_unit,
    }

    if (editingProduct) {
      const previous = editingProduct
      setProducts((prev) => prev.map((p) => p.id === previous.id ? { ...p, name: trimmedName, description: data.description, unit: data.unit, price: data.price, kit_group_id: data.kit_group_id, ...defaultsPayload } : p))
      const { error } = await supabase.from('master_products').update({ name: trimmedName, description: data.description, unit: data.unit, price: data.price, kit_group_id: data.kit_group_id, ...defaultsPayload }).eq('id', previous.id)
      if (error) {
        console.error('Failed to update master product', { code: error.code, message: error.message, hint: error.hint, details: error.details })
        setProducts((prev) => prev.map((p) => (p.id === previous.id ? previous : p)))
        throw new Error(error.message)
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('master_products')
        .insert({ supplier_id: supplierId, name: trimmedName, description: data.description, unit: data.unit, price: data.price, kit_group_id: data.kit_group_id, ...defaultsPayload })
        .select()
        .single()
      if (insertErr || !inserted) {
        console.error('Failed to insert master product', { code: insertErr?.code, message: insertErr?.message, hint: insertErr?.hint, details: insertErr?.details })
        throw new Error(insertErr?.message ?? 'Failed to create product.')
      }
      const insertedProduct = inserted as MasterProduct
      let pdsPath: string | null = null
      let sdsPath: string | null = null

      const uploadedPaths: string[] = []
      try {
        if (data.pdsFile) {
          pdsPath = await uploadMaterialFile(insertedProduct.id, 'PDS', data.pdsFile)
          uploadedPaths.push(pdsPath)
        }
        if (data.sdsFile) {
          sdsPath = await uploadMaterialFile(insertedProduct.id, 'SDS', data.sdsFile)
          uploadedPaths.push(sdsPath)
        }

        if (pdsPath || sdsPath) {
          const updatePayload: { pds_file_path?: string; sds_file_path?: string } = {}
          if (pdsPath) updatePayload.pds_file_path = pdsPath
          if (sdsPath) updatePayload.sds_file_path = sdsPath
          const { error: updErr } = await supabase
            .from('master_products')
            .update(updatePayload)
            .eq('id', insertedProduct.id)
          if (updErr) {
            console.error('Failed to attach file paths to master product', { code: updErr.code, message: updErr.message, hint: updErr.hint, details: updErr.details })
            throw new Error(updErr.message)
          }
        }

        setProducts((prev) => [
          ...prev,
          { ...insertedProduct, pds_file_path: pdsPath, sds_file_path: sdsPath },
        ])
      } catch (err) {
        // Roll back: delete uploaded files (best-effort) + delete the inserted product row.
        if (uploadedPaths.length > 0) {
          const { error: rmErr } = await supabase.storage.from('material-documents').remove(uploadedPaths)
          if (rmErr) console.error('Rollback: failed to remove uploaded files', { code: rmErr.name, message: rmErr.message })
        }
        const { error: delErr } = await supabase.from('master_products').delete().eq('id', insertedProduct.id)
        if (delErr) console.error('Rollback: failed to delete inserted product', { code: delErr.code, message: delErr.message, hint: delErr.hint, details: delErr.details })
        throw err
      }
    }
    setProductModalOpen(false)
    setEditingProduct(null)
    setProductModalSupplierId(null)
  }

  async function uploadMaterialFile(productId: string, documentType: 'PDS' | 'SDS', file: File): Promise<string> {
    const fileExt = file.name.split('.').pop() ?? 'pdf'
    const storagePath = `${productId}/${documentType.toLowerCase()}-${Date.now()}.${fileExt}`
    const { error: upErr } = await supabase.storage.from('material-documents').upload(storagePath, file)
    if (upErr) {
      console.error(`Failed to upload ${documentType} file`, { code: upErr.name, message: upErr.message })
      throw new Error(upErr.message)
    }
    return storagePath
  }

  async function confirmDeleteProduct() {
    if (!deleteProductTarget) return
    const target = deleteProductTarget
    setDeleting(true)
    const { error } = await supabase.from('master_products').delete().eq('id', target.id)
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== target.id))
      setDocuments((prev) => prev.filter((d) => d.product_id !== target.id))
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

  function openEditKitGroup(kitGroup: MasterKitGroup) {
    setEditingKitGroup(kitGroup)
    setKitGroupModalSupplierId(kitGroup.supplier_id)
    setKitGroupModalOpen(true)
  }

  async function saveNewKit(data: MasterAddKitFormData) {
    const supplierId = data.supplier_id ?? addKitSupplierId
    if (!supplierId) return

    // Material Systems Wave 1: include the kit's optional default_* fields
    // on insert. Null values are written explicitly so an unset default
    // persists as NULL rather than relying on column defaults.
    const { data: insertedKit, error: kitErr } = await supabase.from('master_kit_groups').insert({
      supplier_id: supplierId,
      name: data.name,
      default_quantity_mode: data.default_quantity_mode,
      default_coverage_amount: data.default_coverage_amount,
      default_coverage_basis: data.default_coverage_basis,
      default_fixed_quantity: data.default_fixed_quantity,
      default_unit: data.default_unit,
    }).select().single()
    if (kitErr || !insertedKit) {
      console.error('Failed to insert kit group', { code: kitErr?.code, message: kitErr?.message, hint: kitErr?.hint, details: kitErr?.details })
      throw new Error(kitErr?.message ?? 'Failed to create kit.')
    }
    const kit = insertedKit as MasterKitGroup

    const insertedProductIds: string[] = []
    const uploadedPaths: string[] = []
    const finalProducts: MasterProduct[] = []

    try {
      // Insert + upload one product at a time so PDS/SDS files always pair
      // unambiguously with the inserted row — batch insert order isn't a
      // strict guarantee from PostgREST.
      for (const formItem of data.products) {
        const { data: insertedRaw, error: prodErr } = await supabase
          .from('master_products')
          .insert({ supplier_id: supplierId, kit_group_id: kit.id, name: formItem.name, description: formItem.description, unit: formItem.unit })
          .select()
          .single()
        if (prodErr || !insertedRaw) {
          console.error('Failed to insert kit product', { code: prodErr?.code, message: prodErr?.message, hint: prodErr?.hint, details: prodErr?.details })
          throw new Error(prodErr?.message ?? 'Failed to create kit product.')
        }
        const inserted = insertedRaw as MasterProduct
        insertedProductIds.push(inserted.id)

        let pdsPath: string | null = null
        let sdsPath: string | null = null
        if (formItem.pdsFile) {
          pdsPath = await uploadMaterialFile(inserted.id, 'PDS', formItem.pdsFile)
          uploadedPaths.push(pdsPath)
        }
        if (formItem.sdsFile) {
          sdsPath = await uploadMaterialFile(inserted.id, 'SDS', formItem.sdsFile)
          uploadedPaths.push(sdsPath)
        }
        if (pdsPath || sdsPath) {
          const updatePayload: { pds_file_path?: string; sds_file_path?: string } = {}
          if (pdsPath) updatePayload.pds_file_path = pdsPath
          if (sdsPath) updatePayload.sds_file_path = sdsPath
          const { error: updErr } = await supabase
            .from('master_products')
            .update(updatePayload)
            .eq('id', inserted.id)
          if (updErr) {
            console.error('Failed to attach file paths to kit product', { code: updErr.code, message: updErr.message, hint: updErr.hint, details: updErr.details })
            throw new Error(updErr.message)
          }
        }
        finalProducts.push({ ...inserted, pds_file_path: pdsPath, sds_file_path: sdsPath })
      }

      setProducts((prev) => [...prev, ...finalProducts])
      setKitGroups((prev) => [...prev, kit])
      setAddKitModalOpen(false)
      setAddKitSupplierId(null)
    } catch (err) {
      // Roll back EVERYTHING inserted/uploaded so far: files first, then product rows, then kit row.
      if (uploadedPaths.length > 0) {
        const { error: rmErr } = await supabase.storage.from('material-documents').remove(uploadedPaths)
        if (rmErr) console.error('Rollback: failed to remove uploaded kit files', { code: rmErr.name, message: rmErr.message })
      }
      if (insertedProductIds.length > 0) {
        const { error: delProdErr } = await supabase.from('master_products').delete().in('id', insertedProductIds)
        if (delProdErr) console.error('Rollback: failed to delete inserted kit products', { code: delProdErr.code, message: delProdErr.message, hint: delProdErr.hint, details: delProdErr.details })
      }
      const { error: delKitErr } = await supabase.from('master_kit_groups').delete().eq('id', kit.id)
      if (delKitErr) console.error('Rollback: failed to delete inserted kit', { code: delKitErr.code, message: delKitErr.message, hint: delKitErr.hint, details: delKitErr.details })
      throw err
    }
  }

  async function saveKitGroup(data: MasterKitGroupFormData) {
    if (!kitGroupModalSupplierId) return
    if (editingKitGroup) {
      const previous = editingKitGroup
      setKitGroups((prev) => prev.map((g) => g.id === previous.id ? { ...g, name: data.name } : g))
      const { error } = await supabase.from('master_kit_groups').update({ name: data.name }).eq('id', previous.id)
      if (error) setKitGroups((prev) => prev.map((g) => (g.id === previous.id ? previous : g)))
    } else {
      const { data: inserted, error } = await supabase.from('master_kit_groups').insert({ supplier_id: kitGroupModalSupplierId, name: data.name }).select().single()
      if (!error && inserted) setKitGroups((prev) => [...prev, inserted as MasterKitGroup])
    }
    setKitGroupModalOpen(false)
    setEditingKitGroup(null)
    setKitGroupModalSupplierId(null)
  }

  async function confirmDeleteKitGroup() {
    if (!deleteKitGroupTarget) return
    const target = deleteKitGroupTarget
    setDeleting(true)
    const { error } = await supabase.from('master_kit_groups').delete().eq('id', target.id)
    if (!error) {
      setKitGroups((prev) => prev.filter((g) => g.id !== target.id))
      setProducts((prev) => prev.map((p) => p.kit_group_id === target.id ? { ...p, kit_group_id: null } : p))
    }
    setDeleting(false)
    setDeleteKitGroupTarget(null)
  }

  /* ================================================================ */
  /*  INLINE PRICE SAVE                                                */
  /* ================================================================ */

  async function saveProductPrice(productId: string, newPrice: number) {
    const previous = products.find((p) => p.id === productId)
    if (!previous) return
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, price: newPrice } : p)))
    const { error } = await supabase.from('master_products').update({ price: newPrice }).eq('id', productId)
    if (error) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? previous : p)))
      throw error
    }
  }

  async function saveKitGroupPrice(kitGroupId: string, newPrice: number) {
    const previous = kitGroups.find((g) => g.id === kitGroupId)
    if (!previous) return
    setKitGroups((prev) => prev.map((g) => (g.id === kitGroupId ? { ...g, price: newPrice } : g)))
    const { error } = await supabase.from('master_kit_groups').update({ price: newPrice }).eq('id', kitGroupId)
    if (error) {
      setKitGroups((prev) => prev.map((g) => (g.id === kitGroupId ? previous : g)))
      throw error
    }
  }

  /* ================================================================ */
  /*  PRICE CHECK REQUEST                                              */
  /* ================================================================ */

  // Generic Price Check submit. Creates an office_tasks row, links it back
  // to the target row via the entity's price_check_task_id column, and
  // updates the pending-check map. Used for both products and kit groups.
  async function submitPriceCheckCore(
    entity: { kind: 'product' | 'kit'; id: string; name: string; supplierId: string },
    assignedToId: string,
  ): Promise<void> {
    const supplier = suppliers.find((s) => s.id === entity.supplierId)
    const supplierName = supplier?.name ?? ''
    const entityLabel = entity.kind === 'kit' ? 'kit' : 'product'
    const title = supplierName ? `Price Check: ${entity.name} (${supplierName})` : `Price Check: ${entity.name}`

    const { data: inserted, error: taskErr } = await supabase.from('office_tasks').insert({
      title,
      description: `Price check request for ${entity.name}. Please verify the current price with the supplier and mark this task complete — the Price Check Date on the ${entityLabel} will update automatically.`,
      assigned_to: assignedToId,
      priority: 'Normal',
      created_by: currentUserId,
    }).select('id').single()
    if (taskErr || !inserted) {
      console.error('Failed to create price check task', { code: taskErr?.code, message: taskErr?.message, hint: taskErr?.hint, details: taskErr?.details })
      throw new Error(taskErr?.message ?? 'Failed to create price check task.')
    }
    const newTaskId = (inserted as { id: string }).id

    const table = entity.kind === 'kit' ? 'master_kit_groups' : 'master_products'
    const { error: linkErr } = await supabase.from(table).update({ price_check_task_id: newTaskId }).eq('id', entity.id)
    if (linkErr) {
      console.error(`Failed to link price-check task to ${table}`, { code: linkErr.code, message: linkErr.message, hint: linkErr.hint, details: linkErr.details })
      const { error: cleanupErr } = await supabase.from('office_tasks').delete().eq('id', newTaskId)
      if (cleanupErr) console.error('Rollback: failed to delete price-check task', { code: cleanupErr.code, message: cleanupErr.message, hint: cleanupErr.hint, details: cleanupErr.details })
      throw new Error(linkErr.message)
    }

    if (entity.kind === 'kit') {
      setKitGroups((prev) => prev.map((g) => g.id === entity.id ? { ...g, price_check_task_id: newTaskId } : g))
    } else {
      setProducts((prev) => prev.map((p) => p.id === entity.id ? { ...p, price_check_task_id: newTaskId } : p))
    }
    const assignee = profiles.find((p) => p.id === assignedToId)
    setPendingPriceChecks((prev) => ({ ...prev, [newTaskId]: { taskId: newTaskId, assigneeId: assignedToId, assigneeName: assignee?.display_name ?? 'Unknown' } }))
  }

  async function submitPriceCheckRequest(assignedToId: string) {
    if (!priceCheckProduct) return
    const product = priceCheckProduct
    await submitPriceCheckCore({ kind: 'product', id: product.id, name: product.name, supplierId: product.supplier_id }, assignedToId)
    setPriceCheckProduct(null)
  }

  async function submitKitPriceCheckRequest(assignedToId: string) {
    if (!priceCheckKitGroup) return
    const kit = priceCheckKitGroup
    await submitPriceCheckCore({ kind: 'kit', id: kit.id, name: kit.name, supplierId: kit.supplier_id }, assignedToId)
    setPriceCheckKitGroup(null)
  }

  /* ================================================================ */
  /*  MANUAL PRICE CHECK DATE OVERRIDE                                 */
  /* ================================================================ */

  function openManualPriceDatePicker(product: MasterProduct) {
    if (!canManage) return
    setManualPriceDateProductId(product.id)
    requestAnimationFrame(() => {
      const input = manualPriceDateInputRef.current
      if (!input) return
      input.value = toDateInputValue(product.price_check_date)
      if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
        ;(input as HTMLInputElement & { showPicker: () => void }).showPicker()
      } else { input.focus(); input.click() }
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
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, price_check_date: isoDate } : p)))
    const { error } = await supabase.from('master_products').update({ price_check_date: isoDate }).eq('id', productId)
    if (error) {
      console.error('Failed to update master_products price_check_date', { code: error.code, message: error.message, hint: error.hint, details: error.details })
      setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, price_check_date: previous.price_check_date } : p))
    }
  }

  // Manual price check date override for kit groups — mirrors the product
  // flow using the same shared hidden <input type="date">.
  const [manualPriceDateKitGroupId, setManualPriceDateKitGroupId] = useState<string | null>(null)
  const kitManualPriceDateInputRef = useRef<HTMLInputElement>(null)

  function openKitManualPriceDatePicker(group: MasterKitGroup) {
    if (!canManage) return
    setManualPriceDateKitGroupId(group.id)
    requestAnimationFrame(() => {
      const input = kitManualPriceDateInputRef.current
      if (!input) return
      input.value = toDateInputValue(group.price_check_date)
      if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
        ;(input as HTMLInputElement & { showPicker: () => void }).showPicker()
      } else { input.focus(); input.click() }
    })
  }

  async function handleKitManualPriceDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const groupId = manualPriceDateKitGroupId
    const newValue = e.target.value
    setManualPriceDateKitGroupId(null)
    if (!groupId || !newValue) return
    const previous = kitGroups.find((g) => g.id === groupId)
    if (!previous) return
    const isoDate = new Date(`${newValue}T12:00:00`).toISOString()
    setKitGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, price_check_date: isoDate } : g)))
    const { error } = await supabase.from('master_kit_groups').update({ price_check_date: isoDate }).eq('id', groupId)
    if (error) {
      console.error('Failed to update master_kit_groups price_check_date', { code: error.code, message: error.message, hint: error.hint, details: error.details })
      setKitGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, price_check_date: previous.price_check_date } : g))
    }
  }

  /* ================================================================ */
  /*  DOCUMENT UPLOAD / DELETE                                         */
  /* ================================================================ */

  async function handleDocumentUpload(documentType: 'PDS' | 'SDS', file: File) {
    if (!docUploadProduct) return
    const product = docUploadProduct
    const fileExt = file.name.split('.').pop() ?? 'pdf'
    const storagePath = `${product.id}/${documentType.toLowerCase()}-${Date.now()}.${fileExt}`

    const { error: uploadErr } = await supabase.storage.from('material-documents').upload(storagePath, file)
    if (uploadErr) throw uploadErr

    const fileUrl = supabase.storage.from('material-documents').getPublicUrl(storagePath).data.publicUrl

    const { data: docRow, error: insertErr } = await supabase.from('master_product_documents').insert({
      product_id: product.id,
      document_type: documentType,
      file_name: file.name,
      file_url: fileUrl,
    }).select().single()
    if (insertErr) throw insertErr
    if (docRow) setDocuments((prev) => [...prev, docRow as MasterProductDocument])
    closeDocUpload()
  }

  // Resolve which storage path + source backs an attached doc indicator.
  // Prefers the new pds_file_path / sds_file_path columns on master_products
  // (set by Phase 2a's create modals) and falls back to the legacy
  // master_product_documents row source. Returns null if neither exists.
  function getAttachedDoc(product: MasterProduct, type: 'PDS' | 'SDS'): {
    columnPath: string | null
    legacyDoc: MasterProductDocument | null
  } | null {
    const columnPath = type === 'PDS' ? product.pds_file_path : product.sds_file_path
    const docs = documentsByProduct.get(product.id) ?? []
    const legacy = docs.find((d) => d.document_type === type) ?? null
    if (!columnPath && !legacy) return null
    return { columnPath: columnPath ?? null, legacyDoc: legacy }
  }

  // Derive a viewer file type from a path/filename's extension.
  function fileTypeFromPath(pathOrName: string): DocumentFileType {
    const ext = pathOrName.toLowerCase().split('.').pop() ?? ''
    if (ext === 'pdf') return 'pdf'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
    if (['doc', 'docx'].includes(ext)) return 'word'
    return 'unknown'
  }

  // Open an attached PDS/SDS in the in-app viewer modal. Resolves the
  // public URL from either the new column path or the legacy doc row's
  // stored file_url, then hands off to <DocumentViewerModal>. The
  // material-documents bucket is public so getPublicUrl is sufficient.
  function openAttachedDoc(product: MasterProduct, type: 'PDS' | 'SDS') {
    const resolved = getAttachedDoc(product, type)
    if (!resolved) return

    let url: string | null = null
    let displayName: string | null = null
    let typeSourcePath: string | null = null

    if (resolved.columnPath) {
      const { data } = supabase.storage.from('material-documents').getPublicUrl(resolved.columnPath)
      url = data?.publicUrl ?? null
      typeSourcePath = resolved.columnPath
      // The column-based upload path doesn't preserve the original filename,
      // so synthesize a friendly label that includes product + type + ext.
      const ext = resolved.columnPath.split('.').pop() ?? ''
      displayName = ext ? `${product.name} — ${type}.${ext}` : `${product.name} — ${type}`
    } else if (resolved.legacyDoc) {
      url = resolved.legacyDoc.file_url
      displayName = resolved.legacyDoc.file_name
      typeSourcePath = resolved.legacyDoc.file_name
    }

    if (!url || !displayName || !typeSourcePath) {
      console.error('Could not resolve public URL for attached doc', { productId: product.id, type })
      return
    }
    setViewingDoc({ fileUrl: url, fileName: displayName, fileType: fileTypeFromPath(typeSourcePath) })
  }

  // Best-effort download: same pattern used elsewhere in the app. The
  // Supabase storage URL is cross-origin, so the browser may treat the
  // download attribute as a hint only — that's acceptable here.
  function downloadViewingDoc() {
    if (!viewingDoc) return
    try {
      const a = document.createElement('a')
      a.href = viewingDoc.fileUrl
      a.download = viewingDoc.fileName
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      console.error('Failed to trigger download', { message: err instanceof Error ? err.message : String(err) })
    }
  }

  function startDeleteDoc(product: MasterProduct, type: 'PDS' | 'SDS') {
    const resolved = getAttachedDoc(product, type)
    if (!resolved) return
    setDeleteDocTarget({
      productId: product.id,
      productName: product.name,
      type,
      columnPath: resolved.columnPath,
      legacyDoc: resolved.legacyDoc,
    })
  }

  async function confirmDeleteDocument() {
    if (!deleteDocTarget) return
    const target = deleteDocTarget
    setDeleting(true)

    const pathsToRemove: string[] = []
    if (target.columnPath) pathsToRemove.push(target.columnPath)
    if (target.legacyDoc) {
      const urlParts = target.legacyDoc.file_url.split('/material-documents/')
      const legacyStoragePath = urlParts.length > 1 ? urlParts[urlParts.length - 1] : null
      if (legacyStoragePath) pathsToRemove.push(legacyStoragePath)
    }

    if (pathsToRemove.length > 0) {
      const { error: rmErr } = await supabase.storage.from('material-documents').remove(pathsToRemove)
      if (rmErr) console.error('Failed to remove storage object(s) for doc delete', { code: rmErr.name, message: rmErr.message })
    }

    let columnCleared = !target.columnPath
    let legacyDeleted = !target.legacyDoc

    if (target.columnPath) {
      const column = target.type === 'PDS' ? 'pds_file_path' : 'sds_file_path'
      const { error: updErr } = await supabase
        .from('master_products')
        .update({ [column]: null })
        .eq('id', target.productId)
      if (updErr) {
        console.error('Failed to clear file_path column on master_products', { code: updErr.code, message: updErr.message, hint: updErr.hint, details: updErr.details })
      } else {
        columnCleared = true
        setProducts((prev) => prev.map((p) => p.id === target.productId ? { ...p, [column]: null } : p))
      }
    }

    if (target.legacyDoc) {
      const { error: delErr } = await supabase.from('master_product_documents').delete().eq('id', target.legacyDoc.id)
      if (delErr) {
        console.error('Failed to delete legacy master_product_documents row', { code: delErr.code, message: delErr.message, hint: delErr.hint, details: delErr.details })
      } else {
        legacyDeleted = true
        setDocuments((prev) => prev.filter((d) => d.id !== target.legacyDoc!.id))
      }
    }

    setDeleting(false)
    // Only clear the target if all branches succeeded; otherwise leave the
    // dialog visible so the user can see something went wrong.
    if (columnCleared && legacyDeleted) setDeleteDocTarget(null)
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
      await supabase.from('master_suppliers').update({ sort_order: s.sort_order }).eq('id', s.id)
    }
  }

  async function handleItemDragEnd(supplierId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const supplierProducts = productsBySupplier.get(supplierId) ?? []
    const supplierKitGroups = kitGroupsBySupplier.get(supplierId) ?? []
    const standalone = supplierProducts.filter((p) => !p.kit_group_id).sort((a, b) => a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name))
    const productsByGroup = new Map<string, MasterProduct[]>()
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
      const gp = [...(productsByGroup.get(g.id) ?? [])].sort((a, b) => a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name))
      for (const p of gp) flatItems.push({ type: 'product', id: p.id })
    }

    const activeKey = active.id as string
    const overKey = over.id as string
    const oldIdx = flatItems.findIndex((item) => item.type === 'kitgroup' ? `kg-${item.id}` === activeKey : item.id === activeKey)
    const newIdx = flatItems.findIndex((item) => item.type === 'kitgroup' ? `kg-${item.id}` === overKey : item.id === overKey)
    if (oldIdx < 0 || newIdx < 0) return

    const reordered = [...flatItems]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)

    let productOrder = 1
    let kitGroupOrder = 1
    const productUpdates: { id: string; sort_order: number }[] = []
    const kitGroupUpdates: { id: string; sort_order: number }[] = []
    for (const item of reordered) {
      if (item.type === 'product') productUpdates.push({ id: item.id, sort_order: productOrder++ })
      else kitGroupUpdates.push({ id: item.id, sort_order: kitGroupOrder++ })
    }

    setProducts((prev) => {
      const updates = new Map(productUpdates.map((u) => [u.id, u.sort_order]))
      return prev.map((p) => (updates.has(p.id) ? { ...p, sort_order: updates.get(p.id)! } : p))
    })
    setKitGroups((prev) => {
      const updates = new Map(kitGroupUpdates.map((u) => [u.id, u.sort_order]))
      return prev.map((g) => (updates.has(g.id) ? { ...g, sort_order: updates.get(g.id)! } : g))
    })

    for (const u of productUpdates) await supabase.from('master_products').update({ sort_order: u.sort_order }).eq('id', u.id)
    for (const u of kitGroupUpdates) await supabase.from('master_kit_groups').update({ sort_order: u.sort_order }).eq('id', u.id)
  }

  /* ================================================================ */
  /*  RENDER HELPERS                                                   */
  /* ================================================================ */

  function renderProductRow(product: MasterProduct, nested = false) {
    const pricePendingInfo = product.price_check_task_id ? pendingPriceChecks[product.price_check_task_id] : undefined
    const hasPricePending = !!product.price_check_task_id
    const priceLevel = getPriceCheckLevel(product.price_check_date, hasPricePending)
    const priceDateText = formatCheckDate(product.price_check_date)
    const priceDateClass = checkDateClass(priceLevel)

    const productDocs = documentsByProduct.get(product.id) ?? []
    const hasPds = !!product.pds_file_path || productDocs.some((d) => d.document_type === 'PDS')
    const hasSds = !!product.sds_file_path || productDocs.some((d) => d.document_type === 'SDS')

    return (
      <div key={product.id} className="sm:grid sm:grid-cols-[1fr_90px_120px_120px_100px_60px] gap-2 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors min-w-[700px]">
        {/* Product name */}
        <div className={`flex items-center gap-2 min-w-0 ${nested ? 'pl-5 sm:pl-6' : ''}`}>
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</span>
        </div>
        {/* Price */}
        <div className="mt-1 sm:mt-0 text-sm text-gray-600 dark:text-[#a0a0a0] sm:text-right">
          <span className="sm:hidden text-xs text-gray-400 dark:text-[#6b6b6b] mr-1">Price:</span>
          <InlinePriceEditor price={product.price} disabled={!canManage} onSave={(p) => saveProductPrice(product.id, p)} />
        </div>
        {/* Price check request */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">Price check:</span>
          {hasPricePending ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40" title={`Pending — assigned to ${pricePendingInfo?.assigneeName ?? 'Unknown'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Pending
              {pricePendingInfo?.assigneeName && <span className="hidden lg:inline text-amber-600 dark:text-amber-400 font-normal">· {pricePendingInfo.assigneeName}</span>}
            </span>
          ) : canManage ? (
            <button type="button" onClick={() => setPriceCheckProduct(product)} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40 transition-colors" title="Request a price check">
              Price Check
            </button>
          ) : (
            <span className="text-gray-400 dark:text-[#6b6b6b]">—</span>
          )}
        </div>
        {/* Price check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">Price date:</span>
          {canManage ? (
            <button type="button" onClick={() => openManualPriceDatePicker(product)} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors ${priceDateClass}`} title="Click to set the price check date manually">
              <CalendarIcon className="w-3 h-3 opacity-60" />
              {priceDateText}
            </button>
          ) : (
            <span className={priceDateClass}>{priceDateText}</span>
          )}
        </div>
        {/* PDS / SDS */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">Docs:</span>
          <div className="inline-flex items-center gap-1">
            {(['PDS', 'SDS'] as const).map((type) => {
              const attached = type === 'PDS' ? hasPds : hasSds
              const longName = type === 'PDS' ? 'Product Data Sheet' : 'Safety Data Sheet'
              const baseCls = 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors'
              const attachedCls = 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              const dimCls = 'bg-gray-50 dark:bg-[#2a2a2a] text-gray-400 dark:text-[#6b6b6b] border-gray-200 dark:border-[#3a3a3a] hover:bg-gray-100 dark:hover:bg-[#3a3a3a]'

              if (attached) {
                // View on click; show a hover-X for users who can delete.
                return (
                  <span key={type} className="group relative inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => openAttachedDoc(product, type)}
                      className={`${baseCls} ${attachedCls}`}
                      title={`View ${longName}`}
                    >
                      <FileTextIcon className="w-2.5 h-2.5" />
                      {type}
                      <CheckIcon className="w-2.5 h-2.5" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); startDeleteDoc(product, type) }}
                        className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded-full bg-white dark:bg-[#242424] text-gray-400 hover:text-red-500 dark:text-[#6b6b6b] dark:hover:text-red-400 border border-gray-200 dark:border-[#3a3a3a] shadow-sm transition-opacity"
                        title={`Delete ${type}`}
                        aria-label={`Delete ${type}`}
                      >
                        <XIcon className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </span>
                )
              }

              // Unattached — clickable to upload for users who can manage,
              // otherwise a static dimmed badge.
              if (canManage) {
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => openDocUpload(product, type)}
                    className={`${baseCls} ${dimCls}`}
                    title={`Upload ${longName}`}
                  >
                    <FileTextIcon className="w-2.5 h-2.5" />
                    {type}
                  </button>
                )
              }
              return (
                <span
                  key={type}
                  className={`${baseCls} ${dimCls}`}
                  title={`No ${type} attached`}
                >
                  <FileTextIcon className="w-2.5 h-2.5" />
                  {type}
                </span>
              )
            })}
          </div>
        </div>
        {/* Actions */}
        <div className="mt-2 sm:mt-0 flex sm:justify-end items-center gap-1">
          {(() => {
            const items: KebabMenuItem[] = []
            if (canManage) {
              items.push({
                label: 'Edit',
                icon: <PencilIcon size={13} />,
                onSelect: () => openEditProduct(product),
              })
            }
            if (canDelete) {
              items.push({
                label: 'Delete',
                icon: <Trash2Icon size={13} />,
                destructive: true,
                onSelect: () => setDeleteProductTarget(product),
              })
            }
            if (items.length === 0) return null
            return <KebabMenu variant="light" title="Product actions" items={items} />
          })()}
        </div>
      </div>
    )
  }

  function renderKitGroupHeaderRow(group: MasterKitGroup) {
    const pricePendingInfo = group.price_check_task_id ? pendingPriceChecks[group.price_check_task_id] : undefined
    const hasPricePending = !!group.price_check_task_id
    const priceLevel = getPriceCheckLevel(group.price_check_date, hasPricePending)
    const priceDateText = formatCheckDate(group.price_check_date)
    const priceDateClass = checkDateClass(priceLevel)

    return (
      <div key={`kit-group-${group.id}`} className="sm:grid sm:grid-cols-[1fr_90px_120px_120px_100px_60px] gap-2 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors min-w-[700px]">
        {/* Group name + muted "Kit Price" label pinned to the right edge of
            the name column so it sits just before the Price column. */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{group.name}</span>
          <span className="hidden sm:inline text-xs text-gray-400 dark:text-[#6b6b6b] flex-shrink-0">
            Kit Price
          </span>
        </div>
        {/* Kit Price */}
        <div className="mt-1 sm:mt-0 text-sm text-gray-600 dark:text-[#a0a0a0] sm:text-right">
          <span className="sm:hidden text-xs text-gray-400 dark:text-[#6b6b6b] mr-1">Price:</span>
          <InlinePriceEditor price={group.price} disabled={!canManage} onSave={(p) => saveKitGroupPrice(group.id, p)} />
        </div>
        {/* Price check request */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">Price check:</span>
          {hasPricePending ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40" title={`Pending — assigned to ${pricePendingInfo?.assigneeName ?? 'Unknown'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Pending
              {pricePendingInfo?.assigneeName && <span className="hidden lg:inline text-amber-600 dark:text-amber-400 font-normal">· {pricePendingInfo.assigneeName}</span>}
            </span>
          ) : canManage ? (
            <button type="button" onClick={() => setPriceCheckKitGroup(group)} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-900/40 transition-colors" title="Request a price check">
              Price Check
            </button>
          ) : (
            <span className="text-gray-400 dark:text-[#6b6b6b]">—</span>
          )}
        </div>
        {/* Price check date */}
        <div className="mt-1 sm:mt-0 text-xs sm:text-sm sm:text-center">
          <span className="sm:hidden text-gray-400 dark:text-[#6b6b6b] mr-1">Price date:</span>
          {canManage ? (
            <button type="button" onClick={() => openKitManualPriceDatePicker(group)} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors ${priceDateClass}`} title="Click to set the price check date manually">
              <CalendarIcon className="w-3 h-3 opacity-60" />
              {priceDateText}
            </button>
          ) : (
            <span className={priceDateClass}>{priceDateText}</span>
          )}
        </div>
        {/* PDS/SDS — kits don't carry data sheets */}
        <div className="mt-1 sm:mt-0 text-xs text-gray-400 dark:text-[#6b6b6b] sm:text-center"><span className="sm:hidden mr-1">Docs:</span>—</div>
        {/* Actions */}
        <div className="mt-2 sm:mt-0 flex sm:justify-end items-center gap-1">
          {(() => {
            const items: KebabMenuItem[] = []
            if (canManage) {
              items.push({
                label: 'Edit',
                icon: <PencilIcon size={13} />,
                onSelect: () => openEditKitGroup(group),
              })
            }
            if (canDelete) {
              items.push({
                label: 'Delete',
                icon: <Trash2Icon size={13} />,
                destructive: true,
                onSelect: () => setDeleteKitGroupTarget(group),
              })
            }
            if (items.length === 0) return null
            return <KebabMenu variant="light" title="Kit actions" items={items} />
          })()}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-full bg-gray-50 dark:bg-[#1a1a1a]">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/profile" className="flex-shrink-0"><ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" /></Link>
          <PackageIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            Material Management
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
              title="Settings"
            >
              <Settings2Icon className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => openAddProduct()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition border border-gray-300 dark:border-[#3a3a3a] text-gray-700 dark:text-[#a0a0a0] bg-white dark:bg-[#2e2e2e] hover:bg-gray-50 dark:hover:bg-[#3a3a3a]"
            >
              <PlusIcon className="w-4 h-4" />
              Add Product
            </button>
            <button
              onClick={() => openAddKit()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition border border-gray-300 dark:border-[#3a3a3a] text-gray-700 dark:text-[#a0a0a0] bg-white dark:bg-[#2e2e2e] hover:bg-gray-50 dark:hover:bg-[#3a3a3a]"
            >
              <PlusIcon className="w-4 h-4" />
              Add Kit
            </button>
            <button
              onClick={openAddSupplier}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded-lg transition"
            >
              <PlusIcon className="w-4 h-4" />
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
            <p className="text-gray-500 dark:text-[#a0a0a0] font-medium">No suppliers yet</p>
            <p className="text-gray-400 dark:text-[#6b6b6b] text-sm mt-1">
              {canManage ? 'Click "+ Add Supplier" to get started.' : 'No suppliers have been added yet.'}
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
              const standaloneProducts = supplierProducts
                .filter((p) => !p.kit_group_id)
                .sort((a, b) => a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name))
              const productsByGroup = new Map<string, MasterProduct[]>()
              for (const p of supplierProducts) {
                if (!p.kit_group_id) continue
                const arr = productsByGroup.get(p.kit_group_id) ?? []
                arr.push(p)
                productsByGroup.set(p.kit_group_id, arr)
              }
              const hasAnyContent = standaloneProducts.length > 0 || supplierKitGroups.length > 0
              const supplierColors = getSupplierColors(supplier.color)

              const innerSortableIds: string[] = []
              for (const p of standaloneProducts) innerSortableIds.push(p.id)
              for (const g of supplierKitGroups) {
                innerSortableIds.push(`kg-${g.id}`)
                const gp = [...(productsByGroup.get(g.id) ?? [])].sort((a, b) => a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name))
                for (const p of gp) innerSortableIds.push(p.id)
              }

              return (
                <SortableSupplierSection key={supplier.id} id={supplier.id} reorderMode={reorderMode}>
                  <div className={`bg-white dark:bg-[#242424] border border-gray-200 dark:border-[#3a3a3a] rounded-xl overflow-hidden ${reorderMode ? 'sm:ml-5' : ''}`}>
                    {/* Supplier header */}
                    <div className="flex items-center gap-3" style={{ borderLeft: `4px solid ${supplierColors.bar}`, backgroundColor: supplierColors.tint }}>
                      <button type="button" onClick={() => toggleSupplierCollapsed(supplier.id)} className="p-1 ml-2 text-gray-400 hover:text-gray-600 dark:text-[#8a8a8a] dark:hover:text-white transition-colors flex-shrink-0" aria-label={collapsed ? 'Expand supplier' : 'Collapse supplier'}>
                        {collapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                      </button>
                      <h2 className="text-[18px] font-medium uppercase tracking-wider text-gray-900 dark:text-[#f0f0f0] flex-1 truncate cursor-pointer py-3" onClick={() => toggleSupplierCollapsed(supplier.id)}>
                        {supplier.name}
                      </h2>
                      <span className="text-[11px] text-gray-500 dark:text-[#a0a0a0] bg-white/60 dark:bg-[#2e2e2e]/80 px-2.5 py-0.5 rounded-full font-medium">
                        {supplierProducts.length} {supplierProducts.length === 1 ? 'product' : 'products'}
                      </span>
                      {(() => {
                        const items: KebabMenuItem[] = []
                        if (canManage) {
                          items.push({
                            label: 'Edit',
                            icon: <PencilIcon size={13} />,
                            onSelect: () => openEditSupplier(supplier),
                          })
                        }
                        if (canDelete) {
                          items.push({
                            label: 'Delete',
                            icon: <Trash2Icon size={13} />,
                            destructive: true,
                            onSelect: () => setDeleteSupplierTarget(supplier),
                          })
                        }
                        if (items.length === 0) return null
                        return (
                          <div className="mr-2">
                            <KebabMenu variant="light" title="Supplier actions" items={items} />
                          </div>
                        )
                      })()}
                    </div>

                    {!collapsed && (
                      <div className="overflow-x-auto">
                        {/* Table header */}
                        <div className="hidden sm:grid grid-cols-[1fr_90px_120px_120px_100px_60px] gap-2 px-4 py-2.5 bg-gray-50 dark:bg-[#2e2e2e] border-t border-b border-gray-200 dark:border-[#3a3a3a] text-[11px] font-semibold text-gray-500 dark:text-[#a0a0a0] uppercase tracking-wide min-w-[700px]">
                          <div>Product Name</div>
                          <div className="text-right">Price</div>
                          <div className="text-center">Price Check</div>
                          <div className="text-center">Price Date</div>
                          <div className="text-center">PDS / SDS</div>
                          <div className="text-right">Actions</div>
                        </div>

                        {!hasAnyContent ? (
                          <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-[#6b6b6b]">No products or kit groups yet</div>
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
                              const groupProducts = [...(productsByGroup.get(group.id) ?? [])].sort((a, b) => a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name))
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
                              const groupProducts = [...(productsByGroup.get(group.id) ?? [])].sort((a, b) => a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.name.localeCompare(b.name))
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

      {/* Modals */}
      {supplierModalOpen && (
        <MasterSupplierModal
          supplier={editingSupplier}
          onClose={() => { setSupplierModalOpen(false); setEditingSupplier(null) }}
          onSave={saveSupplier}
        />
      )}

      {productModalOpen && (
        <MasterProductModal
          product={editingProduct}
          supplierName={productModalSupplierId ? suppliers.find((s) => s.id === productModalSupplierId)?.name ?? '' : ''}
          suppliers={suppliers}
          kitGroups={productModalSupplierId ? (kitGroupsBySupplier.get(productModalSupplierId) ?? []) : []}
          kitGroupsBySupplier={kitGroupsBySupplier}
          unitTypes={unitTypes}
          initialSupplierId={productModalSupplierId}
          onClose={() => { setProductModalOpen(false); setEditingProduct(null); setProductModalSupplierId(null) }}
          onSave={saveProduct}
        />
      )}

      {kitGroupModalOpen && kitGroupModalSupplierId && (
        <MasterKitGroupModal
          kitGroup={editingKitGroup}
          supplierName={suppliers.find((s) => s.id === kitGroupModalSupplierId)?.name ?? ''}
          onClose={() => { setKitGroupModalOpen(false); setEditingKitGroup(null); setKitGroupModalSupplierId(null) }}
          onSave={saveKitGroup}
        />
      )}

      {addKitModalOpen && (
        <MasterAddKitModal
          suppliers={suppliers}
          unitTypes={unitTypes}
          initialSupplierId={addKitSupplierId}
          onClose={() => { setAddKitModalOpen(false); setAddKitSupplierId(null) }}
          onSave={saveNewKit}
        />
      )}

      {priceCheckProduct && (
        <MasterPriceCheckRequestModal
          productName={priceCheckProduct.name}
          supplierName={suppliers.find((s) => s.id === priceCheckProduct.supplier_id)?.name ?? ''}
          profiles={profiles}
          onClose={() => setPriceCheckProduct(null)}
          onSubmit={submitPriceCheckRequest}
        />
      )}

      {priceCheckKitGroup && (
        <MasterPriceCheckRequestModal
          productName={priceCheckKitGroup.name}
          supplierName={suppliers.find((s) => s.id === priceCheckKitGroup.supplier_id)?.name ?? ''}
          profiles={profiles}
          onClose={() => setPriceCheckKitGroup(null)}
          onSubmit={submitKitPriceCheckRequest}
        />
      )}

      {docUploadProduct && (
        <DocumentUploadModal
          productName={docUploadProduct.name}
          onClose={closeDocUpload}
          onUpload={handleDocumentUpload}
          initialType={docUploadInitialType}
        />
      )}

      {viewingDoc && (
        <DocumentViewerModal
          isOpen={true}
          onClose={() => setViewingDoc(null)}
          fileUrl={viewingDoc.fileUrl}
          fileName={viewingDoc.fileName}
          fileType={viewingDoc.fileType}
          onDownload={downloadViewingDoc}
        />
      )}

      {settingsModalOpen && (
        <MasterSettingsModal
          unitTypes={unitTypes}
          onClose={() => setSettingsModalOpen(false)}
          onUnitTypesChange={setUnitTypes}
        />
      )}

      {/* Delete confirms */}
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
      {deleteDocTarget && (
        <ConfirmDialog
          title={`Delete ${deleteDocTarget.type}`}
          message={`Delete the ${deleteDocTarget.type} attached to "${deleteDocTarget.productName}"? This cannot be undone.`}
          confirmLabel={`Delete ${deleteDocTarget.type}`}
          onConfirm={confirmDeleteDocument}
          onCancel={() => setDeleteDocTarget(null)}
          loading={deleting}
        />
      )}

      {/* Hidden date input for manual price check date override (product) */}
      <input
        ref={manualPriceDateInputRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleManualPriceDateChange}
      />

      {/* Hidden date input for manual price check date override (kit group) */}
      <input
        ref={kitManualPriceDateInputRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleKitManualPriceDateChange}
      />
    </div>
  )
}
