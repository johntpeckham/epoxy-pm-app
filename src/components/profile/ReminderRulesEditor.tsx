'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XIcon,
  BellIcon,
  PlusIcon,
  Trash2Icon,
  Loader2Icon,
  AlertTriangleIcon,
  MailIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { ReminderRule } from '@/components/sales/estimating/types'

const TRIGGER_OPTIONS: { value: string; label: string }[] = [
  { value: 'proposal_sent', label: 'Proposal Sent' },
]

const MERGE_FIELDS = [
  '{customer_name}',
  '{project_name}',
  '{project_number}',
  '{proposal_number}',
  '{company_name}',
]

interface DraftRule {
  id: string
  trigger_event: string
  days_after: number
  title_template: string
  is_active: boolean
  isNew?: boolean
  isDeleted?: boolean
}

interface DraftTemplate {
  id: string
  name: string
  subject_template: string
  body_template: string
  is_active: boolean
  isNew?: boolean
  isDeleted?: boolean
}

interface SalesSettingsRow {
  id: string
  reminder_snooze_threshold: number
  reminder_escalation_enabled: boolean
}

interface ReminderRulesEditorProps {
  onClose: () => void
}

export default function ReminderRulesEditor({ onClose }: ReminderRulesEditorProps) {
  const [rules, setRules] = useState<DraftRule[]>([])
  const [templates, setTemplates] = useState<DraftTemplate[]>([])
  const [salesSettings, setSalesSettings] = useState<SalesSettingsRow | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<DraftRule | null>(
    null
  )
  const [expandedTemplate, setExpandedTemplate] = useState<Set<string>>(
    new Set()
  )

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      const [
        { data: ruleData },
        { data: tmplData },
        { data: salesData },
      ] = await Promise.all([
        supabase
          .from('reminder_rules')
          .select('*')
          .order('days_after', { ascending: true }),
        supabase
          .from('email_templates')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase.from('sales_settings').select('*').limit(1).maybeSingle(),
      ])

      setRules(
        ((ruleData as ReminderRule[]) ?? []).map((r) => ({
          id: r.id,
          trigger_event: r.trigger_event,
          days_after: r.days_after,
          title_template: r.title_template,
          is_active: r.is_active,
        }))
      )

      setTemplates(
        ((tmplData as DraftTemplate[]) ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          subject_template: t.subject_template ?? '',
          body_template: t.body_template ?? '',
          is_active: t.is_active,
        }))
      )

      if (salesData) {
        setSalesSettings({
          id: salesData.id,
          reminder_snooze_threshold: salesData.reminder_snooze_threshold ?? 3,
          reminder_escalation_enabled: Boolean(
            salesData.reminder_escalation_enabled
          ),
        })
      } else {
        setSalesSettings({
          id: '',
          reminder_snooze_threshold: 3,
          reminder_escalation_enabled: false,
        })
      }
    } catch (err) {
      console.error('[ReminderRulesEditor] fetch failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const visibleRules = rules.filter((d) => !d.isDeleted)
  const visibleTemplates = templates.filter((t) => !t.isDeleted)

  function updateRule(id: string, patch: Partial<DraftRule>) {
    setRules((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function addRule() {
    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setRules((prev) => [
      ...prev,
      {
        id,
        trigger_event: 'proposal_sent',
        days_after: 3,
        title_template: 'Follow up on {project_name}',
        is_active: true,
        isNew: true,
      },
    ])
  }

  function requestDeleteRule(draft: DraftRule) {
    if (draft.isNew) {
      setRules((prev) => prev.filter((d) => d.id !== draft.id))
      return
    }
    setConfirmDeleteRule(draft)
  }

  function confirmDeleteRuleNow() {
    if (!confirmDeleteRule) return
    updateRule(confirmDeleteRule.id, { isDeleted: true })
    setConfirmDeleteRule(null)
  }

  function updateTemplate(id: string, patch: Partial<DraftTemplate>) {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    )
  }

  function addTemplate() {
    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setTemplates((prev) => [
      ...prev,
      {
        id,
        name: 'New template',
        subject_template: 'Following up on {project_name}',
        body_template:
          'Hi {customer_name},\n\nJust following up on proposal {proposal_number} for {project_name}.\n\nThanks,\n{company_name}',
        is_active: true,
        isNew: true,
      },
    ])
    setExpandedTemplate((prev) => new Set(prev).add(id))
  }

  function deleteTemplate(id: string) {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    if (t.isNew) {
      setTemplates((prev) => prev.filter((x) => x.id !== id))
      return
    }
    updateTemplate(id, { isDeleted: true })
  }

  function toggleTemplate(id: string) {
    setExpandedTemplate((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    try {
      // Rules
      const deletedRuleIds = rules
        .filter((d) => d.isDeleted && !d.isNew)
        .map((d) => d.id)
      if (deletedRuleIds.length > 0) {
        await supabase.from('reminder_rules').delete().in('id', deletedRuleIds)
      }
      for (const d of rules.filter((x) => !x.isDeleted)) {
        const row = {
          trigger_event: d.trigger_event,
          days_after: d.days_after,
          title_template: d.title_template.trim(),
          is_active: d.is_active,
        }
        if (d.isNew) {
          await supabase.from('reminder_rules').insert(row)
        } else {
          await supabase.from('reminder_rules').update(row).eq('id', d.id)
        }
      }

      // Templates
      const deletedTmplIds = templates
        .filter((t) => t.isDeleted && !t.isNew)
        .map((t) => t.id)
      if (deletedTmplIds.length > 0) {
        await supabase.from('email_templates').delete().in('id', deletedTmplIds)
      }
      for (const t of templates.filter((x) => !x.isDeleted)) {
        const row = {
          name: t.name.trim() || 'Untitled',
          subject_template: t.subject_template,
          body_template: t.body_template,
          is_active: t.is_active,
        }
        if (t.isNew) {
          await supabase.from('email_templates').insert(row)
        } else {
          await supabase.from('email_templates').update(row).eq('id', t.id)
        }
      }

      // Sales settings (escalation)
      if (salesSettings) {
        const payload = {
          reminder_snooze_threshold: salesSettings.reminder_snooze_threshold,
          reminder_escalation_enabled: salesSettings.reminder_escalation_enabled,
        }
        if (salesSettings.id) {
          await supabase
            .from('sales_settings')
            .update(payload)
            .eq('id', salesSettings.id)
        } else {
          await supabase.from('sales_settings').insert(payload)
        }
      }

      setSaving(false)
      onClose()
    } catch (err) {
      console.error('[ReminderRulesEditor] Save failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to save changes.')
      setSaving(false)
    }
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={() => (saving ? null : onClose())}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-3xl h-auto bg-white md:rounded-xl flex flex-col overflow-hidden max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-2">
              <BellIcon className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Notifications and Follow-ups
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

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {loading ? (
              <div className="py-8 flex items-center justify-center text-gray-400">
                <Loader2Icon className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <>
                <RulesSection
                  rules={visibleRules}
                  onUpdate={updateRule}
                  onAdd={addRule}
                  onDelete={requestDeleteRule}
                />
                <TemplatesSection
                  templates={visibleTemplates}
                  expanded={expandedTemplate}
                  onToggle={toggleTemplate}
                  onUpdate={updateTemplate}
                  onAdd={addTemplate}
                  onDelete={deleteTemplate}
                />
                <EscalationSection
                  settings={salesSettings}
                  onUpdate={(patch) =>
                    setSalesSettings((prev) =>
                      prev ? { ...prev, ...patch } : prev
                    )
                  }
                />
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
                    <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </>
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
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {confirmDeleteRule && (
        <ConfirmDialog
          title="Delete rule?"
          message={`This will remove the "${confirmDeleteRule.title_template}" rule. Existing reminders already created from this rule will stay.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={confirmDeleteRuleNow}
          onCancel={() => setConfirmDeleteRule(null)}
        />
      )}
    </Portal>
  )
}

function RulesSection({
  rules,
  onUpdate,
  onAdd,
  onDelete,
}: {
  rules: DraftRule[]
  onUpdate: (id: string, patch: Partial<DraftRule>) => void
  onAdd: () => void
  onDelete: (r: DraftRule) => void
}) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Auto-reminder rules
      </h4>
      <p className="text-xs text-gray-500 mb-3">
        Use{' '}
        <code className="px-1 py-0.5 rounded bg-gray-100 text-gray-700">
          {'{project_name}'}
        </code>{' '}
        in the title to include the project name.
      </p>
      {rules.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-4">
          No rules configured.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((d) => (
            <div
              key={d.id}
              className="p-3 bg-white border border-gray-200 rounded-lg space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
                <select
                  value={d.trigger_event}
                  onChange={(e) =>
                    onUpdate(d.id, { trigger_event: e.target.value })
                  }
                  className="px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  {TRIGGER_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    value={d.days_after}
                    onChange={(e) =>
                      onUpdate(d.id, {
                        days_after: Math.max(
                          0,
                          parseInt(e.target.value || '0', 10)
                        ),
                      })
                    }
                    className="w-16 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <span className="text-xs text-gray-500">days after</span>
                </div>
                <label className="flex items-center gap-1 text-xs text-gray-500 justify-self-end">
                  <input
                    type="checkbox"
                    checked={d.is_active}
                    onChange={(e) =>
                      onUpdate(d.id, { is_active: e.target.checked })
                    }
                    className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  Active
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={d.title_template}
                  onChange={(e) =>
                    onUpdate(d.id, { title_template: e.target.value })
                  }
                  placeholder="Follow up on {project_name}"
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => onDelete(d)}
                  title="Delete rule"
                  className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2Icon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
      >
        <PlusIcon className="w-4 h-4" />
        Add rule
      </button>
    </section>
  )
}

function TemplatesSection({
  templates,
  expanded,
  onToggle,
  onUpdate,
  onAdd,
  onDelete,
}: {
  templates: DraftTemplate[]
  expanded: Set<string>
  onToggle: (id: string) => void
  onUpdate: (id: string, patch: Partial<DraftTemplate>) => void
  onAdd: () => void
  onDelete: (id: string) => void
}) {
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Email templates
      </h4>
      <p className="text-xs text-gray-500 mb-3">
        Saved templates for follow-up emails. Email sending is not yet live —
        templates are stored for future use.
      </p>
      {templates.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-4">
          No templates yet.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              isExpanded={expanded.has(t.id)}
              onToggle={() => onToggle(t.id)}
              onUpdate={(patch) => onUpdate(t.id, patch)}
              onDelete={() => onDelete(t.id)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition"
      >
        <PlusIcon className="w-4 h-4" />
        Add template
      </button>
    </section>
  )
}

function TemplateRow({
  template,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  template: DraftTemplate
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<DraftTemplate>) => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={onToggle}
          className="p-1 text-gray-400 hover:text-gray-600"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDownIcon className="w-4 h-4" />
          ) : (
            <ChevronRightIcon className="w-4 h-4" />
          )}
        </button>
        <MailIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <input
          type="text"
          value={template.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Template name"
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        />
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={template.is_active}
            onChange={(e) => onUpdate({ is_active: e.target.checked })}
            className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500/20 focus:border-amber-500"
          />
          Active
        </label>
        <button
          type="button"
          onClick={onDelete}
          title="Delete template"
          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded"
        >
          <Trash2Icon className="w-4 h-4" />
        </button>
      </div>
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 bg-amber-50/40 border-t border-amber-100 space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={template.subject_template}
              onChange={(e) =>
                onUpdate({ subject_template: e.target.value })
              }
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              Body
            </label>
            <textarea
              value={template.body_template}
              onChange={(e) => onUpdate({ body_template: e.target.value })}
              rows={5}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
            />
          </div>
          <div className="text-[11px] text-gray-500">
            Available merge fields:{' '}
            {MERGE_FIELDS.map((f, i) => (
              <span key={f}>
                <code className="px-1 py-0.5 rounded bg-gray-100 text-gray-700">
                  {f}
                </code>
                {i < MERGE_FIELDS.length - 1 ? ' ' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EscalationSection({
  settings,
  onUpdate,
}: {
  settings: SalesSettingsRow | null
  onUpdate: (patch: Partial<SalesSettingsRow>) => void
}) {
  if (!settings) return null
  return (
    <section>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Reminder escalation
      </h4>
      <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input
            type="checkbox"
            checked={settings.reminder_escalation_enabled}
            onChange={(e) =>
              onUpdate({ reminder_escalation_enabled: e.target.checked })
            }
            className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500/20 focus:border-amber-500"
          />
          Notify admin when a reminder is snoozed too many times
        </label>
        {settings.reminder_escalation_enabled && (
          <div className="flex items-center gap-2 pl-6">
            <span className="text-xs text-gray-500">Snooze threshold:</span>
            <input
              type="number"
              min={1}
              value={settings.reminder_snooze_threshold}
              onChange={(e) =>
                onUpdate({
                  reminder_snooze_threshold: Math.max(
                    1,
                    parseInt(e.target.value || '1', 10)
                  ),
                })
              }
              className="w-20 px-2 py-1 border border-gray-200 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            <span className="text-xs text-gray-500">snoozes</span>
          </div>
        )}
      </div>
    </section>
  )
}
