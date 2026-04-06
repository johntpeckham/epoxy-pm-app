'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WarrantyTemplate, ManufacturerWarranty } from '@/types'
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  UploadIcon,
  FileTextIcon,
  ExternalLinkIcon,
  Loader2Icon,
  ShieldCheckIcon,
  ArrowLeftIcon,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import WarrantyTemplateEditor from './WarrantyTemplateEditor'

interface Props {
  onClose: () => void
}

export default function WarrantyManagement({ onClose }: Props) {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'templates' | 'manufacturer'>('templates')

  // Templates state
  const [templates, setTemplates] = useState<WarrantyTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<WarrantyTemplate | null>(null)
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [deletingTemplate, setDeletingTemplate] = useState<WarrantyTemplate | null>(null)

  // Manufacturer state
  const [mfgWarranties, setMfgWarranties] = useState<ManufacturerWarranty[]>([])
  const [loadingMfg, setLoadingMfg] = useState(true)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingMfg, setDeletingMfg] = useState<ManufacturerWarranty | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Fetch templates
  useEffect(() => {
    fetchTemplates()
    fetchMfgWarranties()
  }, [])

  async function fetchTemplates() {
    setLoadingTemplates(true)
    const { data } = await supabase
      .from('warranty_templates')
      .select('*')
      .order('created_at', { ascending: false })
    setTemplates((data as WarrantyTemplate[]) ?? [])
    setLoadingTemplates(false)
  }

  async function fetchMfgWarranties() {
    setLoadingMfg(true)
    const { data } = await supabase
      .from('manufacturer_warranties')
      .select('*')
      .order('created_at', { ascending: false })
    setMfgWarranties((data as ManufacturerWarranty[]) ?? [])
    setLoadingMfg(false)
  }

  function openTemplateEditor(template?: WarrantyTemplate) {
    setEditingTemplate(template ?? null)
    setShowTemplateEditor(true)
  }

  function closeTemplateEditor() {
    setShowTemplateEditor(false)
    setEditingTemplate(null)
  }

  async function saveTemplate(data: { name: string; description: string; duration: string; body: string }) {
    const payload = {
      name: data.name,
      description: data.description || null,
      warranty_duration: data.duration || null,
      body_text: data.body,
      updated_at: new Date().toISOString(),
    }
    if (editingTemplate) {
      await supabase.from('warranty_templates').update(payload).eq('id', editingTemplate.id)
    } else {
      await supabase.from('warranty_templates').insert(payload)
    }
    closeTemplateEditor()
    fetchTemplates()
  }

  async function deleteTemplate() {
    if (!deletingTemplate) return
    await supabase.from('warranty_templates').delete().eq('id', deletingTemplate.id)
    setDeletingTemplate(null)
    fetchTemplates()
  }

  // Manufacturer warranty uploads
  async function handleUpload() {
    if (!uploadName.trim() || !uploadFile) return
    setUploading(true)
    const ext = uploadFile.name.split('.').pop()
    const path = `manufacturer-warranties/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('project-documents').upload(path, uploadFile)
    if (uploadErr) {
      console.error('Upload failed:', uploadErr)
      setUploading(false)
      return
    }
    const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(path)
    await supabase.from('manufacturer_warranties').insert({
      name: uploadName.trim(),
      file_url: urlData.publicUrl,
      file_size: uploadFile.size,
    })
    setUploading(false)
    setShowUploadForm(false)
    setUploadName('')
    setUploadFile(null)
    fetchMfgWarranties()
  }

  async function deleteMfg() {
    if (!deletingMfg) return
    await supabase.from('manufacturer_warranties').delete().eq('id', deletingMfg.id)
    setDeletingMfg(null)
    fetchMfgWarranties()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-3xl relative">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <ShieldCheckIcon className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-gray-900 flex-1">Warranty Management</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === 'templates'
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Warranty Templates
          </button>
          <button
            onClick={() => setActiveTab('manufacturer')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === 'manufacturer'
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Manufacturer Warranties
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {activeTab === 'templates' && (
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
                <p className="text-sm text-gray-400 text-center py-8">No warranty templates yet</p>
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
                        <p className="text-xs text-gray-400 truncate">
                          {t.warranty_duration && <span className="mr-2">{t.warranty_duration}</span>}
                          {t.description}
                        </p>
                      </div>
                      <button
                        onClick={() => openTemplateEditor(t)}
                        className="p-1.5 text-gray-400 hover:text-amber-600 transition"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingTemplate(t)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'manufacturer' && (
            <>
              {showUploadForm ? (
                /* ── Upload Form ── */
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700">Upload Manufacturer Warranty</h3>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name / Label *</label>
                    <input
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="e.g., GAF 15-Year Roofing Warranty"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">PDF File *</label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                      className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
                    />
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => { setShowUploadForm(false); setUploadName(''); setUploadFile(null) }}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpload}
                      disabled={uploading || !uploadName.trim() || !uploadFile}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
                    >
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Manufacturer List ── */
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-gray-500">{mfgWarranties.length} file{mfgWarranties.length !== 1 ? 's' : ''}</p>
                    <button
                      onClick={() => setShowUploadForm(true)}
                      className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition"
                    >
                      <UploadIcon className="w-4 h-4" />
                      Upload
                    </button>
                  </div>

                  {loadingMfg ? (
                    <div className="flex justify-center py-8">
                      <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
                    </div>
                  ) : mfgWarranties.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No manufacturer warranties uploaded</p>
                  ) : (
                    <div className="space-y-2">
                      {mfgWarranties.map((mw) => (
                        <div
                          key={mw.id}
                          className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                        >
                          <FileTextIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{mw.name}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(mw.created_at).toLocaleDateString()}
                              {mw.file_size ? ` — ${(mw.file_size / 1024 / 1024).toFixed(1)} MB` : ''}
                            </p>
                          </div>
                          <a
                            href={mw.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-amber-600 transition"
                          >
                            <ExternalLinkIcon className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => setDeletingMfg(mw)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition"
                          >
                            <Trash2Icon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <WarrantyTemplateEditor
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
      {deletingMfg && (
        <ConfirmDialog
          title="Delete Manufacturer Warranty"
          message={`Are you sure you want to delete "${deletingMfg.name}"?`}
          onConfirm={deleteMfg}
          onCancel={() => setDeletingMfg(null)}
        />
      )}
    </div>
  )
}
