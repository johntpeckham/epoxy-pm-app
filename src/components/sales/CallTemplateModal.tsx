'use client'

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'

export type CallTemplateType =
  | 'call_script'
  | 'voicemail_script'
  | 'email_template'
  | 'text_template'

export const TEMPLATE_TYPE_LABELS: Record<CallTemplateType, string> = {
  call_script: 'Call script',
  voicemail_script: 'Voicemail script',
  email_template: 'Email template',
  text_template: 'Text template',
}

export interface CallTemplateRow {
  id: string
  name: string
  type: CallTemplateType
  content: string
}

interface CallTemplateModalProps {
  userId: string
  existing?: CallTemplateRow
  onClose: () => void
  onSaved: () => void
}

export default function CallTemplateModal({
  userId,
  existing,
  onClose,
  onSaved,
}: CallTemplateModalProps) {
  const isEdit = !!existing?.id
  const [name, setName] = useState(existing?.name ?? '')
  const [type, setType] = useState<CallTemplateType>(
    existing?.type ?? 'call_script'
  )
  const [content, setContent] = useState(existing?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim() || !content.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const payload = {
      name: name.trim(),
      type,
      content: content.trim(),
    }
    if (isEdit && existing?.id) {
      const { error: err } = await supabase
        .from('crm_call_templates')
        .update(payload)
        .eq('id', existing.id)
      setSaving(false)
      if (err) {
        setError(err.message)
        return
      }
    } else {
      const { error: err } = await supabase
        .from('crm_call_templates')
        .insert({ ...payload, created_by: userId })
      setSaving(false)
      if (err) {
        setError(err.message)
        return
      }
    }
    onSaved()
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500'

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">
              {isEdit ? 'Edit Template' : 'New Template'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Cold call opener"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CallTemplateType)}
                className={inputClass}
              >
                {(Object.keys(TEMPLATE_TYPE_LABELS) as CallTemplateType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {TEMPLATE_TYPE_LABELS[t]}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Content *
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={10}
                className={`${inputClass} font-mono text-[13px] leading-relaxed`}
                placeholder={`Hi, this is [name] from Peckham Coatings...`}
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div
            className="flex-none flex justify-end gap-2 px-5 py-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || !content.trim() || saving}
              className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
