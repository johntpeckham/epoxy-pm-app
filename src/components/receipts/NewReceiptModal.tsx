'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon, LoaderIcon } from 'lucide-react'
import { Project, ReceiptCategory } from '@/types'

interface NewReceiptModalProps {
  projects: Project[]
  userId: string
  onClose: () => void
  onCreated: () => void
}

const RECEIPT_CATEGORIES: ReceiptCategory[] = ['Materials', 'Fuel', 'Tools', 'Equipment Rental', 'Subcontractor', 'Office Supplies', 'Other']

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function NewReceiptModal({
  projects,
  userId,
  onClose,
  onCreated,
}: NewReceiptModalProps) {
  const today = new Date().toISOString().split('T')[0]

  // Project selector
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '')

  // Receipt fields
  const [vendorName, setVendorName] = useState('')
  const [receiptDate, setReceiptDate] = useState(today)
  const [totalAmount, setTotalAmount] = useState('')
  const [category, setCategory] = useState<ReceiptCategory | ''>('')

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleProjectChange(id: string) {
    setSelectedProjectId(id)
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function removePhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  async function handleSubmit() {
    if (!selectedProjectId) { setError('Please select a project'); return }
    const amount = totalAmount.trim() ? parseFloat(totalAmount) : 0
    if (totalAmount.trim() && (isNaN(amount) || amount < 0)) { setError('Please enter a valid amount'); return }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Upload photo if provided
      let photoPath = ''
      if (photoFile) {
        const ext = photoFile.name.split('.').pop()
        const path = `${selectedProjectId}/receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('post-photos').upload(path, photoFile)
        if (uploadErr) throw uploadErr
        photoPath = path
      }

      const { error: insertErr } = await supabase.from('feed_posts').insert({
        project_id: selectedProjectId,
        user_id: userId,
        post_type: 'receipt',
        is_pinned: false,
        content: {
          receipt_photo: photoPath,
          vendor_name: vendorName.trim(),
          receipt_date: receiptDate,
          total_amount: amount,
          category,
        },
      })

      if (insertErr) throw insertErr
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create expense')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">New Expense</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Project Selector */}
          <div>
            <label className={labelCls}>Project *</label>
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className={inputCls}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Receipt Photo */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Receipt Photo <span className="normal-case font-medium">(optional)</span></p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
            {photoPreview ? (
              <div className="relative inline-block">
                <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition"
              >
                <CameraIcon className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-amber-600">Take photo or upload</span> receipt image
                </p>
              </div>
            )}
          </div>

          {/* Receipt Details */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Receipt Details</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Vendor / Store Name</label>
                <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. Home Depot, Shell, Sunbelt Rentals" className={inputCls} />
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
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <LoaderIcon className="w-4 h-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit Expense'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
