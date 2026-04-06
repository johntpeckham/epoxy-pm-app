'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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
import SignatureCanvas from 'react-signature-canvas'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { WarrantyTemplate } from '@/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  GripVerticalIcon,
  Trash2Icon,
  TagIcon,
  ChevronDownIcon,
  PlusIcon,
  Heading1Icon,
  Heading2Icon,
  TypeIcon,
  MinusIcon,
  PenToolIcon,
} from 'lucide-react'

// ── Block types ────────────────────────────────────────────────────────────

export interface TemplateBlock {
  id: string
  type: 'header' | 'sub_header' | 'body' | 'divider' | 'signature'
  content: string
  color: string
  signatureData?: string
  signatureName?: string
  signatureTitle?: string
}

const MERGE_FIELDS = [
  { label: 'Customer Name', value: '{{customer_name}}' },
  { label: 'Project Name', value: '{{project_name}}' },
  { label: 'Estimate Number', value: '{{estimate_number}}' },
  { label: 'Address', value: '{{address}}' },
  { label: 'Date', value: '{{date}}' },
  { label: 'Warranty Duration', value: '{{warranty_duration}}' },
]

const SAMPLE_DATA: Record<string, string> = {
  '{{customer_name}}': 'John Smith',
  '{{project_name}}': 'Sample Project',
  '{{estimate_number}}': 'EST-001',
  '{{address}}': '123 Main Street, Anytown, CA 93401',
  '{{date}}': new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }),
}

function generateId(): string {
  return crypto.randomUUID()
}

// ── Legacy conversion ──────────────────────────────────────────────────────

function parseBodyToBlocks(bodyText: string): TemplateBlock[] {
  // Try JSON first
  try {
    const parsed = JSON.parse(bodyText)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
      return parsed as TemplateBlock[]
    }
  } catch {
    // not JSON
  }

  // Legacy: HTML or plain text → blocks
  // Strip HTML tags for conversion
  const stripped = bodyText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[12]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')

  const paragraphs = stripped.split(/\n\n+/).filter((p) => p.trim())
  const blocks: TemplateBlock[] = []

  for (const p of paragraphs) {
    const trimmed = p.trim()
    if (!trimmed) continue

    // Detect headers: ALL CAPS, or short lines ending with ":"
    const isHeader =
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 60 && !/\d{4}/.test(trimmed)) ||
      (trimmed.endsWith(':') && trimmed.length < 60)

    if (isHeader) {
      blocks.push({
        id: generateId(),
        type: 'header',
        content: trimmed,
        color: '#B45309', // amber-700
      })
    } else {
      blocks.push({
        id: generateId(),
        type: 'body',
        content: trimmed,
        color: '#000000',
      })
    }
  }

  return blocks.length > 0 ? blocks : [{ id: generateId(), type: 'body', content: '', color: '#000000' }]
}

// ── Block type metadata ────────────────────────────────────────────────────

const BLOCK_TYPE_META: Record<TemplateBlock['type'], { label: string; badge: string }> = {
  header: { label: 'Header', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  sub_header: { label: 'Sub Header', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  body: { label: 'Body', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  divider: { label: 'Divider', badge: 'bg-gray-100 text-gray-600 border-gray-300' },
  signature: { label: 'Signature', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
}

// ── Sortable Block Row ─────────────────────────────────────────────────────

function SortableBlockRow({
  block,
  onUpdate,
  onDelete,
}: {
  block: TemplateBlock
  onUpdate: (id: string, patch: Partial<TemplateBlock>) => void
  onDelete: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [showFieldMenu, setShowFieldMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fieldMenuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sigCanvasRef = useRef<SignatureCanvas | null>(null)

  // Close field menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (fieldMenuRef.current && !fieldMenuRef.current.contains(e.target as Node)) {
        setShowFieldMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Load signature data into canvas when block has saved data
  useEffect(() => {
    if (block.type === 'signature' && block.signatureData && sigCanvasRef.current) {
      // Small delay to let canvas initialize
      const timer = setTimeout(() => {
        if (sigCanvasRef.current && block.signatureData) {
          sigCanvasRef.current.fromDataURL(block.signatureData)
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [block.type])

  function insertField(field: string) {
    if (!textareaRef.current) return
    const ta = textareaRef.current
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newContent = block.content.slice(0, start) + field + block.content.slice(end)
    onUpdate(block.id, { content: newContent })
    setShowFieldMenu(false)
    // Restore cursor
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + field.length
      ta.setSelectionRange(pos, pos)
    })
  }

  function handleSignatureEnd() {
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
      onUpdate(block.id, { signatureData: sigCanvasRef.current.toDataURL('image/png') })
    }
  }

  function clearSignature() {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear()
      onUpdate(block.id, { signatureData: '' })
    }
  }

  const meta = BLOCK_TYPE_META[block.type]

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`border border-gray-200 rounded-lg bg-white transition ${
          isDragging ? 'shadow-lg opacity-80 z-10' : 'shadow-sm'
        }`}
      >
        {/* Block header row */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
            tabIndex={-1}
          >
            <GripVerticalIcon className="w-4 h-4" />
          </button>

          {/* Type badge */}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.badge}`}>
            {meta.label}
          </span>

          <div className="flex-1" />

          {/* Color picker — not on signature blocks */}
          {block.type !== 'signature' && (
            <label className="flex items-center gap-1 cursor-pointer" title="Change color">
              <div
                className="w-4 h-4 rounded-full border border-gray-300"
                style={{ backgroundColor: block.color }}
              />
              <input
                type="color"
                value={block.color}
                onChange={(e) => onUpdate(block.id, { color: e.target.value })}
                className="sr-only"
              />
            </label>
          )}

          {/* Delete */}
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 text-gray-400 hover:text-red-500 transition"
            title="Delete block"
          >
            <Trash2Icon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Block content */}
        <div className="p-3">
          {block.type === 'header' && (
            <input
              type="text"
              value={block.content}
              onChange={(e) => onUpdate(block.id, { content: e.target.value })}
              placeholder="Section Title"
              className="w-full text-lg font-bold border-0 bg-transparent focus:outline-none focus:ring-0 placeholder:text-gray-300"
              style={{ color: block.color }}
            />
          )}

          {block.type === 'sub_header' && (
            <input
              type="text"
              value={block.content}
              onChange={(e) => onUpdate(block.id, { content: e.target.value })}
              placeholder="Sub Section"
              className="w-full text-base font-semibold border-0 bg-transparent focus:outline-none focus:ring-0 placeholder:text-gray-300"
              style={{ color: block.color }}
            />
          )}

          {block.type === 'body' && (
            <div>
              {/* Merge field toolbar */}
              <div className="flex flex-wrap items-center gap-1 mb-2">
                <div className="relative" ref={fieldMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowFieldMenu(!showFieldMenu)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition"
                  >
                    <TagIcon className="w-3 h-3" />
                    Insert Field
                    <ChevronDownIcon className="w-3 h-3" />
                  </button>
                  {showFieldMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[200px]">
                      {MERGE_FIELDS.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => insertField(f.value)}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-amber-50 transition flex items-center justify-between"
                        >
                          <span className="text-gray-700">{f.label}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{f.value}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={block.content}
                onChange={(e) => onUpdate(block.id, { content: e.target.value })}
                placeholder="Enter body text... Use 'Insert Field' to add merge fields."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y min-h-[80px] font-mono"
                style={{ color: block.color }}
                rows={3}
              />
            </div>
          )}

          {block.type === 'divider' && (
            <div className="py-1">
              <hr style={{ borderColor: block.color }} className="border-t-2" />
            </div>
          )}

          {block.type === 'signature' && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Draw signature below:</p>
                <div className="border border-gray-300 rounded-lg overflow-hidden bg-white" style={{ width: 300, height: 150 }}>
                  <SignatureCanvas
                    ref={sigCanvasRef}
                    penColor="black"
                    canvasProps={{ width: 300, height: 150, className: 'signature-canvas' }}
                    onEnd={handleSignatureEnd}
                  />
                </div>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="mt-1 text-xs text-gray-500 hover:text-red-500 transition"
                >
                  Clear
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={block.signatureName ?? ''}
                  onChange={(e) => onUpdate(block.id, { signatureName: e.target.value })}
                  placeholder="e.g., John Peckham"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={block.signatureTitle ?? ''}
                  onChange={(e) => onUpdate(block.id, { signatureTitle: e.target.value })}
                  placeholder="e.g., Project Manager"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Block"
          message={`Delete this ${meta.label} block?`}
          onConfirm={() => {
            onDelete(block.id)
            setConfirmDelete(false)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}

// ── Preview Panel ──────────────────────────────────────────────────────────

function PreviewPanel({
  name,
  duration,
  blocks,
  logoUrl,
}: {
  name: string
  duration: string
  blocks: TemplateBlock[]
  logoUrl: string | null
}) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  function replaceMergeFields(text: string): string {
    let result = text
    for (const [tag, sample] of Object.entries(SAMPLE_DATA)) {
      result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), sample)
    }
    result = result.replace(/\{\{warranty_duration\}\}/g, duration.trim() || 'N/A')
    return result
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 max-w-[600px] mx-auto">
      {/* Document Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-wide">PECKHAM COATINGS</h1>
          <p className="text-xs text-gray-500 mt-0.5">{name || 'Untitled Warranty'}</p>
        </div>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Company logo"
            className="max-w-[80px] max-h-[40px] object-contain"
          />
        )}
      </div>
      <div className="h-px bg-amber-500 mb-6" />

      {/* Block rendering */}
      {blocks.map((block) => {
        switch (block.type) {
          case 'header':
            return (
              <div key={block.id} className="mt-4 mb-2">
                <h2
                  className="text-base font-bold tracking-wide"
                  style={{ color: block.color }}
                >
                  {replaceMergeFields(block.content) || 'Section Title'}
                </h2>
                <div className="h-px mt-1" style={{ backgroundColor: block.color, opacity: 0.2 }} />
              </div>
            )
          case 'sub_header':
            return (
              <div key={block.id} className="mt-3 mb-1">
                <h3
                  className="text-sm font-bold"
                  style={{ color: block.color }}
                >
                  {replaceMergeFields(block.content) || 'Sub Section'}
                </h3>
              </div>
            )
          case 'body':
            return (
              <p
                key={block.id}
                className="text-sm leading-relaxed mb-2 whitespace-pre-wrap"
                style={{ color: block.color }}
              >
                {replaceMergeFields(block.content) || ''}
              </p>
            )
          case 'divider':
            return (
              <div key={block.id} className="my-4">
                <hr className="border-t-2" style={{ borderColor: block.color }} />
              </div>
            )
          case 'signature':
            return (
              <div key={block.id} className="mt-8">
                {block.signatureData ? (
                  <img
                    src={block.signatureData}
                    alt="Signature"
                    className="h-16 mb-1"
                  />
                ) : (
                  <div className="w-48 h-16 border-2 border-dashed border-gray-300 rounded flex items-center justify-center mb-1">
                    <span className="text-xs text-gray-400">Signature</span>
                  </div>
                )}
                <div className="w-48 border-b border-gray-900 mb-1" />
                {block.signatureName && (
                  <p
                    className="text-base text-gray-900"
                    style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
                  >
                    {block.signatureName}
                  </p>
                )}
                {block.signatureTitle && (
                  <p className="text-xs text-gray-500">{block.signatureTitle}</p>
                )}
              </div>
            )
          default:
            return null
        }
      })}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">Date: {today}</p>
      </div>
    </div>
  )
}

// ── Main Editor Component ──────────────────────────────────────────────────

interface Props {
  template: WarrantyTemplate | null
  onSave: (data: { name: string; description: string; duration: string; body: string }) => Promise<void>
  onCancel: () => void
}

export default function WarrantyTemplateEditor({ template, onSave, onCancel }: Props) {
  const { settings: companySettings } = useCompanySettings()
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [duration, setDuration] = useState(template?.warranty_duration ?? '')
  const [blocks, setBlocks] = useState<TemplateBlock[]>(() => {
    if (template?.body_text) {
      return parseBodyToBlocks(template.body_text)
    }
    return [{ id: generateId(), type: 'body', content: '', color: '#000000' }]
  })
  const [saving, setSaving] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Close add menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── DnD ──

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setBlocks((prev) => {
      const oldIdx = prev.findIndex((b) => b.id === active.id)
      const newIdx = prev.findIndex((b) => b.id === over.id)
      if (oldIdx < 0 || newIdx < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(oldIdx, 1)
      next.splice(newIdx, 0, moved)
      return next
    })
  }

  // ── Block operations ──

  function updateBlock(id: string, patch: Partial<TemplateBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function deleteBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  function addBlock(type: TemplateBlock['type']) {
    const defaults: Record<TemplateBlock['type'], Partial<TemplateBlock>> = {
      header: { content: 'Section Title', color: '#B45309' },
      sub_header: { content: 'Sub Section', color: '#92400E' },
      body: { content: '', color: '#000000' },
      divider: { content: '', color: '#E5E7EB' },
      signature: { content: '', color: '#000000', signatureData: '', signatureName: '', signatureTitle: '' },
    }
    setBlocks((prev) => [
      ...prev,
      { id: generateId(), type, ...defaults[type] } as TemplateBlock,
    ])
    setShowAddMenu(false)
  }

  // ── Save ──

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        duration: duration.trim(),
        body: JSON.stringify(blocks),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-white w-full h-full lg:max-w-7xl lg:max-h-[90vh] lg:rounded-xl shadow-2xl flex flex-col lg:mx-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {template ? 'Edit Template' : 'New Template'}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Body — split view */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left — Block Editor */}
          <div className="flex-1 flex flex-col overflow-y-auto border-b lg:border-b-0 lg:border-r border-gray-200">
            {/* Top fields */}
            <div className="p-6 space-y-4 flex-shrink-0">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Template Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="e.g., 1-Year Standard Warranty"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Warranty Duration</label>
                <input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder='e.g., "1 year", "15 years"'
                />
              </div>
            </div>

            {/* Block list */}
            <div className="flex-1 px-6 pb-4 overflow-y-auto">
              <label className="block text-xs font-medium text-gray-600 mb-2">Content Blocks</label>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {blocks.map((block) => (
                      <SortableBlockRow
                        key={block.id}
                        block={block}
                        onUpdate={updateBlock}
                        onDelete={deleteBlock}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Add block */}
              <div className="mt-4 relative" ref={addMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-amber-600 px-3 py-2 rounded-lg border border-dashed border-gray-300 hover:border-amber-400 transition w-full justify-center"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Block
                </button>
                {showAddMenu && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                    <button
                      onClick={() => addBlock('header')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 transition text-left"
                    >
                      <Heading1Icon className="w-4 h-4 text-amber-600" />
                      Header
                    </button>
                    <button
                      onClick={() => addBlock('sub_header')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 transition text-left"
                    >
                      <Heading2Icon className="w-4 h-4 text-orange-600" />
                      Sub Header
                    </button>
                    <button
                      onClick={() => addBlock('body')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 transition text-left"
                    >
                      <TypeIcon className="w-4 h-4 text-blue-600" />
                      Body
                    </button>
                    <button
                      onClick={() => addBlock('divider')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 transition text-left"
                    >
                      <MinusIcon className="w-4 h-4 text-gray-500" />
                      Divider
                    </button>
                    <button
                      onClick={() => addBlock('signature')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 transition text-left"
                    >
                      <PenToolIcon className="w-4 h-4 text-purple-600" />
                      Signature
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right — Preview */}
          <div className="flex-1 flex flex-col overflow-y-auto bg-gray-50">
            <div className="p-6 pb-2 flex-shrink-0">
              <label className="block text-xs font-medium text-gray-600">Preview</label>
            </div>
            <div className="flex-1 px-6 pb-6 overflow-y-auto">
              <PreviewPanel
                name={name}
                duration={duration}
                blocks={blocks}
                logoUrl={companySettings?.logo_url ?? null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
