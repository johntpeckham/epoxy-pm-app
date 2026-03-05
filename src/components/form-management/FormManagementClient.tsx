'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeftIcon,
  SlidersHorizontalIcon,
  LoaderIcon,
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  Trash2Icon,
  CheckIcon,
  GripVerticalIcon,
  TypeIcon,
  AlignLeftIcon,
  CheckSquareIcon,
  ListIcon,
  CalendarIcon,
  HashIcon,
  MinusIcon,
  PenToolIcon,
} from 'lucide-react'
import type { FormTemplate, FormField, FormFieldType } from '@/types'

const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string; icon: React.ReactNode }[] = [
  { value: 'short_text', label: 'Short Text', icon: <TypeIcon className="w-3.5 h-3.5" /> },
  { value: 'long_text', label: 'Long Text', icon: <AlignLeftIcon className="w-3.5 h-3.5" /> },
  { value: 'checkbox', label: 'Checkbox', icon: <CheckSquareIcon className="w-3.5 h-3.5" /> },
  { value: 'checkbox_group', label: 'Checkbox Group', icon: <CheckSquareIcon className="w-3.5 h-3.5" /> },
  { value: 'dropdown', label: 'Dropdown', icon: <ListIcon className="w-3.5 h-3.5" /> },
  { value: 'date', label: 'Date', icon: <CalendarIcon className="w-3.5 h-3.5" /> },
  { value: 'number', label: 'Number', icon: <HashIcon className="w-3.5 h-3.5" /> },
  { value: 'section_header', label: 'Section Header', icon: <MinusIcon className="w-3.5 h-3.5" /> },
  { value: 'signature', label: 'Signature', icon: <PenToolIcon className="w-3.5 h-3.5" /> },
]

const FIELD_TYPE_COLORS: Record<FormFieldType, string> = {
  short_text: 'bg-blue-50 text-blue-700 border-blue-200',
  long_text: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  checkbox: 'bg-green-50 text-green-700 border-green-200',
  checkbox_group: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dropdown: 'bg-purple-50 text-purple-700 border-purple-200',
  date: 'bg-amber-50 text-amber-700 border-amber-200',
  number: 'bg-orange-50 text-orange-700 border-orange-200',
  section_header: 'bg-gray-100 text-gray-600 border-gray-300',
  signature: 'bg-pink-50 text-pink-700 border-pink-200',
}

function generateId(): string {
  return crypto.randomUUID()
}

export default function FormManagementClient() {
  const router = useRouter()
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingFieldType, setAddingFieldType] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const selectedTemplate = templates.find((t) => t.form_key === selectedKey)

  const fetchTemplates = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('form_templates')
      .select('*')
      .order('form_name')
    setTemplates((data as FormTemplate[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // When selecting a form, load its fields
  useEffect(() => {
    if (selectedTemplate) {
      const sorted = [...selectedTemplate.fields].sort((a, b) => a.order - b.order)
      setFields(sorted)
    }
  }, [selectedTemplate])

  function selectForm(key: string) {
    setSelectedKey(key)
    setSaved(false)
    setDeleteConfirm(null)
    setAddingFieldType(false)
  }

  // --- Field operations ---

  function updateField(id: string, updates: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
    setSaved(false)
  }

  function moveField(id: string, direction: 'up' | 'down') {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id)
      if (idx < 0) return prev
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next.map((f, i) => ({ ...f, order: i + 1 }))
    })
    setSaved(false)
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id).map((f, i) => ({ ...f, order: i + 1 })))
    setDeleteConfirm(null)
    setSaved(false)
  }

  function addField(type: FormFieldType) {
    const newField: FormField = {
      id: generateId(),
      type,
      label: type === 'section_header' ? 'New Section' : 'New Field',
      placeholder: '',
      required: false,
      options: type === 'dropdown' || type === 'checkbox_group' ? ['Option 1'] : [],
      order: fields.length + 1,
    }
    setFields((prev) => [...prev, newField])
    setAddingFieldType(false)
    setSaved(false)
  }

  function addOption(fieldId: string) {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: [...f.options, `Option ${f.options.length + 1}`] }
          : f
      )
    )
    setSaved(false)
  }

  function updateOption(fieldId: string, optIdx: number, value: string) {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: f.options.map((o, i) => (i === optIdx ? value : o)) }
          : f
      )
    )
    setSaved(false)
  }

  function removeOption(fieldId: string, optIdx: number) {
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId
          ? { ...f, options: f.options.filter((_, i) => i !== optIdx) }
          : f
      )
    )
    setSaved(false)
  }

  // --- Save ---

  async function handleSave() {
    if (!selectedTemplate) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('form_templates')
      .update({ fields: fields as unknown as Record<string, unknown>[], updated_at: new Date().toISOString() })
      .eq('id', selectedTemplate.id)

    // Update local state
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === selectedTemplate.id ? { ...t, fields, updated_at: new Date().toISOString() } : t
      )
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push('/profile')}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <SlidersHorizontalIcon className="w-6 h-6 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Form Management</h1>
            <p className="text-sm text-gray-500">Customize form fields and layout for each app form.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left Panel — Form List */}
            <div className="w-full md:w-64 flex-shrink-0">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Forms</h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {templates.map((t) => (
                    <button
                      key={t.form_key}
                      onClick={() => selectForm(t.form_key)}
                      className={`w-full text-left px-4 py-3 text-sm font-medium transition ${
                        selectedKey === t.form_key
                          ? 'bg-amber-50 text-amber-700 border-l-2 border-amber-500'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {t.form_name}
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {t.fields.length} field{t.fields.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Panel — Field Editor */}
            <div className="flex-1 min-w-0">
              {!selectedTemplate ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <SlidersHorizontalIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Select a form from the left to edit its fields</p>
                  <p className="text-sm text-gray-400 mt-1">You can add, remove, and reorder fields for each form.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Form Header */}
                  <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{selectedTemplate.form_name}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fields.length} field{fields.length !== 1 ? 's' : ''} &middot; Last updated{' '}
                        {new Date(selectedTemplate.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={handleSave}
                      disabled={saving || saved}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition"
                    >
                      {saved ? (
                        <>
                          <CheckIcon className="w-4 h-4" />
                          Saved
                        </>
                      ) : saving ? (
                        'Saving...'
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>

                  {/* Field List */}
                  <div className="divide-y divide-gray-100">
                    {fields.map((field, idx) => (
                      <div
                        key={field.id}
                        className={`px-5 py-3 ${field.type === 'section_header' ? 'bg-gray-50' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Grip handle */}
                          <div className="flex flex-col gap-0.5 flex-shrink-0">
                            <button
                              onClick={() => moveField(field.id, 'up')}
                              disabled={idx === 0}
                              className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30 transition"
                            >
                              <ChevronUpIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveField(field.id, 'down')}
                              disabled={idx === fields.length - 1}
                              className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30 transition"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Drag icon */}
                          <GripVerticalIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />

                          {/* Type badge */}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium flex-shrink-0 ${FIELD_TYPE_COLORS[field.type]}`}
                          >
                            {FIELD_TYPE_OPTIONS.find((o) => o.value === field.type)?.icon}
                            {FIELD_TYPE_OPTIONS.find((o) => o.value === field.type)?.label}
                          </span>

                          {/* Label input */}
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => updateField(field.id, { label: e.target.value })}
                            className={`flex-1 min-w-0 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition ${
                              field.type === 'section_header' ? 'font-semibold' : ''
                            }`}
                          />

                          {/* Placeholder input (not for section headers) */}
                          {field.type !== 'section_header' && field.type !== 'signature' && (
                            <input
                              type="text"
                              value={field.placeholder}
                              onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                              placeholder="Placeholder..."
                              className="hidden lg:block w-40 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-400 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                            />
                          )}

                          {/* Required toggle (not for section headers) */}
                          {field.type !== 'section_header' && (
                            <button
                              onClick={() => updateField(field.id, { required: !field.required })}
                              className={`flex-shrink-0 px-2 py-1 rounded border text-[11px] font-medium transition ${
                                field.required
                                  ? 'bg-red-50 text-red-600 border-red-200'
                                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-600'
                              }`}
                            >
                              {field.required ? 'Required' : 'Optional'}
                            </button>
                          )}

                          {/* Delete button */}
                          {deleteConfirm === field.id ? (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => removeField(field.id)}
                                className="px-2 py-1 rounded bg-red-500 text-white text-[11px] font-medium hover:bg-red-600 transition"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-2 py-1 rounded border border-gray-200 text-gray-500 text-[11px] font-medium hover:bg-gray-50 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(field.id)}
                              className="flex-shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition"
                            >
                              <Trash2Icon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Options editor for dropdown and checkbox_group */}
                        {(field.type === 'dropdown' || field.type === 'checkbox_group') && (
                          <div className="mt-2 ml-[72px] space-y-1.5">
                            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Options</p>
                            {field.options.map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => updateOption(field.id, optIdx, e.target.value)}
                                  className="flex-1 border border-gray-200 rounded-md px-2.5 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                                />
                                <button
                                  onClick={() => removeOption(field.id, optIdx)}
                                  disabled={field.options.length <= 1}
                                  className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-30 transition"
                                >
                                  <Trash2Icon className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => addOption(field.id)}
                              className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium transition"
                            >
                              <PlusIcon className="w-3 h-3" />
                              Add option
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Field Button */}
                  <div className="px-5 py-4 border-t border-gray-200">
                    {addingFieldType ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select field type</p>
                        <div className="flex flex-wrap gap-2">
                          {FIELD_TYPE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => addField(opt.value)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition hover:opacity-80 ${FIELD_TYPE_COLORS[opt.value]}`}
                            >
                              {opt.icon}
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setAddingFieldType(false)}
                          className="text-xs text-gray-400 hover:text-gray-600 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingFieldType(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 border border-dashed border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-600 rounded-lg text-sm font-medium transition"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Add Field
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
