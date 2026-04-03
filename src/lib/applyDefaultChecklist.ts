import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Auto-applies the default checklist template (is_default = true) to a newly created project.
 * Does nothing if no default template exists or if the template has no items.
 */
export async function applyDefaultChecklist(
  supabase: SupabaseClient,
  projectId: string,
  projectStartDate?: string | null,
) {
  // Find the default template
  const { data: defaultTemplate } = await supabase
    .from('checklist_templates')
    .select('id, name')
    .eq('is_default', true)
    .single()

  if (!defaultTemplate) return

  // Fetch its items
  const { data: templateItems } = await supabase
    .from('checklist_template_items')
    .select('*')
    .eq('template_id', defaultTemplate.id)
    .order('sort_order', { ascending: true })

  if (!templateItems || templateItems.length === 0) return

  const projectItems = templateItems.map((item: Record<string, unknown>, idx: number) => ({
    project_id: projectId,
    template_id: defaultTemplate.id,
    template_item_id: item.id,
    name: item.name,
    is_complete: false,
    assigned_to: item.default_assignee_id || null,
    due_date:
      item.default_due_days && projectStartDate
        ? new Date(
            new Date(projectStartDate + 'T00:00:00').getTime() +
              (item.default_due_days as number) * 86400000,
          )
            .toISOString()
            .split('T')[0]
        : null,
    notes: item.default_notes || null,
    sort_order: idx,
    group_name: defaultTemplate.name,
  }))

  await supabase.from('project_checklist_items').insert(projectItems)
}
