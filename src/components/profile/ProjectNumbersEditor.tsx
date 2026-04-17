'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XIcon,
  HashIcon,
  Loader2Icon,
  AlertTriangleIcon,
  PencilIcon,
  SettingsIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import {
  parseProjectFormat,
  formatProjectNumber,
  previewNextNumber,
} from '@/lib/nextProjectNumber'

interface ProjectNumbersEditorProps {
  onClose: () => void
}

interface UserRow {
  id: string
  display_name: string | null
  email: string | null
  role: string
}

interface SequenceRow {
  id: string
  user_id: string
  prefix: string
  suffix: string
  current_number: number
  format_example: string | null
}

interface CombinedRow {
  user: UserRow
  sequence: SequenceRow | null
}

const RELEVANT_ROLES = ['admin', 'salesman', 'office_manager']

interface SalesSettingsRow {
  id: string
  default_project_number_format: string
}

export default function ProjectNumbersEditor({ onClose }: ProjectNumbersEditorProps) {
  const [rows, setRows] = useState<CombinedRow[]>([])
  const [salesSettings, setSalesSettings] = useState<SalesSettingsRow | null>(
    null
  )
  const [defaultFormatDraft, setDefaultFormatDraft] = useState('1000')
  const [savingDefault, setSavingDefault] = useState(false)
  const [defaultSaveMessage, setDefaultSaveMessage] = useState<string | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CombinedRow | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      const res = await fetch('/api/list-users')
      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || 'Failed to fetch users')
      }
      const users = ((result.users ?? []) as UserRow[]).filter((u) =>
        RELEVANT_ROLES.includes(u.role)
      )

      const [{ data: seqData, error: seqErr }, { data: salesData }] =
        await Promise.all([
          supabase.from('user_project_sequences').select('*'),
          supabase
            .from('sales_settings')
            .select('id, default_project_number_format')
            .limit(1)
            .maybeSingle(),
        ])
      if (seqErr) throw seqErr
      const sequences = (seqData as SequenceRow[]) ?? []

      const byUser = new Map(sequences.map((s) => [s.user_id, s]))
      const combined: CombinedRow[] = users
        .map((u) => ({ user: u, sequence: byUser.get(u.id) ?? null }))
        .sort((a, b) => {
          const an = (a.user.display_name || a.user.email || '').toLowerCase()
          const bn = (b.user.display_name || b.user.email || '').toLowerCase()
          return an.localeCompare(bn)
        })

      setRows(combined)

      if (salesData) {
        setSalesSettings({
          id: salesData.id,
          default_project_number_format:
            salesData.default_project_number_format ?? '1000',
        })
        setDefaultFormatDraft(salesData.default_project_number_format ?? '1000')
      } else {
        setSalesSettings({ id: '', default_project_number_format: '1000' })
        setDefaultFormatDraft('1000')
      }
    } catch (err) {
      console.error('[ProjectNumbersEditor] fetch failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }, [])

  async function saveDefaultFormat() {
    if (!salesSettings) return
    const trimmed = defaultFormatDraft.trim() || '1000'
    setSavingDefault(true)
    setDefaultSaveMessage(null)
    const supabase = createClient()
    try {
      if (salesSettings.id) {
        const { error: updErr } = await supabase
          .from('sales_settings')
          .update({ default_project_number_format: trimmed })
          .eq('id', salesSettings.id)
        if (updErr) throw updErr
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('sales_settings')
          .insert({ default_project_number_format: trimmed })
          .select('id')
          .single()
        if (insErr) throw insErr
        setSalesSettings({
          id: inserted.id,
          default_project_number_format: trimmed,
        })
      }
      setSalesSettings((prev) =>
        prev ? { ...prev, default_project_number_format: trimmed } : prev
      )
      setDefaultSaveMessage('Saved')
      setTimeout(() => setDefaultSaveMessage(null), 2000)
    } catch (err) {
      console.error('[ProjectNumbersEditor] save default failed:', err)
      setDefaultSaveMessage(
        err instanceof Error ? err.message : 'Failed to save default.'
      )
    } finally {
      setSavingDefault(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function handleSaved() {
    setEditing(null)
    fetchData()
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-2xl h-auto bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <HashIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Project Numbers
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <p className="text-xs text-gray-500">
              Each salesperson gets their own auto-numbering format. Projects
              created by that user will be assigned the next number in their
              sequence.
            </p>

            {!loading && salesSettings && (
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
                <label className="block text-xs font-semibold text-amber-800 mb-1">
                  Default format for new users
                </label>
                <p className="text-[11px] text-amber-700 mb-2">
                  Used when a user creates their first project without a
                  configured sequence.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={defaultFormatDraft}
                    onChange={(e) => setDefaultFormatDraft(e.target.value)}
                    placeholder="e.g. 1000 or P-1000"
                    className="flex-1 px-3 py-2 border border-amber-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={saveDefaultFormat}
                    disabled={savingDefault}
                    className="px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-md transition disabled:opacity-60"
                  >
                    {savingDefault ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {defaultSaveMessage && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    {defaultSaveMessage}
                  </p>
                )}
              </div>
            )}

            {loading ? (
              <div className="py-8 flex items-center justify-center text-gray-400">
                <Loader2Icon className="w-4 h-4 animate-spin" />
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : rows.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">
                No eligible users found.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <UserSequenceRow
                    key={row.user.id}
                    row={row}
                    onEdit={() => setEditing(row)}
                  />
                ))}
              </div>
            )}
          </div>

          <div
            className="flex-none flex justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <EditSequenceModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </Portal>
  )
}

function UserSequenceRow({
  row,
  onEdit,
}: {
  row: CombinedRow
  onEdit: () => void
}) {
  const name =
    row.user.display_name || row.user.email || 'Unnamed user'
  const seq = row.sequence
  const nextPreview = seq
    ? previewNextNumber(seq.prefix, seq.suffix, seq.current_number)
    : null

  return (
    <div className="p-3 bg-white border border-gray-200 rounded-lg flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        {seq ? (
          <p className="text-xs text-gray-500 truncate">
            Format:{' '}
            <span className="text-amber-700 font-medium">
              {seq.format_example ||
                formatProjectNumber({
                  prefix: seq.prefix,
                  numeric: seq.current_number,
                  suffix: seq.suffix,
                })}
            </span>
            {' · '}
            Next:{' '}
            <span className="text-amber-700 font-medium">{nextPreview}</span>
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">Not configured</p>
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md transition flex-shrink-0"
      >
        {seq ? (
          <>
            <PencilIcon className="w-3 h-3" />
            Edit
          </>
        ) : (
          <>
            <SettingsIcon className="w-3 h-3" />
            Set up
          </>
        )}
      </button>
    </div>
  )
}

function EditSequenceModal({
  row,
  onClose,
  onSaved,
}: {
  row: CombinedRow
  onClose: () => void
  onSaved: () => void
}) {
  const seq = row.sequence
  const initialFormat =
    seq?.format_example ||
    (seq
      ? formatProjectNumber({
          prefix: seq.prefix,
          numeric: seq.current_number,
          suffix: seq.suffix,
        })
      : '1000')

  const [formatInput, setFormatInput] = useState(initialFormat)
  const [currentNumber, setCurrentNumber] = useState<number>(
    seq?.current_number ?? 999
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = parseProjectFormat(formatInput)

  // When the format input numeric part changes, offer a sensible
  // current_number default (one less than the typed number, so next = typed).
  useEffect(() => {
    if (!formatInput.trim()) return
    const parsedNow = parseProjectFormat(formatInput)
    // Only auto-sync if the user hasn't manually adjusted beyond the old format
    // Simple behaviour: keep currentNumber = parsed.numeric - 1 in sync while
    // editing; admin can override via the current number input
    setCurrentNumber(parsedNow.numeric - 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatInput])

  const nextPreview = previewNextNumber(parsed.prefix, parsed.suffix, currentNumber)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    try {
      const payload = {
        user_id: row.user.id,
        prefix: parsed.prefix,
        suffix: parsed.suffix,
        current_number: currentNumber,
        format_example: formatInput.trim(),
      }

      if (seq) {
        const { error: updErr } = await supabase
          .from('user_project_sequences')
          .update(payload)
          .eq('id', seq.id)
        if (updErr) throw updErr
      } else {
        const { error: insErr } = await supabase
          .from('user_project_sequences')
          .insert(payload)
        if (insErr) throw insErr
      }

      onSaved()
    } catch (err) {
      console.error('[EditSequenceModal] save failed:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to save sequence.'
      )
      setSaving(false)
    }
  }

  const name = row.user.display_name || row.user.email || 'Unnamed user'

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[80] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
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
              <h3 className="text-lg font-semibold text-gray-900">
                {seq ? 'Edit' : 'Set up'} — {name}
              </h3>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Project number format
              </label>
              <input
                type="text"
                value={formatInput}
                onChange={(e) => setFormatInput(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="e.g. 1000-P or P-1000 or 3000"
              />
              <p className="text-xs text-gray-400 mt-1">
                Type the starting number with any prefix and suffix. The
                numeric part will increment.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Current number
              </label>
              <input
                type="number"
                value={currentNumber}
                onChange={(e) =>
                  setCurrentNumber(parseInt(e.target.value || '0', 10))
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                The last number that was assigned. The next project will be
                this number plus one.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">
                Next project will be:{' '}
                <span className="font-bold text-amber-800">{nextPreview}</span>
              </p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                Prefix: &ldquo;{parsed.prefix}&rdquo; · Suffix: &ldquo;
                {parsed.suffix}&rdquo;
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
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
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !formatInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? <Loader2Icon className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
