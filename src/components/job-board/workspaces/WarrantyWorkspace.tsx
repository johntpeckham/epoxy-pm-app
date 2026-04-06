'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { useUserRole } from '@/lib/useUserRole'
import { Project, WarrantyTemplate, ManufacturerWarranty, ProjectWarranty } from '@/types'
import WorkspaceShell from '../WorkspaceShell'
import ReportPreviewModal, { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  ShieldCheckIcon,
  PlusIcon,
  Trash2Icon,
  ArrowRightIcon,
  Loader2Icon,
  FileTextIcon,
} from 'lucide-react'

interface Props {
  project: Project
  userId: string
  onBack: () => void
}

type Step = 'list' | 'select_template' | 'edit_text' | 'attach_mfg' | 'generating'

/** Block type from the template editor */
interface TemplateBlock {
  id: string
  type: 'header' | 'sub_header' | 'body' | 'divider' | 'signature'
  content: string
  color: string
  signatureData?: string
  signatureName?: string
  signatureTitle?: string
}

/** Try parsing body_text as JSON blocks; returns null if not block format */
function parseBlocks(bodyText: string): TemplateBlock[] | null {
  try {
    const parsed = JSON.parse(bodyText)
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
      return parsed as TemplateBlock[]
    }
  } catch {
    // not JSON
  }
  return null
}

export default function WarrantyWorkspace({ project, userId, onBack }: Props) {
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()
  const { role } = useUserRole()
  const isAdmin = role === 'admin'

  // List state
  const [warranties, setWarranties] = useState<ProjectWarranty[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingWarranty, setDeletingWarranty] = useState<ProjectWarranty | null>(null)

  // Preview state
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Generation flow state
  const [step, setStep] = useState<Step>('list')
  const [templates, setTemplates] = useState<WarrantyTemplate[]>([])
  const [mfgWarranties, setMfgWarranties] = useState<ManufacturerWarranty[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<WarrantyTemplate | null>(null)
  const [editedBody, setEditedBody] = useState('')
  const [selectedMfgIds, setSelectedMfgIds] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchWarranties()
  }, [project.id])

  async function fetchWarranties() {
    setLoading(true)
    const { data } = await supabase
      .from('project_warranties')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    setWarranties((data as ProjectWarranty[]) ?? [])
    setLoading(false)
  }

  async function fetchTemplatesAndMfg() {
    const [templatesRes, mfgRes] = await Promise.all([
      supabase.from('warranty_templates').select('*').order('name'),
      supabase.from('manufacturer_warranties').select('*').order('name'),
    ])
    setTemplates((templatesRes.data as WarrantyTemplate[]) ?? [])
    setMfgWarranties((mfgRes.data as ManufacturerWarranty[]) ?? [])
  }

  // ── Merge fields ──────────────────────────────────────────────────────
  function applyMergeFields(text: string, template: WarrantyTemplate): string {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    return text
      .replace(/\{\{customer_name\}\}/g, project.client_name || '—')
      .replace(/\{\{project_name\}\}/g, project.name || '—')
      .replace(/\{\{estimate_number\}\}/g, project.estimate_number || '—')
      .replace(/\{\{address\}\}/g, project.address || '—')
      .replace(/\{\{date\}\}/g, today)
      .replace(/\{\{warranty_duration\}\}/g, template.warranty_duration || '—')
  }

  // ── Start new warranty flow ───────────────────────────────────────────
  function startNewWarranty() {
    setSelectedTemplate(null)
    setEditedBody('')
    setSelectedMfgIds([])
    fetchTemplatesAndMfg()
    setStep('select_template')
  }

  function selectTemplate(template: WarrantyTemplate) {
    setSelectedTemplate(template)
    // For block format: apply merge fields to body block content, keep JSON structure
    const blocks = parseBlocks(template.body_text)
    if (blocks) {
      const merged = blocks.map((b) =>
        b.type === 'body' ? { ...b, content: applyMergeFields(b.content, template) } : b
      )
      setEditedBody(JSON.stringify(merged))
    } else {
      setEditedBody(applyMergeFields(template.body_text, template))
    }
    setStep('edit_text')
  }

  // ── Generate PDF and save ─────────────────────────────────────────────
  async function generateAndSave() {
    if (!selectedTemplate || !editedBody.trim()) return
    setStep('generating')
    setGenerating(true)

    try {
      const { generateWarrantyPdf } = await import('@/lib/generateWarrantyPdf')
      const warrantyTitle = selectedTemplate.name
      const result = await generateWarrantyPdf(
        warrantyTitle,
        editedBody,
        null,
        companySettings?.logo_url,
        companySettings?.dba || companySettings?.legal_name
      )

      // Upload PDF to storage
      const path = `${project.id}/warranties/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
      const { error: uploadErr } = await supabase.storage
        .from('project-documents')
        .upload(path, result.blob)

      let pdfUrl: string | null = null
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(path)
        pdfUrl = urlData.publicUrl
      }

      // Save to database
      await supabase.from('project_warranties').insert({
        project_id: project.id,
        template_id: selectedTemplate.id,
        title: warrantyTitle,
        generated_content: editedBody,
        signature_name: null,
        manufacturer_warranty_ids: selectedMfgIds.length > 0 ? selectedMfgIds : null,
        pdf_url: pdfUrl,
        created_by: userId,
      })

      // Show preview
      setPdfPreview({ blob: result.blob, filename: result.filename, title: warrantyTitle })
      setShowPreview(true)
      setStep('list')
      fetchWarranties()
    } catch (err) {
      console.error('Failed to generate warranty:', err)
      setStep('attach_mfg')
    } finally {
      setGenerating(false)
    }
  }

  // ── Preview existing warranty ─────────────────────────────────────────
  async function previewWarranty(warranty: ProjectWarranty) {
    if (warranty.pdf_url) {
      // Fetch the existing PDF
      setPreviewLoading(true)
      setShowPreview(true)
      try {
        const res = await fetch(warranty.pdf_url)
        const blob = await res.blob()
        setPdfPreview({ blob, filename: `${warranty.title}.pdf`, title: warranty.title })
      } catch {
        setPreviewError('Failed to load PDF')
      }
      setPreviewLoading(false)
    } else {
      // Regenerate from saved content
      setPreviewLoading(true)
      setShowPreview(true)
      try {
        const { generateWarrantyPdf } = await import('@/lib/generateWarrantyPdf')
        const result = await generateWarrantyPdf(
          warranty.title,
          warranty.generated_content,
          warranty.signature_name,
          companySettings?.logo_url,
          companySettings?.dba || companySettings?.legal_name
        )
        setPdfPreview({ blob: result.blob, filename: result.filename, title: warranty.title })
      } catch {
        setPreviewError('Failed to generate preview')
      }
      setPreviewLoading(false)
    }
  }

  async function deleteWarranty() {
    if (!deletingWarranty) return
    await supabase.from('project_warranties').delete().eq('id', deletingWarranty.id)
    setDeletingWarranty(null)
    fetchWarranties()
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (step !== 'list') {
    return (
      <WorkspaceShell
        title="Project Warranty"
        icon={<ShieldCheckIcon className="w-5 h-5" />}
        onBack={() => setStep('list')}
      >
        <div className="p-4 max-w-3xl mx-auto">
          {step === 'select_template' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Select a Warranty Template</h3>
              {templates.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No templates available. Create one in Settings → Warranty Management.
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTemplate(t)}
                      className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-amber-300 hover:bg-amber-50/50 transition text-left"
                    >
                      <FileTextIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{t.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {t.warranty_duration && <span className="mr-2">{t.warranty_duration}</span>}
                          {t.description}
                        </p>
                      </div>
                      <ArrowRightIcon className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'edit_text' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Review Warranty Content</h3>
              <p className="text-xs text-gray-400 mb-3">Merge fields have been filled with project data. Review before generating.</p>
              {(() => {
                const blocks = parseBlocks(editedBody)
                if (blocks) {
                  // Block format preview
                  return (
                    <div className="w-full border border-gray-200 rounded-lg p-4 min-h-[300px] space-y-3 bg-white">
                      {blocks.map((block) => {
                        switch (block.type) {
                          case 'header':
                            return (
                              <div key={block.id} className="mt-3">
                                <h2 className="text-lg font-bold uppercase tracking-wide" style={{ color: block.color }}>
                                  {block.content || 'Section Title'}
                                </h2>
                                <div className="h-px mt-1" style={{ backgroundColor: block.color, opacity: 0.25 }} />
                              </div>
                            )
                          case 'sub_header':
                            return (
                              <h3 key={block.id} className="text-base font-bold mt-2" style={{ color: block.color }}>
                                {block.content || 'Sub Section'}
                              </h3>
                            )
                          case 'body':
                            return (
                              <p key={block.id} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: block.color }}>
                                {block.content}
                              </p>
                            )
                          case 'divider':
                            return (
                              <div key={block.id} className="my-3">
                                <div className="h-px w-full" style={{ backgroundColor: block.color }} />
                              </div>
                            )
                          case 'signature':
                            return (
                              <div key={block.id} className="mt-4 pt-2">
                                <div className="w-48 border-b border-gray-900 mb-2" />
                                {block.signatureData && (
                                  <img src={block.signatureData} alt="Signature" className="max-w-[200px] h-auto mb-2" />
                                )}
                                {block.signatureName && <p className="text-sm text-gray-900">{block.signatureName}</p>}
                                {block.signatureTitle && <p className="text-xs text-gray-500">{block.signatureTitle}</p>}
                              </div>
                            )
                          default:
                            return null
                        }
                      })}
                    </div>
                  )
                }
                // Legacy format: HTML or plain text
                if (/<[a-z][\s\S]*>/i.test(editedBody)) {
                  return (
                    <div className="w-full border border-gray-200 rounded-lg overflow-hidden">
                      <div
                        className="px-3 py-2 text-sm min-h-[300px] prose prose-sm max-w-none
                          [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2
                          [&_h2]:text-base [&_h2]:font-bold [&_h2]:mb-2
                          [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1"
                        dangerouslySetInnerHTML={{ __html: editedBody }}
                      />
                    </div>
                  )
                }
                return (
                  <textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    rows={16}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y font-mono"
                  />
                )
              })()}
              <div className="flex items-center gap-2 justify-end mt-4">
                <button
                  onClick={() => setStep('select_template')}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('attach_mfg')}
                  disabled={!editedBody.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
                >
                  Next: Attachments
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'attach_mfg' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Attach Manufacturer Warranties</h3>
              <p className="text-xs text-gray-400 mb-3">Optional — select manufacturer warranty PDFs to include with this warranty package.</p>
              {mfgWarranties.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No manufacturer warranties uploaded. You can add them in Settings.
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {mfgWarranties.map((mw) => (
                    <label
                      key={mw.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMfgIds.includes(mw.id)}
                        onChange={() => {
                          setSelectedMfgIds((prev) =>
                            prev.includes(mw.id)
                              ? prev.filter((id) => id !== mw.id)
                              : [...prev, mw.id]
                          )
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                      />
                      <FileTextIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-900 flex-1">{mw.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 justify-end mt-4">
                <button
                  onClick={() => setStep('edit_text')}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  onClick={generateAndSave}
                  disabled={generating}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
                >
                  {generating ? (
                    <>
                      <Loader2Icon className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Warranty'
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2Icon className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-sm text-gray-500 font-medium">Generating warranty PDF...</p>
            </div>
          )}
        </div>

        {showPreview && (
          <ReportPreviewModal
            pdfData={pdfPreview}
            loading={previewLoading}
            error={previewError}
            title="Warranty Preview"
            onClose={() => {
              setShowPreview(false)
              setPdfPreview(null)
              setPreviewError(null)
            }}
          />
        )}
      </WorkspaceShell>
    )
  }

  // ── Warranty List View ────────────────────────────────────────────────
  return (
    <WorkspaceShell
      title="Project Warranty"
      icon={<ShieldCheckIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <button
          onClick={startNewWarranty}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          New
        </button>
      }
    >
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : warranties.length === 0 ? (
          <div className="text-center py-12">
            <ShieldCheckIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No warranties generated yet</p>
            <button
              onClick={startNewWarranty}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              Create your first warranty
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {warranties.map((w) => (
              <div
                key={w.id}
                onClick={() => previewWarranty(w)}
                className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition cursor-pointer"
              >
                <ShieldCheckIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{w.title}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(w.created_at).toLocaleDateString()}
                    {w.signature_name && ` — Signed: ${w.signature_name}`}
                    {w.manufacturer_warranty_ids && w.manufacturer_warranty_ids.length > 0 && (
                      <span className="ml-2">
                        · {w.manufacturer_warranty_ids.length} attachment{w.manufacturer_warranty_ids.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeletingWarranty(w) }}
                  className="p-2 text-gray-400 hover:text-red-500 transition"
                  title="Delete"
                >
                  <Trash2Icon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showPreview && (
        <ReportPreviewModal
          pdfData={pdfPreview}
          loading={previewLoading}
          error={previewError}
          title="Warranty Preview"
          onClose={() => {
            setShowPreview(false)
            setPdfPreview(null)
            setPreviewError(null)
          }}
        />
      )}

      {deletingWarranty && (
        <ConfirmDialog
          title="Delete Warranty"
          message={`Are you sure you want to delete "${deletingWarranty.title}"?`}
          onConfirm={deleteWarranty}
          onCancel={() => setDeletingWarranty(null)}
        />
      )}
    </WorkspaceShell>
  )
}
