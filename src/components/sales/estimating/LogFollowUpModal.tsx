'use client'

import { useState } from 'react'
import { XIcon, MessageCircleIcon, Loader2Icon, AlertTriangleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { Customer, Estimate, EstimateFollowUp } from '@/components/estimates/types'
import type { EstimatingProject, EstimatingReminder } from './types'

interface LogFollowUpModalProps {
  estimate: Estimate
  customer: Customer
  project: EstimatingProject
  userId: string
  onClose: () => void
  onCreated: (followUp: EstimateFollowUp) => void
}

export default function LogFollowUpModal({
  estimate,
  customer,
  project,
  userId,
  onClose,
  onCreated,
}: LogFollowUpModalProps) {
  const [followUpType, setFollowUpType] =
    useState<EstimateFollowUp['follow_up_type']>('call')
  const [outcome, setOutcome] =
    useState<NonNullable<EstimateFollowUp['outcome']>>('connected')
  const [contactedName, setContactedName] = useState(customer.name ?? '')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingReminder, setPendingReminder] =
    useState<EstimatingReminder | null>(null)
  const [createdFollowUp, setCreatedFollowUp] =
    useState<EstimateFollowUp | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    try {
      const { data, error: insErr } = await supabase
        .from('estimate_follow_ups')
        .insert({
          estimate_id: estimate.id,
          project_id: project.id,
          follow_up_type: followUpType,
          notes: notes.trim() || null,
          outcome,
          contacted_name: contactedName.trim() || null,
          created_by: userId,
        })
        .select('*')
        .single()

      if (insErr || !data) throw insErr ?? new Error('Insert failed')

      const followUp = data as EstimateFollowUp

      // Log a notification so this appears in the bell
      const link = `/sales/estimating?customer=${customer.id}&project=${project.id}`
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'estimate_follow_up',
        title: `Follow-up logged · #${estimate.estimate_number}`,
        message: `${followUpType} with ${
          contactedName.trim() || customer.name || 'contact'
        } · outcome: ${outcome.replace(/_/g, ' ')}`,
        link,
        read: false,
      })

      // Check for pending auto-reminders — prompt to complete the soonest one
      const { data: remindersData } = await supabase
        .from('estimating_reminders')
        .select('*')
        .eq('project_id', project.id)
        .eq('reminder_type', 'auto')
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(1)
      const soonest = (remindersData as EstimatingReminder[] | null)?.[0]

      if (soonest) {
        setCreatedFollowUp(followUp)
        setPendingReminder(soonest)
        setSaving(false)
        return
      }

      onCreated(followUp)
    } catch (err) {
      console.error('[LogFollowUpModal] Save failed:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to save follow-up.'
      )
      setSaving(false)
    }
  }

  async function completeAndClose() {
    if (!pendingReminder || !createdFollowUp) return
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase
      .from('estimating_reminders')
      .update({ status: 'completed', completed_at: now })
      .eq('id', pendingReminder.id)
    onCreated(createdFollowUp)
  }

  function skipAndClose() {
    if (!createdFollowUp) return
    onCreated(createdFollowUp)
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
              <MessageCircleIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-gray-900">Log follow-up</h3>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Type
                </label>
                <select
                  value={followUpType}
                  onChange={(e) =>
                    setFollowUpType(
                      e.target.value as EstimateFollowUp['follow_up_type']
                    )
                  }
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="text">Text</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Outcome
                </label>
                <select
                  value={outcome}
                  onChange={(e) =>
                    setOutcome(
                      e.target.value as NonNullable<EstimateFollowUp['outcome']>
                    )
                  }
                  className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="connected">Connected</option>
                  <option value="voicemail">Voicemail</option>
                  <option value="no_answer">No answer</option>
                  <option value="sent">Sent</option>
                  <option value="replied">Replied</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Contacted name
              </label>
              <input
                type="text"
                value={contactedName}
                onChange={(e) => setContactedName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Notes
              </label>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                placeholder="What did you discuss?"
              />
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
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Log follow-up'
              )}
            </button>
          </div>
        </div>
      </div>

      {pendingReminder && (
        <ConfirmDialog
          title="Complete the next pending reminder?"
          message={`You have a pending auto-reminder: "${pendingReminder.title}". Mark it as completed now that you've logged this follow-up?`}
          confirmLabel="Yes, complete it"
          variant="default"
          onConfirm={completeAndClose}
          onCancel={skipAndClose}
        />
      )}
    </Portal>
  )
}
