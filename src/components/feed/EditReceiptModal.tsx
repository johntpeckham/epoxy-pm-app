'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon, LoaderIcon } from 'lucide-react'
import Image from 'next/image'
import { ReceiptContent, FormField } from '@/types'
import { useFormTemplate } from '@/lib/useFormTemplate'
import { getContentKey, getKnownContentKeys, buildDynamicFields } from '@/lib/formFieldMaps'
import DynamicFormField from '@/components/ui/DynamicFormField'
import Portal from '@/components/ui/Portal'

interface EditReceiptModalProps {
  postId: string
  initialContent: ReceiptContent
  onClose: () => void
  onUpdated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

const FORM_KEY = 'expense'
const KNOWN_KEYS = getKnownContentKeys(FORM_KEY)

function isPhotoSectionField(field: FormField): boolean {
  return field.id === 'exp-01' || field.label === 'Receipt Photo'
}

function isTotalAmountField(field: FormField): boolean {
  return field.id === 'exp-05' || field.label === 'Total Amount'
}

export default function EditReceiptModal({
  postId,
  initialContent,
  onClose,
  onUpdated,
}: EditReceiptModalProps) {
  const supabase = createClient()
  const { fields: templateFields, loading: templateLoading } = useFormTemplate(FORM_KEY)

  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {
      vendor_name: initialContent.vendor_name ?? '',
      receipt_date: initialContent.receipt_date ?? '',
      total_amount: String(initialContent.total_amount ?? ''),
      category: initialContent.category ?? '',
    }
    const rawContent = initialContent as unknown as Record<string, unknown>
    for (const [key, val] of Object.entries(rawContent)) {
      if (!KNOWN_KEYS.has(key) && key !== 'receipt_photo' && typeof val === 'string') {
        v[key] = val
      }
    }
    return v
  })

  function updateValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  const [existingPhoto, setExistingPhoto] = useState<string | null>(initialContent.receipt_photo ?? null)
  const [removedPhoto, setRemovedPhoto] = useState(false)
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null)
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existingPhotoUrl = existingPhoto && !removedPhoto
    ? supabase.storage.from('post-photos').getPublicUrl(existingPhoto).data.publicUrl
    : null

  function handleNewPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNewPhotoFile(file)
    setNewPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  async function handleSubmit() {
    const amount = (values.total_amount ?? '').trim() ? parseFloat(values.total_amount) : 0
    if ((values.total_amount ?? '').trim() && (isNaN(amount) || amount < 0)) { setError('Please enter a valid amount'); return }

    setLoading(true)
    setError(null)

    try {
      if (removedPhoto && existingPhoto) {
        await supabase.storage.from('post-photos').remove([existingPhoto])
      }

      let finalPhotoPath = existingPhoto && !removedPhoto ? existingPhoto : ''
      if (newPhotoFile) {
        const ext = newPhotoFile.name.split('.').pop()
        const path = `receipts/${postId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, newPhotoFile)
        if (uploadErr) throw uploadErr
        finalPhotoPath = path
      }

      const content: Record<string, unknown> = {
        receipt_photo: finalPhotoPath,
        vendor_name: (values.vendor_name ?? '').trim(),
        receipt_date: values.receipt_date ?? '',
        total_amount: amount,
        category: values.category ?? '',
      }

      for (const [key, val] of Object.entries(values)) {
        if (!KNOWN_KEYS.has(key) && typeof val === 'string' && val.trim()) {
          content[key] = val.trim()
        }
      }

      const dynamicFields = buildDynamicFields(FORM_KEY, values, templateFields)

      const { error: updateErr } = await supabase
        .from('feed_posts')
        .update({ content, dynamic_fields: dynamicFields })
        .eq('id', postId)

      if (updateErr) throw updateErr
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setLoading(false)
    }
  }

  function renderPhotoSection() {
    return (
      <div key="receipt-photo-section">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Receipt Photo <span className="normal-case font-medium">(optional)</span></p>

        {existingPhotoUrl && !removedPhoto && !newPhotoPreview && (
          <div className="relative group inline-block">
            <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100">
              <Image src={existingPhotoUrl} alt="Receipt photo" fill className="object-cover" sizes="128px" />
            </div>
            <button
              type="button"
              onClick={() => setRemovedPhoto(true)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        )}

        {newPhotoPreview && (
          <div className="relative group inline-block">
            <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100 ring-2 ring-amber-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={newPhotoPreview} alt="" className="w-full h-full object-cover" />
            </div>
            <button
              type="button"
              onClick={() => { setNewPhotoFile(null); setNewPhotoPreview(null) }}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        )}

        {((removedPhoto && !newPhotoPreview) || (!existingPhotoUrl && !newPhotoPreview)) && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            <CameraIcon className="w-4 h-4" /> Upload receipt photo
          </button>
        )}

        {(existingPhotoUrl || newPhotoPreview) && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            <CameraIcon className="w-4 h-4" /> Replace photo
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleNewPhoto}
        />
      </div>
    )
  }

  function renderField(field: FormField) {
    if (isPhotoSectionField(field)) {
      return renderPhotoSection()
    }

    if (field.type === 'section_header') {
      return (
        <div key={field.id}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{field.label}</p>
        </div>
      )
    }

    const contentKey = getContentKey(FORM_KEY, field)

    if (isTotalAmountField(field)) {
      return (
        <div key={field.id}>
          <label className={labelCls}>
            {field.label}
            {field.required && <span className="text-red-400"> *</span>}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={values.total_amount ?? ''}
              onChange={(e) => updateValue('total_amount', e.target.value)}
              placeholder="0.00"
              className={`${inputCls} pl-7`}
            />
          </div>
        </div>
      )
    }

    return (
      <DynamicFormField
        key={field.id}
        field={field}
        value={values[contentKey] ?? ''}
        onChange={(v) => updateValue(contentKey, String(v))}
      />
    )
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
      <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center justify-between px-4 border-b" style={{ minHeight: '56px' }}>
          <h2 className="text-lg font-semibold text-gray-900">Edit Expense</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 min-h-0">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {templateLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <LoaderIcon className="w-3 h-3 animate-spin" />
              Loading form template...
            </div>
          )}

          {templateFields.map((field) => renderField(field))}
        </div>

        <div className="flex-none flex gap-3 p-4 md:pb-6 border-t" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition"
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}
