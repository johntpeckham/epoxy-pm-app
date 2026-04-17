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
import { PreLienTemplate } from '@/types'
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
  ChevronsUpDownIcon,
} from 'lucide-react'

// ── Block types ────────────────────────────────────────────────────────────

export interface TemplateBlock {
  id: string
  type: 'header' | 'sub_header' | 'body' | 'divider' | 'signature' | 'spacer'
  content: string
  color: string
  height?: number
  signatureData?: string
  signatureName?: string
  signatureTitle?: string
}

export interface HeaderDividerSettings {
  enabled: boolean
  color: string
}

const DEFAULT_HEADER_DIVIDER: HeaderDividerSettings = {
  enabled: true,
  color: '#000000',
}

const MERGE_FIELDS: { label: string; value: string; group: string }[] = [
  // Company
  { label: 'Company Name', value: '{{company_name}}', group: 'Company' },
  { label: 'Company Address', value: '{{company_address}}', group: 'Company' },
  { label: 'Company Phone', value: '{{company_phone}}', group: 'Company' },
  { label: 'Company Email', value: '{{company_email}}', group: 'Company' },
  { label: 'CSLB License', value: '{{cslb_license}}', group: 'Company' },
  // Project
  { label: 'Project Name', value: '{{project_name}}', group: 'Project' },
  { label: 'Project Address', value: '{{project_address}}', group: 'Project' },
  // Owner
  { label: 'Owner Name', value: '{{owner_name}}', group: 'Owner' },
  { label: 'Owner Address', value: '{{owner_address}}', group: 'Owner' },
  // Direct Contractor
  { label: 'Direct Contractor Name', value: '{{direct_contractor_name}}', group: 'Direct Contractor' },
  { label: 'Direct Contractor Address', value: '{{direct_contractor_address}}', group: 'Direct Contractor' },
  // Construction Lender
  { label: 'Construction Lender Name', value: '{{construction_lender_name}}', group: 'Construction Lender' },
  { label: 'Construction Lender Address', value: '{{construction_lender_address}}', group: 'Construction Lender' },
  // Hiring Party
  { label: 'Hiring Party Name', value: '{{hiring_party_name}}', group: 'Hiring Party' },
  { label: 'Hiring Party Address', value: '{{hiring_party_address}}', group: 'Hiring Party' },
  { label: 'Hiring Party Relationship', value: '{{hiring_party_relationship}}', group: 'Hiring Party' },
  // Project Details
  { label: 'Description of Work', value: '{{description_of_work}}', group: 'Project Details' },
  { label: 'Estimated Total Price', value: '{{estimated_total_price}}', group: 'Project Details' },
  // Other
  { label: 'Date', value: '{{date}}', group: 'Other' },
]

const FIELD_KEY_TO_LABEL: Record<string, string> = {
  company_name: 'Company Name',
  company_address: 'Company Address',
  company_phone: 'Company Phone',
  company_email: 'Company Email',
  cslb_license: 'CSLB License',
  project_name: 'Project Name',
  project_address: 'Project Address',
  owner_name: 'Owner Name',
  owner_address: 'Owner Address',
  direct_contractor_name: 'Direct Contractor Name',
  direct_contractor_address: 'Direct Contractor Address',
  construction_lender_name: 'Construction Lender Name',
  construction_lender_address: 'Construction Lender Address',
  hiring_party_name: 'Hiring Party Name',
  hiring_party_address: 'Hiring Party Address',
  hiring_party_relationship: 'Hiring Party Relationship',
  description_of_work: 'Description of Work',
  estimated_total_price: 'Estimated Total Price',
  date: 'Date',
}

/** Convert block content string (with {{field}} tags) to HTML with green chip spans */
function contentToHtml(content: string): string {
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const withChips = escaped.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const label = FIELD_KEY_TO_LABEL[key] || key
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium bg-green-100 border border-green-300 text-green-800" contenteditable="false" data-field="${key}">${label}</span>`
  })
  return withChips.replace(/\n/g, '<br>')
}

/** Convert contentEditable HTML back to plain content string with {{field}} tags */
function htmlToContent(el: HTMLElement): string {
  let result = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement
      const field = elem.getAttribute('data-field')
      if (field) {
        result += `{{${field}}}`
      } else if (elem.tagName === 'BR') {
        result += '\n'
      } else if (elem.tagName === 'DIV') {
        // contentEditable wraps new lines in <div>
        if (result.length > 0 && !result.endsWith('\n')) {
          result += '\n'
        }
        result += htmlToContent(elem)
      } else {
        result += htmlToContent(elem)
      }
    }
  }
  return result
}

const STATIC_SAMPLE_DATA: Record<string, string> = {
  '{{project_name}}': 'Sample Project',
  '{{project_address}}': '123 Main Street, Anytown, CA 93401',
  '{{owner_name}}': 'Property Owner Name',
  '{{owner_address}}': '456 Oak Ave, Anytown, CA 93401',
  '{{direct_contractor_name}}': 'General Contractor Inc.',
  '{{direct_contractor_address}}': '789 Elm St, Anytown, CA 93401',
  '{{construction_lender_name}}': 'First National Bank',
  '{{construction_lender_address}}': '100 Bank St, Anytown, CA 93401',
  '{{hiring_party_name}}': 'Hiring Party Name',
  '{{hiring_party_address}}': '200 Pine St, Anytown, CA 93401',
  '{{hiring_party_relationship}}': 'Direct Contractor',
  '{{description_of_work}}': 'Commercial painting and coating services',
  '{{estimated_total_price}}': '50,000.00',
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

function parseBodyData(bodyText: string): { blocks: TemplateBlock[]; headerDivider: HeaderDividerSettings } {
  // Try JSON first
  try {
    const parsed = JSON.parse(bodyText)
    // New object format: { blocks: [...], headerDivider: {...} }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.blocks) {
      return {
        blocks: parsed.blocks as TemplateBlock[],
        headerDivider: parsed.headerDivider ?? { ...DEFAULT_HEADER_DIVIDER },
      }
    }
    // Old array format
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
      return {
        blocks: parsed as TemplateBlock[],
        headerDivider: { ...DEFAULT_HEADER_DIVIDER },
      }
    }
  } catch {
    // not JSON
  }

  // Legacy: HTML or plain text → blocks
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

    const isHeader =
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 60 && !/\d{4}/.test(trimmed)) ||
      (trimmed.endsWith(':') && trimmed.length < 60)

    if (isHeader) {
      blocks.push({
        id: generateId(),
        type: 'header',
        content: trimmed,
        color: '#B45309',
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

  const finalBlocks = blocks.length > 0 ? blocks : [{ id: generateId(), type: 'body' as const, content: '', color: '#000000' }]
  return { blocks: finalBlocks, headerDivider: { ...DEFAULT_HEADER_DIVIDER } }
}

// ── Block type metadata ────────────────────────────────────────────────────

const BLOCK_TYPE_META: Record<TemplateBlock['type'], { label: string; badge: string }> = {
  header: { label: 'Header', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  sub_header: { label: 'Sub Header', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  body: { label: 'Body', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  divider: { label: 'Divider', badge: 'bg-gray-100 text-gray-600 border-gray-300' },
  spacer: { label: 'Spacer', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
  signature: { label: 'Signature', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
}

// ── Preset Color Palette ──────────────────────────────────────────────────

const PRESET_COLORS = [
  { label: 'Black', hex: '#000000' },
  { label: 'Dark Gray', hex: '#4B5563' },
  { label: 'Orange', hex: '#D97706' },
  { label: 'Brown', hex: '#92400E' },
  { label: 'Red', hex: '#DC2626' },
  { label: 'Blue', hex: '#2563EB' },
  { label: 'Green', hex: '#16A34A' },
  { label: 'Purple', hex: '#7C3AED' },
  { label: 'Teal', hex: '#0D9488' },
  { label: 'Navy', hex: '#1E3A5A' },
]

// ── Body ContentEditable ───────────────────────────────────────────────────

function BodyContentEditable({
  content,
  color,
  editableRef,
  onSync,
}: {
  content: string
  color: string
  editableRef: React.RefObject<HTMLDivElement | null>
  onSync: (content: string) => void
}) {
  const internalRef = useRef<HTMLDivElement>(null)
  const ref = editableRef || internalRef
  const initializedRef = useRef(false)

  // Set initial HTML on mount only
  useEffect(() => {
    if (ref.current && !initializedRef.current) {
      ref.current.innerHTML = contentToHtml(content)
      initializedRef.current = true
    }
  }, [])

  // If content changes externally (e.g., via insert field), update HTML
  // But skip if the element is focused (user is typing)
  useEffect(() => {
    if (!ref.current) return
    if (document.activeElement === ref.current) return
    const currentContent = htmlToContent(ref.current)
    if (currentContent !== content) {
      ref.current.innerHTML = contentToHtml(content)
    }
  }, [content])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[80px] whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
      style={{ color }}
      onBlur={() => {
        if (ref.current) {
          onSync(htmlToContent(ref.current))
        }
      }}
      onPaste={(e) => {
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
      data-placeholder="Enter body text... Use 'Insert Field' to add merge fields."
    />
  )
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
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fieldMenuRef = useRef<HTMLDivElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const editableRef = useRef<HTMLDivElement>(null)
  const sigCanvasRef = useRef<SignatureCanvas | null>(null)

  // Close field menu and color picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (fieldMenuRef.current && !fieldMenuRef.current.contains(e.target as Node)) {
        setShowFieldMenu(false)
      }
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
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

  function insertField(fieldValue: string) {
    const el = editableRef.current
    if (!el) return
    // Extract field key from {{key}}
    const key = fieldValue.replace(/\{|\}/g, '')
    const label = FIELD_KEY_TO_LABEL[key] || key
    const chipHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium bg-green-100 border border-green-300 text-green-800" contenteditable="false" data-field="${key}">${label}</span>`
    el.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const temp = document.createElement('div')
      temp.innerHTML = chipHtml
      const chip = temp.firstChild!
      range.insertNode(chip)
      // Move cursor after the chip
      range.setStartAfter(chip)
      range.setEndAfter(chip)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    // Sync back
    onUpdate(block.id, { content: htmlToContent(el) })
    setShowFieldMenu(false)
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

          {/* Color palette — not on signature or spacer blocks */}
          {block.type !== 'signature' && block.type !== 'spacer' && (
            <div className="relative" ref={colorPickerRef}>
              <button
                type="button"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-5 h-5 rounded-full border border-gray-300 cursor-pointer hover:ring-2 hover:ring-amber-300 transition"
                style={{ backgroundColor: block.color }}
                title="Change color"
              />
              {showColorPicker && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 w-[136px]">
                  <div className="grid grid-cols-5 gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => {
                          onUpdate(block.id, { color: c.hex })
                          setShowColorPicker(false)
                        }}
                        className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition flex items-center justify-center"
                        style={{ backgroundColor: c.hex }}
                        title={c.label}
                      >
                        {block.color.toLowerCase() === c.hex.toLowerCase() && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Delete */}
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 text-gray-400 hover:text-red-500 transition"
            title="Delete block"
          >
            <Trash2Icon className="w-4 h-4" />
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
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[240px] max-h-[360px] overflow-y-auto">
                      {Array.from(new Set(MERGE_FIELDS.map((f) => f.group))).map((group) => (
                        <div key={group}>
                          <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{group}</p>
                          {MERGE_FIELDS.filter((f) => f.group === group).map((f) => (
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
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <BodyContentEditable
                content={block.content}
                color={block.color}
                editableRef={editableRef}
                onSync={(newContent) => onUpdate(block.id, { content: newContent })}
              />
            </div>
          )}

          {block.type === 'divider' && (
            <div className="py-1">
              <hr style={{ borderColor: block.color }} className="border-t-2" />
            </div>
          )}

          {block.type === 'spacer' && (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={block.height ?? 20}
                onChange={(e) => onUpdate(block.id, { height: parseInt(e.target.value) })}
                className="flex-1 h-1.5 accent-amber-500"
              />
              <span className="text-xs text-gray-500 font-mono w-10 text-right">{block.height ?? 20}px</span>
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
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={block.signatureTitle ?? ''}
                  onChange={(e) => onUpdate(block.id, { signatureTitle: e.target.value })}
                  placeholder="e.g., Project Manager"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
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
  blocks,
  logoUrl,
  headerDivider,
  companyName,
  companyLegalName,
  companyDba,
  companyAddress,
  companyPhone,
  companyEmail,
  companyLicenses,
}: {
  name: string
  blocks: TemplateBlock[]
  logoUrl: string | null
  headerDivider: HeaderDividerSettings
  companyName: string
  companyLegalName: string | null
  companyDba: string | null
  companyAddress: string | null
  companyPhone: string | null
  companyEmail: string | null
  companyLicenses: { number: string; classification: string }[] | null
}) {
  // Build dynamic sample data using company settings
  const companyDisplayName =
    companyDba || companyLegalName || companyName || 'Peckham Coatings'
  const firstLicense =
    companyLicenses && companyLicenses.length > 0
      ? `#${companyLicenses[0].number}`
      : '—'

  const dynamicSampleData: Record<string, string> = {
    ...STATIC_SAMPLE_DATA,
    '{{company_name}}': companyDisplayName,
    '{{company_address}}': companyAddress || '—',
    '{{company_phone}}': companyPhone || '—',
    '{{company_email}}': companyEmail || '—',
    '{{cslb_license}}': firstLicense,
  }

  function replaceMergeFields(text: string): string {
    // Add space between adjacent merge fields (}}{{) before replacing
    let result = text.replace(/\}\}\{\{/g, '}} {{')
    for (const [tag, sample] of Object.entries(dynamicSampleData)) {
      result = result.split(tag).join(sample)
    }
    return result
  }

  const displayName = name || 'Untitled Pre-Lien Notice'

  // Line 1: Company identity — "[Legal Name] DBA [DBA Name]"
  let companyIdentity: string
  if (companyLegalName && companyDba && companyLegalName.toLowerCase() !== companyDba.toLowerCase()) {
    companyIdentity = `${companyLegalName} DBA ${companyDba}`
  } else {
    companyIdentity = companyDba || companyLegalName || companyName
  }

  // Line 2: Address (own line)
  const addressLine = companyAddress ? companyAddress.replace(/\n/g, ', ') : null

  // Line 3: Phone | Email (own line)
  const contactParts: string[] = []
  if (companyPhone) contactParts.push(companyPhone)
  if (companyEmail) contactParts.push(companyEmail)
  const contactLine = contactParts.length > 0 ? contactParts.join(' | ') : null

  // Line 4: CSLB licenses — "CSLB Lic. #1234567 (B), #7654321 (C-33)"
  const formattedLicenses = companyLicenses && companyLicenses.length > 0
    ? companyLicenses.map((l) => {
        const code = l.classification.includes(' - ') ? l.classification.split(' - ')[0].trim() : l.classification.trim()
        return `#${l.number} (${code})`
      }).join(', ')
    : null

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md max-w-[600px] mx-auto font-[Helvetica,Arial,sans-serif]">
      {/* Page content area — matches PDF margins proportionally */}
      <div className="px-8 pt-6 pb-4">
        {/* Document Header — company letterhead */}
        <div className="flex items-start justify-between gap-4">
          <div className="leading-tight">
            <h1 className="text-base font-bold text-gray-900">{companyIdentity}</h1>
            {addressLine && (
              <p className="text-[10px] text-gray-500 mt-0.5">{addressLine}</p>
            )}
            {contactLine && (
              <p className="text-[10px] text-gray-500 mt-0.5">{contactLine}</p>
            )}
            {formattedLicenses && (
              <p className="text-[8px] text-gray-400 mt-0.5">CSLB Lic. {formattedLicenses}</p>
            )}
          </div>
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Company logo"
              className="max-w-[90px] max-h-[45px] object-contain flex-shrink-0"
            />
          )}
        </div>

        {/* Document title — heading */}
        <h2 className="text-base font-semibold text-gray-800 mt-4">{displayName}</h2>

        {/* Header divider line — configurable */}
        {headerDivider.enabled && (
          <div className="h-[2px] mt-4 mb-6" style={{ backgroundColor: headerDivider.color }} />
        )}
        {!headerDivider.enabled && <div className="mt-4 mb-6" />}

        {/* Block rendering */}
        {blocks.map((block) => {
          switch (block.type) {
            case 'header':
              return (
                <div key={block.id} className="mt-2 mb-1">
                  <h2
                    className="text-[11px] font-bold uppercase leading-snug"
                    style={{ color: block.color }}
                  >
                    {replaceMergeFields(block.content) || 'Section Title'}
                  </h2>
                </div>
              )
            case 'sub_header':
              return (
                <div key={block.id} className="mt-1.5 mb-1">
                  <h3
                    className="text-[11px] font-bold leading-snug"
                    style={{ color: block.color }}
                  >
                    {replaceMergeFields(block.content) || 'Sub Section'}
                  </h3>
                </div>
              )
            case 'body':
              return (
                <div key={block.id} className="mb-0.5">
                  <p
                    className="text-[11px] leading-[1.5] whitespace-pre-wrap"
                    style={{ color: block.color }}
                  >
                    {replaceMergeFields(block.content) || ''}
                  </p>
                </div>
              )
            case 'divider':
              return (
                <div key={block.id} className="my-2">
                  <div
                    className="h-[1px] w-full"
                    style={{ backgroundColor: block.color }}
                  />
                </div>
              )
            case 'spacer':
              return (
                <div key={block.id} style={{ height: block.height ?? 20 }} />
              )
            case 'signature':
              return (
                <div key={block.id} className="mt-5">
                  <div className="w-[34%] border-t border-gray-900" />
                  {block.signatureData ? (
                    /* PDF: signature image 50mm × 25mm */
                    <img
                      src={block.signatureData}
                      alt="Signature"
                      className="max-w-[180px] h-auto mt-1 mb-1"
                    />
                  ) : (
                    <div className="w-[180px] h-[60px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center mt-1 mb-1">
                      <span className="text-[10px] text-gray-400 italic">Signature will appear here</span>
                    </div>
                  )}
                  {/* PDF: helvetica normal 10pt, DARK color */}
                  {block.signatureName && (
                    <p className="text-[11px] text-gray-900">
                      {block.signatureName}
                    </p>
                  )}
                  {/* PDF: helvetica normal 9pt, LABEL_GRAY [75,85,99] */}
                  {block.signatureTitle && (
                    <p className="text-[10px] mt-0.5" style={{ color: '#4B5563' }}>
                      {block.signatureTitle}
                    </p>
                  )}
                </div>
              )
            default:
              return null
          }
        })}

      </div>

      {/* Page footer — PDF: helvetica italic 7pt, MED gray-500 */}
      <div className="px-8 py-3 border-t border-gray-100 flex items-center justify-between">
        <p className="text-[9px] italic text-gray-400">
          {companyIdentity} — {displayName}
        </p>
        <p className="text-[9px] italic text-gray-400">
          Page 1 of 1
        </p>
      </div>
    </div>
  )
}

// ── Main Editor Component ──────────────────────────────────────────────────

interface Props {
  template: PreLienTemplate | null
  onSave: (data: { name: string; description: string; body: string }) => Promise<void>
  onCancel: () => void
}

export default function PreLienTemplateEditor({ template, onSave, onCancel }: Props) {
  const { settings: companySettings } = useCompanySettings()
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [initData] = useState(() => {
    if (template?.body) {
      return parseBodyData(template.body)
    }
    return { blocks: [{ id: generateId(), type: 'body' as const, content: '', color: '#000000' }], headerDivider: { ...DEFAULT_HEADER_DIVIDER } }
  })
  const [blocks, setBlocks] = useState<TemplateBlock[]>(initData.blocks)
  const [headerDivider, setHeaderDivider] = useState<HeaderDividerSettings>(initData.headerDivider)
  const [saving, setSaving] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showDividerColorPicker, setShowDividerColorPicker] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const dividerColorRef = useRef<HTMLDivElement>(null)
  const blockListRef = useRef<HTMLDivElement>(null)

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
      if (dividerColorRef.current && !dividerColorRef.current.contains(e.target as Node)) {
        setShowDividerColorPicker(false)
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
      spacer: { content: '', color: '#000000', height: 20 },
      signature: { content: '', color: '#000000', signatureData: '', signatureName: '', signatureTitle: '' },
    }
    setBlocks((prev) => [
      ...prev,
      { id: generateId(), type, ...defaults[type] } as TemplateBlock,
    ])
    setShowAddMenu(false)
    setTimeout(() => {
      blockListRef.current?.scrollTo({ top: blockListRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
  }

  // ── Save ──

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        body: JSON.stringify({ blocks, headerDivider }),
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
          <div className="flex-1 flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-gray-200">
            {/* Top fields */}
            <div className="p-6 space-y-4 flex-shrink-0">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Template Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="e.g., California Preliminary 20-Day Notice"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  placeholder="Optional description"
                />
              </div>
              {/* Header Divider toggle + color */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Header Divider</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={headerDivider.enabled}
                    onClick={() => setHeaderDivider((prev) => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      headerDivider.enabled ? 'bg-amber-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        headerDivider.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </button>
                  {headerDivider.enabled && (
                    <div className="relative" ref={dividerColorRef}>
                      <button
                        type="button"
                        onClick={() => setShowDividerColorPicker(!showDividerColorPicker)}
                        className="w-5 h-5 rounded-full border border-gray-300 cursor-pointer hover:ring-2 hover:ring-amber-300 transition"
                        style={{ backgroundColor: headerDivider.color }}
                        title="Divider color"
                      />
                      {showDividerColorPicker && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 w-[136px]">
                          <div className="grid grid-cols-5 gap-1.5">
                            {PRESET_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => {
                                  setHeaderDivider((prev) => ({ ...prev, color: c.hex }))
                                  setShowDividerColorPicker(false)
                                }}
                                className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition flex items-center justify-center"
                                style={{ backgroundColor: c.hex }}
                                title={c.label}
                              >
                                {headerDivider.color.toLowerCase() === c.hex.toLowerCase() && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content Blocks label + Add Block button — sticky above the scrollable list */}
            <div className="px-6 py-2 flex-shrink-0 border-t border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600">Content Blocks</label>
                <div className="relative" ref={addMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowAddMenu(!showAddMenu)}
                    className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 px-2 py-1 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 transition"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Block
                  </button>
                  {showAddMenu && (
                    <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[150px]">
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
                        onClick={() => addBlock('spacer')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 transition text-left"
                      >
                        <ChevronsUpDownIcon className="w-4 h-4 text-gray-500" />
                        Spacer
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

            {/* Scrollable block list */}
            <div className="flex-1 px-6 py-4 overflow-y-auto" ref={blockListRef}>
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
                blocks={blocks}
                logoUrl={companySettings?.logo_url ?? null}
                headerDivider={headerDivider}
                companyName={companySettings?.dba || companySettings?.legal_name || 'Peckham Coatings'}
                companyLegalName={companySettings?.legal_name ?? null}
                companyDba={companySettings?.dba ?? null}
                companyAddress={companySettings?.company_address ?? null}
                companyPhone={companySettings?.phone ?? null}
                companyEmail={companySettings?.email ?? null}
                companyLicenses={companySettings?.cslb_licenses ?? null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
