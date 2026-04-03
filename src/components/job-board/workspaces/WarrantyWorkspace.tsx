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
  DownloadIcon,
  EyeIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  Loader2Icon,
  FileTextIcon,
  UserIcon,
} from 'lucide-react'

interface Props {
  project: Project
  userId: string
  onBack: () => void
}

type Step = 'list' | 'select_template' | 'edit_text' | 'signature' | 'attach_mfg' | 'generating'

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
  const [signatureName, setSignatureName] = useState('')
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
    setSignatureName('')
    setSelectedMfgIds([])
    fetchTemplatesAndMfg()
    setStep('select_template')
  }

  function selectTemplate(template: WarrantyTemplate) {
    setSelectedTemplate(template)
    setEditedBody(applyMergeFields(template.body_text, template))
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
        signatureName || null,
        companySettings?.logo_url
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
        signature_name: signatureName || null,
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
          companySettings?.logo_url
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
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Review & Edit Warranty Text</h3>
              <p className="text-xs text-gray-400 mb-3">Merge fields have been filled with project data. Edit as needed.</p>
              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                rows={16}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y font-mono"
              />
              <div className="flex items-center gap-2 justify-end mt-4">
                <button
                  onClick={() => setStep('select_template')}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep('signature')}
                  disabled={!editedBody.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
                >
                  Next: Signature
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'signature' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Signature</h3>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type your name for signature</label>
                <input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="e.g., John Peckham"
                />
              </div>
              {signatureName && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-400 mb-2">Preview:</p>
                  <div className="border-b border-gray-400 w-48 mb-1" />
                  <p
                    className="text-2xl text-gray-900"
                    style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontStyle: 'italic' }}
                  >
                    {signatureName}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{signatureName}</p>
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
                  onClick={() => setStep('attach_mfg')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
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
                  onClick={() => setStep('signature')}
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
                className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition"
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
                  onClick={() => previewWarranty(w)}
                  className="p-2 text-gray-400 hover:text-amber-600 transition"
                  title="Preview"
                >
                  <EyeIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeletingWarranty(w)}
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
