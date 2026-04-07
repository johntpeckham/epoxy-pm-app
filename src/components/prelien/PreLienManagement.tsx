'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PreLienTemplate } from '@/types'
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  FileTextIcon,
  Loader2Icon,
  ArrowLeftIcon,
  CopyIcon,
  ScrollTextIcon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import PreLienTemplateEditor from './PreLienTemplateEditor'

interface Props {
  onClose: () => void
}

export default function PreLienManagement({ onClose }: Props) {
  const supabase = createClient()

  const [templates, setTemplates] = useState<PreLienTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<PreLienTemplate | null>(null)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [deletingTemplate, setDeletingTemplate] = useState<PreLienTemplate | null>(null)
  const [duplicatingTemplate, setDuplicatingTemplate] = useState<PreLienTemplate | null>(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    setLoadingTemplates(true)
    const { data } = await supabase
      .from('prelien_templates')
      .select('*')
      .order('created_at', { ascending: false })
    setTemplates((data as PreLienTemplate[]) ?? [])
    setLoadingTemplates(false)
  }

  function openTemplateEditor(template?: PreLienTemplate) {
    setEditingTemplate(template ?? null)
    setShowTemplateEditor(true)
  }

  function closeTemplateEditor() {
    setShowTemplateEditor(false)
    setEditingTemplate(null)
  }

  async function saveTemplate(data: { name: string; description: string; body: string }) {
    const payload = {
      name: data.name,
      description: data.description || null,
      body: data.body,
      updated_at: new Date().toISOString(),
    }
    if (editingTemplate) {
      await supabase.from('prelien_templates').update(payload).eq('id', editingTemplate.id)
    } else {
      await supabase.from('prelien_templates').insert(payload)
    }
    closeTemplateEditor()
    fetchTemplates()
  }

  async function deleteTemplate() {
    if (!deletingTemplate) return
    await supabase.from('prelien_templates').delete().eq('id', deletingTemplate.id)
    setDeletingTemplate(null)
    fetchTemplates()
  }

  async function duplicateTemplate() {
    if (!duplicatingTemplate) return
    await supabase.from('prelien_templates').insert({
      name: `${duplicatingTemplate.name} (Copy)`,
      description: duplicatingTemplate.description,
      body: duplicatingTemplate.body,
    })
    setDuplicatingTemplate(null)
    fetchTemplates()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-3xl relative">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <ScrollTextIcon className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-gray-900 flex-1">Pre-Lien Management</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
              <button
                onClick={() => openTemplateEditor()}
                className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition"
              >
                <PlusIcon className="w-4 h-4" />
                New Template
              </button>
            </div>

            {loadingTemplates ? (
              <div className="flex justify-center py-8">
                <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No pre-lien templates yet</p>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    <FileTextIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                      {t.description && (
                        <p className="text-xs text-gray-400 truncate">{t.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => openTemplateEditor(t)}
                      className="p-1.5 text-gray-400 hover:text-amber-600 transition"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDuplicatingTemplate(t)}
                      className="p-1.5 text-gray-400 hover:text-amber-600 transition"
                      title="Duplicate"
                    >
                      <CopyIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingTemplate(t)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition"
                      title="Delete"
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <PreLienTemplateEditor
          template={editingTemplate}
          onSave={saveTemplate}
          onCancel={closeTemplateEditor}
        />
      )}

      {/* Confirm dialogs */}
      {deletingTemplate && (
        <ConfirmDialog
          title="Delete Template"
          message={`Are you sure you want to delete "${deletingTemplate.name}"?`}
          onConfirm={deleteTemplate}
          onCancel={() => setDeletingTemplate(null)}
        />
      )}
      {duplicatingTemplate && (
        <ConfirmDialog
          title="Duplicate Template"
          message={`Are you sure you want to duplicate "${duplicatingTemplate.name}"?`}
          onConfirm={duplicateTemplate}
          onCancel={() => setDuplicatingTemplate(null)}
        />
      )}
    </div>
  )
}
