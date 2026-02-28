'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon } from 'lucide-react'
import Image from 'next/image'
import { ReceiptContent, ReceiptCategory } from '@/types'

interface EditReceiptModalProps {
  postId: string
  initialContent: ReceiptContent
  onClose: () => void
  onUpdated: () => void
}

const RECEIPT_CATEGORIES: ReceiptCategory[] = ['Materials', 'Fuel', 'Tools', 'Equipment Rental', 'Subcontractor', 'Office Supplies', 'Other']

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function EditReceiptModal({
  postId,
  initialContent,
  onClose,
  onUpdated,
}: EditReceiptModalProps) {
  const supabase = createClient()

  const [vendorName, setVendorName] = useState(initialContent.vendor_name ?? '')
  const [receiptDate, setReceiptDate] = useState(initialContent.receipt_date ?? '')
  const [totalAmount, setTotalAmount] = useState(String(initialContent.total_amount ?? ''))
  const [category, setCategory] = useState<ReceiptCategory | ''>(initialContent.category ?? '')

  // Photo: existing path, new file
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

  function removeExisting() {
    setRemovedPhoto(true)
  }

  function removeNew() {
    setNewPhotoFile(null)
    setNewPhotoPreview(null)
  }

  async function handleSubmit() {
    const amount = totalAmount.trim() ? parseFloat(totalAmount) : 0
    if (totalAmount.trim() && (isNaN(amount) || amount < 0)) { setError('Please enter a valid amount'); return }

    setLoading(true)
    setError(null)

    try {
      // Delete removed photo from storage
      if (removedPhoto && existingPhoto) {
        await supabase.storage.from('post-photos').remove([existingPhoto])
      }

      // Upload new photo if provided
      let finalPhotoPath = existingPhoto && !removedPhoto ? existingPhoto : ''
      if (newPhotoFile) {
        const ext = newPhotoFile.name.split('.').pop()
        const path = `receipts/${postId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, newPhotoFile)
        if (uploadErr) throw uploadErr
        finalPhotoPath = path
      }

      const updatedContent: ReceiptContent = {
        receipt_photo: finalPhotoPath,
        vendor_name: vendorName.trim(),
        receipt_date: receiptDate,
        total_amount: amount,
        category,
      }

      const { error: updateErr } = await supabase
        .from('feed_posts')
        .update({ content: updatedContent })
        .eq('id', postId)

      if (updateErr) throw updateErr
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Edit Expense</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Photo section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Receipt Photo <span className="normal-case font-medium">(optional)</span></p>

            {existingPhotoUrl && !removedPhoto && !newPhotoPreview && (
              <div className="relative group inline-block">
                <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100">
                  <Image src={existingPhotoUrl} alt="Receipt photo" fill className="object-cover" sizes="128px" />
                </div>
                <button
                  type="button"
                  onClick={removeExisting}
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
                  onClick={removeNew}
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

          {/* Details section */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Receipt Details</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Vendor / Store Name</label>
                <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date on Receipt</label>
                  <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Total Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ReceiptCategory | '')}
                  className={inputCls}
                >
                  <option value="">Select a category...</option>
                  {RECEIPT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
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
  )
}
