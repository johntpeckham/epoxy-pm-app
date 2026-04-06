'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { WarrantyTemplate } from '@/types'
import {
  XIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  Heading1Icon,
  Heading2Icon,
  ListIcon,
  TagIcon,
  ChevronDownIcon,
} from 'lucide-react'

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

/** Convert legacy plain text to basic HTML */
function plainTextToHtml(text: string): string {
  if (/<[a-z][\s\S]*>/i.test(text)) return text
  const paragraphs = text.split(/\n\n+/)
  return paragraphs
    .map((p) => {
      const inner = p.trim().replace(/\n/g, '<br>')
      return inner ? `<p>${inner}</p>` : ''
    })
    .filter(Boolean)
    .join('')
}

interface Props {
  template: WarrantyTemplate | null // null = new template
  onSave: (data: { name: string; description: string; duration: string; body: string }) => Promise<void>
  onCancel: () => void
}

export default function WarrantyTemplateEditor({ template, onSave, onCancel }: Props) {
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [duration, setDuration] = useState(template?.warranty_duration ?? '')
  const [saving, setSaving] = useState(false)
  const [showFieldMenu, setShowFieldMenu] = useState(false)
  const fieldMenuRef = useRef<HTMLDivElement>(null)
  const [previewHtml, setPreviewHtml] = useState('')

  const initialContent = template?.body_text ? plainTextToHtml(template.body_text) : ''

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Underline,
      Placeholder.configure({
        placeholder: 'Start writing your warranty text...',
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      setPreviewHtml(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] px-4 py-3',
      },
    },
  })

  // Set initial preview
  useEffect(() => {
    if (editor && !previewHtml) {
      setPreviewHtml(editor.getHTML())
    }
  }, [editor])

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

  const insertField = useCallback(
    (field: string) => {
      if (!editor) return
      editor.chain().focus().insertContent(field).run()
      setShowFieldMenu(false)
    },
    [editor]
  )

  const handleSave = async () => {
    if (!name.trim() || !editor) return
    const body = editor.getHTML()
    if (!body || body === '<p></p>') return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), description: description.trim(), duration: duration.trim(), body })
    } finally {
      setSaving(false)
    }
  }

  // Build preview HTML with sample data replacement
  function getPreviewBody(): string {
    let html = previewHtml
    for (const [tag, sample] of Object.entries(SAMPLE_DATA)) {
      html = html.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), sample)
    }
    // Replace warranty_duration with live duration value
    html = html.replace(
      /\{\{warranty_duration\}\}/g,
      duration.trim() || 'N/A'
    )
    return html
  }

  const isActive = (type: string, attrs?: Record<string, unknown>) =>
    editor?.isActive(type, attrs) ?? false

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-white w-full max-w-7xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col mx-4 lg:mx-8 lg:rounded-xl">
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
          {/* Left — Editor */}
          <div className="flex-1 flex flex-col overflow-y-auto border-b lg:border-b-0 lg:border-r border-gray-200">
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

            {/* Warranty Body label */}
            <div className="px-6 pb-2 flex-shrink-0">
              <label className="block text-xs font-medium text-gray-600">Warranty Body</label>
            </div>

            {/* Toolbar */}
            <div className="px-6 pb-2 flex-shrink-0">
              <div className="flex flex-wrap items-center gap-1 border border-gray-200 rounded-lg p-1.5 bg-gray-50">
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  className={`p-1.5 rounded text-sm transition ${
                    isActive('bold') ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bold"
                >
                  <BoldIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  className={`p-1.5 rounded text-sm transition ${
                    isActive('italic') ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Italic"
                >
                  <ItalicIcon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleUnderline().run()}
                  className={`p-1.5 rounded text-sm transition ${
                    isActive('underline') ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Underline"
                >
                  <UnderlineIcon className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-300 mx-1" />

                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                  className={`p-1.5 rounded text-sm transition ${
                    isActive('heading', { level: 1 }) ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Heading 1"
                >
                  <Heading1Icon className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                  className={`p-1.5 rounded text-sm transition ${
                    isActive('heading', { level: 2 }) ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Heading 2"
                >
                  <Heading2Icon className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-300 mx-1" />

                <button
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBulletList().run()}
                  className={`p-1.5 rounded text-sm transition ${
                    isActive('bulletList') ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-200'
                  }`}
                  title="Bullet List"
                >
                  <ListIcon className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-gray-300 mx-1" />

                {/* Insert Field dropdown */}
                <div className="relative" ref={fieldMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowFieldMenu(!showFieldMenu)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition"
                  >
                    <TagIcon className="w-3.5 h-3.5" />
                    Insert Field
                    <ChevronDownIcon className="w-3.5 h-3.5" />
                  </button>
                  {showFieldMenu && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[200px]">
                      {MERGE_FIELDS.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => insertField(f.value)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition flex items-center justify-between"
                        >
                          <span className="text-gray-700">{f.label}</span>
                          <span className="text-xs text-gray-400 font-mono">{f.value}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tiptap Editor */}
            <div className="flex-1 px-6 pb-6 overflow-y-auto">
              <div className="border border-gray-200 rounded-lg overflow-hidden min-h-[400px]">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          {/* Right — Preview */}
          <div className="flex-1 flex flex-col overflow-y-auto bg-gray-50">
            <div className="p-6 pb-2 flex-shrink-0">
              <label className="block text-xs font-medium text-gray-600">Preview</label>
            </div>
            <div className="flex-1 px-6 pb-6 overflow-y-auto">
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 max-w-[600px] mx-auto">
                {/* PDF-like preview */}
                <div className="text-center mb-6">
                  <h1 className="text-xl font-bold text-gray-900 tracking-wide">PECKHAM COATINGS</h1>
                  <div className="h-px bg-amber-500 mt-2 mb-4" />
                  <p className="text-base font-semibold text-gray-800">
                    {name || 'Untitled Warranty'}
                  </p>
                </div>

                {/* Rendered body */}
                <div
                  className="prose prose-sm max-w-none text-gray-800 mb-8
                    [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mb-2
                    [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mb-2
                    [&_p]:mb-2 [&_p]:leading-relaxed
                    [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
                    [&_li]:mb-1"
                  dangerouslySetInnerHTML={{ __html: getPreviewBody() }}
                />

                {/* Signature block */}
                <div className="mt-12 pt-4">
                  <div className="w-48 border-b border-gray-900 mb-1" />
                  <p
                    className="text-xl text-gray-900 mb-0.5"
                    style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontStyle: 'italic' }}
                  >
                    John Smith
                  </p>
                  <p className="text-sm text-gray-600">John Smith</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
