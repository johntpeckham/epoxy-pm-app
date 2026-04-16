'use client'

import { useState } from 'react'
import { XIcon, AlertTriangleIcon, Loader2Icon, HashIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import type { EstimatingProject } from './types'

interface ProjectNumberOverrideModalProps {
  project: EstimatingProject
  onClose: () => void
  onUpdated: (patch: Partial<EstimatingProject>) => void
}

type Step = 'input' | 'confirm'

export default function ProjectNumberOverrideModal({
  project,
  onClose,
  onUpdated,
}: ProjectNumberOverrideModalProps) {
  const [value, setValue] = useState(project.project_number ?? '')
  const [step, setStep] = useState<Step>('input')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = value.trim()
  const changed = trimmed !== (project.project_number ?? '')

  function handleNext() {
    setError(null)
    if (!trimmed) {
      setError('Project number cannot be empty.')
      return
    }
    if (!changed) {
      onClose()
      return
    }
    setStep('confirm')
  }

  async function applyUpdate(cascade: boolean) {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const oldNumber = project.project_number
    const newNumber = trimmed

    try {
      const { error: updErr } = await supabase
        .from('estimating_projects')
        .update({ project_number: newNumber })
        .eq('id', project.id)
      if (updErr) throw updErr

      if (cascade && oldNumber) {
        // Update linked estimates by current estimate_number matching old project number
        const numericOld = parseInt(oldNumber.replace(/\D/g, ''), 10)
        const numericNew = parseInt(newNumber.replace(/\D/g, ''), 10)
        if (!Number.isNaN(numericOld) && !Number.isNaN(numericNew)) {
          await supabase
            .from('estimates')
            .update({ estimate_number: numericNew })
            .eq('customer_id', project.customer_id)
            .eq('estimate_number', numericOld)

          await supabase
            .from('projects')
            .update({ estimate_number: String(numericNew) })
            .eq('estimate_number', String(numericOld))

          await supabase
            .from('invoices')
            .update({ invoice_number: String(numericNew) })
            .eq('invoice_number', String(numericOld))
        }
      }

      onUpdated({ project_number: newNumber })
    } catch (err) {
      console.error('[ProjectNumberOverrideModal] update failed:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to update project number.'
      )
      setSaving(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-auto bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <HashIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-gray-900">
                {step === 'input' ? 'Edit project number' : 'Apply change'}
              </h3>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {step === 'input' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                  <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Changing the project number may affect linked estimates, jobs,
                    and invoices. Proceed with caution.
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Project number
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="e.g. 1006-P"
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                    {error}
                  </div>
                )}
              </div>
              <div
                className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition"
                >
                  Update
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
                <p className="text-sm text-gray-700">
                  How should linked records be handled?
                </p>
                <p className="text-sm text-gray-500">
                  Project number:{' '}
                  <span className="text-gray-400 line-through">
                    {project.project_number ?? 'none'}
                  </span>{' '}
                  <span className="text-amber-700 font-semibold">{trimmed}</span>
                </p>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                    {error}
                  </div>
                )}
              </div>
              <div
                className="flex-none flex flex-col gap-2 p-4 border-t border-gray-200"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
              >
                <button
                  type="button"
                  onClick={() => applyUpdate(true)}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
                >
                  {saving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : null}
                  Update all linked items
                </button>
                <button
                  type="button"
                  onClick={() => applyUpdate(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
                >
                  Update only this project
                </button>
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition disabled:opacity-60"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}
