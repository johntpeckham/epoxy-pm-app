'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, ProjectPreLien } from '@/types'
import WorkspaceShell from '../WorkspaceShell'
import ReportPreviewModal, { PdfPreviewData } from '@/components/ui/ReportPreviewModal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  ScrollTextIcon,
  PlusIcon,
  Trash2Icon,
  Loader2Icon,
  FileTextIcon,
} from 'lucide-react'

interface Props {
  project: Project
  userId: string
  onBack: () => void
}

export default function PreLienWorkspace({ project, userId, onBack }: Props) {
  const supabase = createClient()

  const [preliens, setPreliens] = useState<ProjectPreLien[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingPreLien, setDeletingPreLien] = useState<ProjectPreLien | null>(null)
  const [showNewPlaceholder, setShowNewPlaceholder] = useState(false)

  // Preview state
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

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

  async function previewPreLien(prelien: ProjectPreLien) {
    if (prelien.pdf_url) {
      setPreviewLoading(true)
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

  return (
    <WorkspaceShell
      title="Pre-Lien Notice"
      icon={<ScrollTextIcon className="w-5 h-5" />}
      onBack={onBack}
      actions={
        <button
          onClick={() => setShowNewPlaceholder(true)}
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
              onClick={() => setShowNewPlaceholder(true)}
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
                  onClick={(e) => { e.stopPropagation(); setDeletingPreLien(p) }}
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

      {/* Phase 2 placeholder */}
      {showNewPlaceholder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-8 max-w-sm mx-4 text-center">
            <ScrollTextIcon className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">Coming Soon</h3>
            <p className="text-sm text-gray-500 mb-4">
              Pre-lien notice generation coming in Phase 2. Templates can be configured now in Settings.
            </p>
            <button
              onClick={() => setShowNewPlaceholder(false)}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-semibold transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
