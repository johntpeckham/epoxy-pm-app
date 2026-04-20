'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  MoreVerticalIcon,
  BanknoteIcon,
  ImageIcon,
  UploadIcon,
  CameraIcon,
  Loader2Icon,
} from 'lucide-react'

interface CheckDeposit {
  id: string
  company_id: string | null
  name: string
  description: string | null
  status: string
  photo_url: string | null
  deposited_at: string | null
  filed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

type CheckStatus = 'not_deposited' | 'deposited' | 'filed_in_quickbooks'

const BUCKET = 'check-photos'

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/* ================================================================== */

export default function CheckDepositsCard({ userId }: { userId: string }) {
  const supabase = createClient()
  const [checks, setChecks] = useState<CheckDeposit[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCheck, setEditingCheck] = useState<CheckDeposit | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [depositedOpen, setDepositedOpen] = useState(true)
  const [filedOpen, setFiledOpen] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('check_deposits')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setChecks((data as CheckDeposit[]) ?? [])
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const notDeposited = useMemo(
    () => checks.filter((c) => c.status === 'not_deposited'),
    [checks]
  )
  const deposited = useMemo(
    () => checks.filter((c) => c.status === 'deposited'),
    [checks]
  )
  const filed = useMemo(
    () => checks.filter((c) => c.status === 'filed_in_quickbooks'),
    [checks]
  )

  /* ── CRUD ── */

  async function handleCreate(data: {
    name: string
    description: string
    photoUrl: string | null
  }) {
    const optimistic: CheckDeposit = {
      id: crypto.randomUUID(),
      company_id: null,
      name: data.name,
      description: data.description || null,
      status: 'not_deposited',
      photo_url: data.photoUrl,
      deposited_at: null,
      filed_at: null,
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setChecks((prev) => [optimistic, ...prev])
    setShowModal(false)
    setEditingCheck(null)
    const { data: inserted } = await supabase
      .from('check_deposits')
      .insert({
        name: data.name,
        description: data.description || null,
        photo_url: data.photoUrl,
        created_by: userId,
      })
      .select()
      .single()
    if (inserted)
      setChecks((prev) =>
        prev.map((c) => (c.id === optimistic.id ? (inserted as CheckDeposit) : c))
      )
  }

  async function handleUpdate(
    id: string,
    data: { name: string; description: string; photoUrl: string | null }
  ) {
    setChecks((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              name: data.name,
              description: data.description || null,
              photo_url: data.photoUrl,
              updated_at: new Date().toISOString(),
            }
          : c
      )
    )
    setShowModal(false)
    setEditingCheck(null)
    await supabase
      .from('check_deposits')
      .update({
        name: data.name,
        description: data.description || null,
        photo_url: data.photoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  }

  async function handleDelete(id: string) {
    const check = checks.find((c) => c.id === id)
    setChecks((prev) => prev.filter((c) => c.id !== id))
    setDeleteConfirmId(null)
    setMenuOpenId(null)
    await supabase.from('check_deposits').delete().eq('id', id)
    if (check?.photo_url) {
      const path = extractStoragePath(check.photo_url)
      if (path) await supabase.storage.from(BUCKET).remove([path])
    }
  }

  async function advanceToDeposited(check: CheckDeposit) {
    const now = new Date().toISOString()
    setChecks((prev) =>
      prev.map((c) =>
        c.id === check.id
          ? { ...c, status: 'deposited', deposited_at: now, updated_at: now }
          : c
      )
    )
    await supabase
      .from('check_deposits')
      .update({ status: 'deposited', deposited_at: now, updated_at: now })
      .eq('id', check.id)
  }

  async function revertToNotDeposited(check: CheckDeposit) {
    const now = new Date().toISOString()
    setChecks((prev) =>
      prev.map((c) =>
        c.id === check.id
          ? { ...c, status: 'not_deposited', deposited_at: null, updated_at: now }
          : c
      )
    )
    await supabase
      .from('check_deposits')
      .update({ status: 'not_deposited', deposited_at: null, updated_at: now })
      .eq('id', check.id)
  }

  async function advanceToFiled(check: CheckDeposit) {
    const now = new Date().toISOString()
    setChecks((prev) =>
      prev.map((c) =>
        c.id === check.id
          ? { ...c, status: 'filed_in_quickbooks', filed_at: now, updated_at: now }
          : c
      )
    )
    await supabase
      .from('check_deposits')
      .update({ status: 'filed_in_quickbooks', filed_at: now, updated_at: now })
      .eq('id', check.id)
  }

  async function revertToDeposited(check: CheckDeposit) {
    const now = new Date().toISOString()
    setChecks((prev) =>
      prev.map((c) =>
        c.id === check.id
          ? { ...c, status: 'deposited', filed_at: null, updated_at: now }
          : c
      )
    )
    await supabase
      .from('check_deposits')
      .update({ status: 'deposited', filed_at: null, updated_at: now })
      .eq('id', check.id)
  }

  function expandAll() {
    setDepositedOpen(true)
    setFiledOpen(true)
  }

  /* ── Render helpers ── */

  function renderCheckRow(check: CheckDeposit, section: CheckStatus) {
    const isMenuOpen = menuOpenId === check.id
    const opacity =
      section === 'filed_in_quickbooks'
        ? 'opacity-45'
        : section === 'deposited'
          ? 'opacity-70'
          : ''

    return (
      <div key={check.id} className={opacity}>
        <div className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors">
          {/* Thumbnail */}
          <div className="w-[44px] h-[44px] rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {check.photo_url ? (
              <Image
                src={check.photo_url}
                alt={check.name}
                width={44}
                height={44}
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-5 h-5 text-gray-300" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{check.name}</p>
            {check.description && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{check.description}</p>
            )}
            <p className="text-[11px] text-gray-400 mt-0.5">
              Added {fmtDate(check.created_at)}
            </p>

            {/* QuickBooks checkbox for deposited/filed sections */}
            {(section === 'deposited' || section === 'filed_in_quickbooks') && (
              <button
                onClick={() =>
                  section === 'deposited'
                    ? advanceToFiled(check)
                    : revertToDeposited(check)
                }
                className="flex items-center gap-1.5 mt-1.5"
              >
                <span
                  className={`inline-flex items-center justify-center w-[14px] h-[14px] rounded-[3px] border flex-shrink-0 transition-colors ${
                    section === 'filed_in_quickbooks'
                      ? 'bg-green-600 border-green-600'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {section === 'filed_in_quickbooks' && (
                    <svg
                      className="w-2.5 h-2.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={`text-[11px] ${
                    section === 'filed_in_quickbooks'
                      ? 'text-green-700 font-medium'
                      : 'text-gray-500'
                  }`}
                >
                  Added to QuickBooks
                </span>
              </button>
            )}
          </div>

          {/* Right side: badge + menu */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {section === 'not_deposited' && (
              <button
                onClick={() => advanceToDeposited(check)}
                className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors"
              >
                Not deposited
              </button>
            )}
            {(section === 'deposited' || section === 'filed_in_quickbooks') && (
              <button
                onClick={() =>
                  section === 'deposited' ? revertToNotDeposited(check) : undefined
                }
                className={`text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full ${
                  section === 'deposited'
                    ? 'hover:bg-green-200 cursor-pointer'
                    : 'cursor-default'
                } transition-colors`}
              >
                Deposited
              </button>
            )}

            {/* Three-dot menu */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpenId(isMenuOpen ? null : check.id)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors rounded"
              >
                <MoreVerticalIcon className="w-4 h-4" />
              </button>
              {isMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpenId(null)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px]">
                    <button
                      onClick={() => {
                        setEditingCheck(check)
                        setShowModal(true)
                        setMenuOpenId(null)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <PencilIcon className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => {
                        setDeleteConfirmId(check.id)
                        setMenuOpenId(null)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2Icon className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Loading ── */

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-orange-500">
            <BanknoteIcon className="w-5 h-5" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900">Check deposits</h3>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  /* ── Main render ── */

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 md:col-span-4 lg:col-span-2 transition-all hover:shadow-sm hover:border-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-orange-500">
          <BanknoteIcon className="w-5 h-5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1">Check deposits</h3>
        {notDeposited.length > 0 && (
          <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
            {notDeposited.length} pending
          </span>
        )}
        <button
          onClick={() => {
            setEditingCheck(null)
            setShowModal(true)
          }}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm flex-shrink-0"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add check
        </button>
      </div>

      {/* Scrollable content */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto -mx-4 px-4">
        {/* NOT DEPOSITED — always visible */}
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Not deposited
          </p>
          {notDeposited.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">No checks waiting for deposit.</p>
          ) : (
            <div className="space-y-1">{notDeposited.map((c) => renderCheckRow(c, 'not_deposited'))}</div>
          )}
        </div>

        {/* DEPOSITED — collapsible, default expanded */}
        <div>
          <button
            onClick={() => setDepositedOpen(!depositedOpen)}
            className="flex items-center gap-2 w-full text-left"
          >
            {depositedOpen ? (
              <ChevronDownIcon className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Deposited
            </span>
            {deposited.length > 0 && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                {deposited.length}
              </span>
            )}
          </button>
          {depositedOpen && (
            <div className="mt-2 space-y-1">
              {deposited.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 pl-6">No deposited checks.</p>
              ) : (
                deposited.map((c) => renderCheckRow(c, 'deposited'))
              )}
            </div>
          )}
        </div>

        {/* FILED IN QUICKBOOKS — collapsible, default collapsed */}
        <div>
          <button
            onClick={() => setFiledOpen(!filedOpen)}
            className="flex items-center gap-2 w-full text-left"
          >
            {filedOpen ? (
              <ChevronDownIcon className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Filed in QuickBooks
            </span>
            {filed.length > 0 && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-medium">
                {filed.length}
              </span>
            )}
          </button>
          {filedOpen && (
            <div className="mt-2 space-y-1">
              {filed.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 pl-6">No filed checks.</p>
              ) : (
                filed.map((c) => renderCheckRow(c, 'filed_in_quickbooks'))
              )}
            </div>
          )}
        </div>
      </div>

      {/* View all checks */}
      <div className="border-t border-gray-100 mt-4 pt-3 -mx-4 px-4">
        <button
          onClick={expandAll}
          className="w-full text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors py-1"
        >
          View all checks
        </button>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <CheckDepositModal
          check={editingCheck}
          userId={userId}
          onSave={(data) =>
            editingCheck
              ? handleUpdate(editingCheck.id, data)
              : handleCreate(data)
          }
          onClose={() => {
            setShowModal(false)
            setEditingCheck(null)
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Delete Check
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Modal                                                              */
/* ================================================================== */

function CheckDepositModal({
  check,
  userId,
  onSave,
  onClose,
}: {
  check: CheckDeposit | null
  userId: string
  onSave: (data: { name: string; description: string; photoUrl: string | null }) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [name, setName] = useState(check?.name ?? '')
  const [description, setDescription] = useState(check?.description ?? '')
  const [photoUrl, setPhotoUrl] = useState<string | null>(check?.photo_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(check?.photo_url ?? null)

  const uploadInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const blobUrl = URL.createObjectURL(file)
        setPreviewUrl(blobUrl)

        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type || undefined })
        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
        setPhotoUrl(urlData.publicUrl)
        setPreviewUrl(urlData.publicUrl)
      } catch (err) {
        console.error('[CheckDeposit] Upload failed:', err)
        setPreviewUrl(photoUrl)
      } finally {
        setUploading(false)
      }
    },
    [supabase, userId, photoUrl]
  )

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function removePhoto() {
    setPhotoUrl(null)
    setPreviewUrl(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), description, photoUrl })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            {check ? 'Edit Check Deposit' : 'Add Check Deposit'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Hansen Foods Processing"
              autoFocus
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20 text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20 text-gray-900 placeholder-gray-400 resize-y"
            />
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check photo
            </label>

            {previewUrl ? (
              <div className="relative w-full rounded-lg overflow-hidden border border-gray-200 mb-2">
                <Image
                  src={previewUrl}
                  alt="Check preview"
                  width={400}
                  height={200}
                  className="w-full h-auto max-h-[200px] object-contain bg-gray-50"
                />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                </button>
                {uploading && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                    <Loader2Icon className="w-6 h-6 text-orange-500 animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-orange-300 hover:bg-orange-50 transition disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                  ) : (
                    <UploadIcon className="w-4 h-4" />
                  )}
                  Upload photo
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold transition shadow-sm disabled:opacity-50"
                >
                  <CameraIcon className="w-4 h-4" />
                  Take photo
                </button>
              </div>
            )}

            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              className="hidden"
              onChange={handleFileInput}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 rounded-lg transition-colors"
            >
              {check ? 'Save Changes' : 'Add Check'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function extractStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}
