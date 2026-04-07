'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanySettings } from '@/lib/useCompanySettings'
import { Project, PreLienTemplate, ProjectPreLien } from '@/types'
import type { PreLienFormData } from '@/lib/generatePreLienPdf'
import WorkspaceShell from '../WorkspaceShell'
import ReportPreviewModal, { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  ScrollTextIcon,
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

type Step = 'list' | 'select_template' | 'fill_form' | 'generating'

const HIRING_PARTY_RELATIONSHIPS = [
  'Direct Contractor',
  'Subcontractor',
  'Property Owner',
] as const

function todayISODate() {
  const d = new Date()
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function emptyFormData(): PreLienFormData {
  return {
    owner_name: '',
    owner_address: '',
    direct_contractor_name: '',
    direct_contractor_address: '',
    construction_lender_name: '',
    construction_lender_address: '',
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    cslb_license: '',
    hiring_party_name: '',
    hiring_party_address: '',
    hiring_party_relationship: '',
    project_name: '',
    project_address: '',
    description_of_work: '',
    estimated_total_price: '',
    date: '',
    signature_name: '',
    signature_title: '',
  }
}

export default function PreLienWorkspace({ project, userId, onBack }: Props) {
  const supabase = createClient()
  const { settings: companySettings } = useCompanySettings()

  // List state
  const [preliens, setPreliens] = useState<ProjectPreLien[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingPreLien, setDeletingPreLien] = useState<ProjectPreLien | null>(null)

  // Preview state
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Generation flow state
  const [step, setStep] = useState<Step>('list')
  const [templates, setTemplates] = useState<PreLienTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<PreLienTemplate | null>(null)
  const [formData, setFormData] = useState<PreLienFormData>(emptyFormData())
  const [formError, setFormError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchPreLiens()
  }, [project.id])

  async function fetchPreLiens() {
    setLoading(true)
    const { data } = await supabase
      .from('project_preliens')
      .select('*')
      .eq('project_id', project.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    setPreliens((data as ProjectPreLien[]) ?? [])
    setLoading(false)
  }

  async function fetchTemplates() {
    setTemplatesLoading(true)
    const { data } = await supabase
      .from('prelien_templates')
      .select('*')
      .order('name')
    setTemplates((data as PreLienTemplate[]) ?? [])
    setTemplatesLoading(false)
  }

  function buildCslbLicenseString(): string {
    const licenses = companySettings?.cslb_licenses
    if (!licenses || licenses.length === 0) return ''
    return licenses
      .map((l) => `#${l.number}${l.classification ? ` (${l.classification})` : ''}`)
      .join(', ')
  }

  function startNewPreLien() {
    setSelectedTemplate(null)
    setFormError(null)
    fetchTemplates()
    setStep('select_template')
  }

  function selectTemplate(template: PreLienTemplate) {
    setSelectedTemplate(template)
    // Auto-populate Claimant + Project + Date
    setFormData({
      ...emptyFormData(),
      company_name: companySettings?.dba || companySettings?.legal_name || '',
      company_address: companySettings?.company_address || '',
      company_phone: companySettings?.phone || '',
      company_email: companySettings?.email || '',
      cslb_license: buildCslbLicenseString(),
      project_name: project.name || '',
      project_address: project.address || '',
      date: todayISODate(),
    })
    setFormError(null)
    setStep('fill_form')
  }

  function updateField<K extends keyof PreLienFormData>(key: K, value: PreLienFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  function validateForm(): string | null {
    const required: Array<[keyof PreLienFormData, string]> = [
      ['owner_name', 'Owner Name'],
      ['owner_address', 'Owner Address'],
      ['company_name', 'Claimant (Company) Name'],
      ['company_address', 'Claimant Address'],
      ['hiring_party_name', 'Hiring Party Name'],
      ['hiring_party_address', 'Hiring Party Address'],
      ['hiring_party_relationship', 'Hiring Party Relationship'],
      ['project_name', 'Project Name'],
      ['project_address', 'Project Address'],
      ['description_of_work', 'Description of Work'],
      ['estimated_total_price', 'Estimated Total Price'],
      ['date', 'Date'],
      ['signature_name', 'Signature Name'],
      ['signature_title', 'Signature Title'],
    ]
    for (const [key, label] of required) {
      if (!String(formData[key] ?? '').trim()) {
        return `${label} is required`
      }
    }
    return null
  }

  async function generateAndSave() {
    if (!selectedTemplate || !selectedTemplate.body) {
      setFormError('Template is missing a body')
      return
    }
    const err = validateForm()
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setStep('generating')
    setGenerating(true)

    try {
      const { generatePreLienPdf } = await import('@/lib/generatePreLienPdf')
      const result = await generatePreLienPdf(
        selectedTemplate.name,
        selectedTemplate.body,
        formData,
        companySettings?.logo_url,
        companySettings
          ? {
              dba: companySettings.dba,
              legal_name: companySettings.legal_name,
              company_address: companySettings.company_address,
              phone: companySettings.phone,
              email: companySettings.email,
              cslb_licenses: companySettings.cslb_licenses,
            }
          : null
      )

      // Upload PDF to storage
      const path = `${project.id}/preliens/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
      const { error: uploadErr } = await supabase.storage
        .from('project-documents')
        .upload(path, result.blob)

      let pdfUrl: string | null = null
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(path)
        pdfUrl = urlData.publicUrl
      }

      // Save to database
      await supabase.from('project_preliens').insert({
        project_id: project.id,
        template_id: selectedTemplate.id,
        template_name: selectedTemplate.name,
        form_data: formData as unknown as Record<string, unknown>,
        pdf_url: pdfUrl,
        created_by: userId,
      })

      setPdfPreview({
        blob: result.blob,
        filename: result.filename,
        title: selectedTemplate.name,
      })
      setShowPreview(true)
      setStep('list')
      fetchPreLiens()
    } catch (e) {
      console.error('Failed to generate pre-lien:', e)
      setFormError('Failed to generate pre-lien PDF')
      setStep('fill_form')
    } finally {
      setGenerating(false)
    }
  }

  async function previewPreLien(prelien: ProjectPreLien) {
    if (prelien.pdf_url) {
      setPreviewLoading(true)
      setPreviewError(null)
      setPdfPreview(null)
      setShowPreview(true)
      try {
        const res = await fetch(prelien.pdf_url)
        const blob = await res.blob()
        setPdfPreview({
          blob,
          filename: `${prelien.template_name || 'Pre-Lien Notice'}.pdf`,
          title: prelien.template_name || 'Pre-Lien Notice',
        })
      } catch {
        setPreviewError('Failed to load PDF')
      }
      setPreviewLoading(false)
    }
  }

  async function deletePreLien() {
    if (!deletingPreLien) return
    await supabase
      .from('project_preliens')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletingPreLien.id)
    setDeletingPreLien(null)
    fetchPreLiens()
  }

  // ── Render: non-list steps ────────────────────────────────────────────
  if (step !== 'list') {
    return (
      <WorkspaceShell
        title="Pre-Lien Notice"
        icon={<ScrollTextIcon className="w-5 h-5" />}
        onBack={() => setStep('list')}
      >
        <div className="p-4 max-w-3xl mx-auto">
          {step === 'select_template' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Select a Pre-Lien Template</h3>
              {templatesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2Icon className="w-6 h-6 text-amber-500 animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  No templates available. Create one in Settings → Pre-Lien Management.
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
                        {t.description && (
                          <p className="text-xs text-gray-500 truncate">{t.description}</p>
                        )}
                      </div>
                      <ArrowRightIcon className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'fill_form' && selectedTemplate && (
            <PreLienForm
              template={selectedTemplate}
              formData={formData}
              updateField={updateField}
              error={formError}
              onBack={() => setStep('select_template')}
              onGenerate={generateAndSave}
              generating={generating}
            />
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2Icon className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-sm text-gray-500 font-medium">Generating pre-lien notice PDF...</p>
            </div>
          )}
        </div>

        {showPreview && (
          <ReportPreviewModal
            pdfData={pdfPreview}
            loading={previewLoading}
            error={previewError}
            title="Pre-Lien Notice Preview"
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

  // ── Render: list view ─────────────────────────────────────────────────
  return (
    <WorkspaceShell
      title="Pre-Lien Notice"
      icon={<ScrollTextIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <button
          onClick={startNewPreLien}
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
        ) : preliens.length === 0 ? (
          <div className="text-center py-12">
            <ScrollTextIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No pre-lien notices generated yet</p>
            <button
              onClick={startNewPreLien}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              Create your first pre-lien notice
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {preliens.map((p) => (
              <div
                key={p.id}
                onClick={() => previewPreLien(p)}
                className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition cursor-pointer"
              >
                <ScrollTextIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.template_name || 'Pre-Lien Notice'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingPreLien(p)
                  }}
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
          title="Pre-Lien Notice Preview"
          onClose={() => {
            setShowPreview(false)
            setPdfPreview(null)
            setPreviewError(null)
          }}
        />
      )}

      {deletingPreLien && (
        <ConfirmDialog
          title="Delete Pre-Lien Notice"
          message={`Are you sure you want to delete "${deletingPreLien.template_name || 'this pre-lien notice'}"?`}
          onConfirm={deletePreLien}
          onCancel={() => setDeletingPreLien(null)}
        />
      )}
    </WorkspaceShell>
  )
}

// ─── Form component ────────────────────────────────────────────────────────
interface FormProps {
  template: PreLienTemplate
  formData: PreLienFormData
  updateField: <K extends keyof PreLienFormData>(key: K, value: PreLienFormData[K]) => void
  error: string | null
  onBack: () => void
  onGenerate: () => void
  generating: boolean
}

function PreLienForm({ template, formData, updateField, error, onBack, onGenerate, generating }: FormProps) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Fill In Pre-Lien Details</h3>
        <p className="text-xs text-gray-400">Using template: {template.name}</p>
      </div>

      <div className="space-y-6">
        {/* Owner */}
        <FormSection title="Owner (To)">
          <Field label="Owner Name" required>
            <input
              type="text"
              value={formData.owner_name}
              onChange={(e) => updateField('owner_name', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Owner Address" required>
            <textarea
              value={formData.owner_address}
              onChange={(e) => updateField('owner_address', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
        </FormSection>

        {/* Direct Contractor (Optional) */}
        <FormSection title="Direct Contractor (Optional)">
          <Field label="Name">
            <input
              type="text"
              value={formData.direct_contractor_name}
              onChange={(e) => updateField('direct_contractor_name', e.target.value)}
              className={inputCls}
              placeholder="Leave blank for N/A"
            />
          </Field>
          <Field label="Address">
            <textarea
              value={formData.direct_contractor_address}
              onChange={(e) => updateField('direct_contractor_address', e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="Leave blank for N/A"
            />
          </Field>
        </FormSection>

        {/* Construction Lender (Optional) */}
        <FormSection title="Construction Lender (Optional)">
          <Field label="Name">
            <input
              type="text"
              value={formData.construction_lender_name}
              onChange={(e) => updateField('construction_lender_name', e.target.value)}
              className={inputCls}
              placeholder="Leave blank for N/A"
            />
          </Field>
          <Field label="Address">
            <textarea
              value={formData.construction_lender_address}
              onChange={(e) => updateField('construction_lender_address', e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="Leave blank for N/A"
            />
          </Field>
        </FormSection>

        {/* Claimant */}
        <FormSection title="Claimant (From)" subtitle="Auto-populated from Company Settings">
          <Field label="Company Name" required>
            <input
              type="text"
              value={formData.company_name}
              onChange={(e) => updateField('company_name', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Company Address" required>
            <textarea
              value={formData.company_address}
              onChange={(e) => updateField('company_address', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input
                type="text"
                value={formData.company_phone}
                onChange={(e) => updateField('company_phone', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Email">
              <input
                type="text"
                value={formData.company_email}
                onChange={(e) => updateField('company_email', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="CSLB License">
            <input
              type="text"
              value={formData.cslb_license}
              onChange={(e) => updateField('cslb_license', e.target.value)}
              className={inputCls}
            />
          </Field>
        </FormSection>

        {/* Hiring Party */}
        <FormSection title="Hiring Party">
          <Field label="Name" required>
            <input
              type="text"
              value={formData.hiring_party_name}
              onChange={(e) => updateField('hiring_party_name', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Address" required>
            <textarea
              value={formData.hiring_party_address}
              onChange={(e) => updateField('hiring_party_address', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
          <Field label="Relationship" required>
            <select
              value={formData.hiring_party_relationship}
              onChange={(e) => updateField('hiring_party_relationship', e.target.value)}
              className={inputCls}
            >
              <option value="">Select relationship…</option>
              {HIRING_PARTY_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </FormSection>

        {/* Project */}
        <FormSection title="Project Information">
          <Field label="Project Name" required>
            <input
              type="text"
              value={formData.project_name}
              onChange={(e) => updateField('project_name', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Project Address" required>
            <textarea
              value={formData.project_address}
              onChange={(e) => updateField('project_address', e.target.value)}
              rows={2}
              className={inputCls}
            />
          </Field>
          <Field label="Description of Work" required>
            <textarea
              value={formData.description_of_work}
              onChange={(e) => updateField('description_of_work', e.target.value)}
              rows={3}
              className={inputCls}
            />
          </Field>
          <Field label="Estimated Total Price" required>
            <input
              type="text"
              value={formData.estimated_total_price}
              onChange={(e) => updateField('estimated_total_price', e.target.value)}
              placeholder="e.g. 25,000.00"
              className={inputCls}
            />
          </Field>
        </FormSection>

        {/* Date & Signature */}
        <FormSection title="Date & Signature">
          <Field label="Date" required>
            <input
              type="text"
              value={formData.date}
              onChange={(e) => updateField('date', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Signature Name" required>
            <input
              type="text"
              value={formData.signature_name}
              onChange={(e) => updateField('signature_name', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Signature Title" required>
            <input
              type="text"
              value={formData.signature_title}
              onChange={(e) => updateField('signature_title', e.target.value)}
              className={inputCls}
            />
          </Field>
        </FormSection>
      </div>

      {error && (
        <div className="mt-4 p-3 border border-red-200 bg-red-50 text-red-600 text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 justify-end mt-6">
        <button
          onClick={onBack}
          disabled={generating}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
        >
          {generating ? (
            <>
              <Loader2Icon className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            'Generate Pre-Lien Notice'
          )}
        </button>
      </div>
    </div>
  )
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y'

function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
