'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { XIcon, CameraIcon, LoaderIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'

interface NewSalesmanExpenseModalProps {
  userId: string
  onClose: () => void
  onCreated: () => void
}

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1'

export default function NewSalesmanExpenseModal({
  userId,
  onClose,
  onCreated,
}: NewSalesmanExpenseModalProps) {
  const today = new Date().toISOString().split('T')[0]

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!description.trim()) { setError('Please enter a description'); return }
    const parsedAmount = parseFloat(amount)
    if (!amount.trim() || isNaN(parsedAmount) || parsedAmount < 0) { setError('Please enter a valid amount'); return }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      let receiptPath: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split('.').pop()
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('salesman-receipts').upload(path, photoFile)
        if (uploadErr) throw uploadErr
        receiptPath = path
      }

      const { error: insertErr } = await supabase.from('salesman_expenses').insert({
        user_id: userId,
        description: description.trim(),
        amount: parsedAmount,
        date,
        receipt_url: receiptPath,
        notes: notes.trim() || null,
      })

      if (insertErr) throw insertErr
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create expense')
      setLoading(false)
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header" onClick={onClose}>
        <div className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
            <h2 className="text-lg font-semibold text-gray-900">New Expense</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
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

            <div>
              <label className={labelCls}>Description *</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this expense for?"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={`${inputCls} pl-7`}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                Receipt Photo <span className="normal-case font-medium">(optional)</span>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
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

            <div>
              <label className={labelCls}>Notes <span className="normal-case font-medium">(optional)</span></label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={3}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex-none flex gap-3 p-4 md:pb-6 border-t border-gray-200" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}>
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
                  Submitting...
                </>
              ) : (
                'Submit Expense'
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
