'use client'

import { useState, useEffect } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'

export interface ReminderContactOption {
  id: string
  first_name: string
  last_name: string
}

export interface ReminderAssigneeOption {
  id: string
  display_name: string | null
}

interface NewReminderModalProps {
  companyId: string
  userId: string
  contacts: ReminderContactOption[]
  onClose: () => void
  onSaved: () => void
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

export default function NewReminderModal({
  companyId,
  userId,
  contacts,
  onClose,
  onSaved,
}: NewReminderModalProps) {
  // Default to tomorrow 9:00 AM local
  const defaultDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return toLocalInput(d.toISOString())
  })()

  const [reminderDate, setReminderDate] = useState(defaultDate)
  const [contactId, setContactId] = useState('')
  const [note, setNote] = useState('')
  const [assignedTo, setAssignedTo] = useState<string>(userId)
  const [assignees, setAssignees] = useState<ReminderAssigneeOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .in('role', ['admin', 'office_manager', 'salesman'])
      .order('display_name', { ascending: true })
      .then(({ data }) => {
        setAssignees(
          ((data ?? []) as { id: string; display_name: string | null }[]).map((p) => ({
            id: p.id,
            display_name: p.display_name,
          }))
        )
      })
  }, [])

  async function handleSave() {
    if (!reminderDate) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const iso = new Date(reminderDate).toISOString()
    const { error: err } = await supabase.from('crm_follow_up_reminders').insert({
      company_id: companyId,
      contact_id: contactId || null,
      reminder_date: iso,
      note: note.trim() || null,
      assigned_to: assignedTo || null,
      created_by: userId,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
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
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <h3 className="text-lg font-semibold text-gray-900">New Reminder</h3>
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
                Date &amp; time *
              </label>
              <input
                type="datetime-local"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Contact
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className={inputClass}
              >
                <option value="">— No contact —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="What to follow up on?"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Assigned to
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className={inputClass}
              >
                <option value="">— Unassigned —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || a.id.slice(0, 8)}
                  </option>
                ))}
              </select>
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
              disabled={!reminderDate || saving}
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
