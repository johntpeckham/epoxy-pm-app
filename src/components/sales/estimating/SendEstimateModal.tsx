'use client'

import { useState } from 'react'
import { XIcon, SendIcon, Loader2Icon, AlertTriangleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import type { Customer, Estimate } from '@/components/estimates/types'
import type {
  EstimatingProject,
  PipelineStage,
  ReminderRule,
} from './types'

interface SendEstimateModalProps {
  estimate: Estimate
  customer: Customer
  project: EstimatingProject
  userId: string
  onClose: () => void
  onSent: (patch: Partial<Estimate>, pipelinePatch?: Partial<EstimatingProject>) => void
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export default function SendEstimateModal({
  estimate,
  customer,
  project,
  userId,
  onClose,
  onSent,
}: SendEstimateModalProps) {
  const [email, setEmail] = useState(customer.email ?? '')
  const [name, setName] = useState(customer.name ?? '')
  const [subject, setSubject] = useState(
    `Estimate #${estimate.estimate_number} — ${
      estimate.project_name || project.name || 'Project'
    } from Peckham Coatings`
  )
  const [message, setMessage] = useState(
    'Please find the attached estimate for your review. Let us know if you have any questions.'
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lineItemCount = Array.isArray(estimate.line_items)
    ? estimate.line_items.length
    : 0

  async function handleSend() {
    if (!email.trim()) {
      setError('Please enter a recipient email.')
      return
    }
    setSending(true)
    setError(null)
    const supabase = createClient()
    const now = new Date().toISOString()

    try {
      // 1. Update the estimate
      const estimatePatch: Partial<Estimate> = {
        status: 'Sent',
        sent_at: now,
        sent_to_email: email.trim(),
        sent_to_name: name.trim() || null,
        sent_message: message.trim() || null,
      }
      const { error: estErr } = await supabase
        .from('estimates')
        .update(estimatePatch)
        .eq('id', estimate.id)
      if (estErr) throw estErr

      // 2. Move pipeline to Estimate Sent — only if not past it already
      const { data: stagesData } = await supabase
        .from('pipeline_stages')
        .select('*')
        .order('display_order', { ascending: true })
      const stages = (stagesData as PipelineStage[]) ?? []
      const targetIdx = stages.findIndex((s) => s.name === 'Estimate Sent')
      const currentIdx = stages.findIndex((s) => s.name === project.pipeline_stage)
      let pipelinePatch: Partial<EstimatingProject> | undefined
      if (targetIdx >= 0 && (currentIdx < 0 || currentIdx < targetIdx)) {
        const fromStage = project.pipeline_stage
        const { error: projErr } = await supabase
          .from('estimating_projects')
          .update({ pipeline_stage: 'Estimate Sent' })
          .eq('id', project.id)
        if (projErr) throw projErr
        await supabase.from('pipeline_history').insert({
          project_id: project.id,
          from_stage: fromStage,
          to_stage: 'Estimate Sent',
          changed_by: userId,
        })
        pipelinePatch = { pipeline_stage: 'Estimate Sent' }
      }

      // 3. Auto-create reminders from active rules (skip duplicates)
      const { data: rulesData } = await supabase
        .from('reminder_rules')
        .select('*')
        .eq('trigger_event', 'estimate_sent')
        .eq('is_active', true)
      const rules = (rulesData as ReminderRule[]) ?? []
      if (rules.length > 0) {
        const { data: existing } = await supabase
          .from('estimating_reminders')
          .select('id')
          .eq('project_id', project.id)
          .eq('trigger_event', 'estimate_sent')
          .limit(1)
        const hasExisting = (existing ?? []).length > 0
        if (!hasExisting) {
          const base = new Date()
          const inserts = rules.map((r) => {
            const due = new Date(base)
            due.setDate(due.getDate() + r.days_after)
            due.setHours(9, 0, 0, 0)
            const title = r.title_template.replace(
              /\{project_name\}/g,
              project.name
            )
            return {
              project_id: project.id,
              title,
              description: null,
              due_date: due.toISOString(),
              reminder_type: 'auto',
              trigger_event: 'estimate_sent',
              status: 'pending',
              created_by: userId,
            }
          })
          await supabase.from('estimating_reminders').insert(inserts)
        }
      }

      // 4. Create a notification for the sender
      const link = `/sales/estimating?customer=${customer.id}&project=${project.id}`
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'estimate_sent',
        title: `Estimate #${estimate.estimate_number} sent`,
        message: `Estimate #${estimate.estimate_number} sent to ${
          name.trim() || customer.name || email.trim()
        }`,
        link,
        read: false,
      })

      onSent(estimatePatch, pipelinePatch)
    } catch (err) {
      console.error('[SendEstimateModal] Send failed:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to send estimate.'
      )
      setSending(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (sending ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-lg h-auto bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <SendIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">Send estimate</h3>
            </div>
            <button
              onClick={onClose}
              disabled={sending}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Recipient email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Recipient name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Message
              </label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
              />
            </div>

            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-1">
              <p className="text-xs text-gray-500">Estimate preview</p>
              <p className="text-sm font-medium text-gray-900">
                #{estimate.estimate_number}
                {estimate.project_name ? ` · ${estimate.project_name}` : ''}
              </p>
              <p className="text-xs text-gray-500">
                {lineItemCount} line item{lineItemCount === 1 ? '' : 's'} ·{' '}
                <span className="font-semibold text-gray-900">
                  {formatMoney(estimate.total ?? 0)}
                </span>
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <p className="text-[11px] text-gray-400 italic">
              Email sending coming soon — this will log the estimate as sent and
              trigger follow-up reminders.
            </p>
          </div>

          <div
            className="flex-none flex gap-3 justify-end p-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {sending ? (
                <>
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <SendIcon className="w-4 h-4" />
                  Send estimate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
