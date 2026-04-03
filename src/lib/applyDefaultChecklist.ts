import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Auto-applies the default checklist template (is_default = true) and the
 * closeout checklist template (is_closeout = true) to a newly created project.
 * Does nothing for either if the template doesn't exist or has no items.
 */
export async function applyDefaultChecklist(
  supabase: SupabaseClient,
  projectId: string,
  projectStartDate?: string | null,
) {
  // Find both auto-applied templates in one query
  const { data: autoTemplates } = await supabase
    .from('checklist_templates')
    .select('id, name, is_default, is_closeout')
    .or('is_default.eq.true,is_closeout.eq.true')

  if (!autoTemplates || autoTemplates.length === 0) return

  for (const template of autoTemplates) {
    // Fetch its items
    const { data: templateItems } = await supabase
      .from('checklist_template_items')
      .select('*')
      .eq('template_id', template.id)
      .order('sort_order', { ascending: true })

    if (!templateItems || templateItems.length === 0) continue

    const projectItems = templateItems.map((item: Record<string, unknown>, idx: number) => ({
      project_id: projectId,
      template_id: template.id,
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
      group_name: template.name,
    }))

    await supabase.from('project_checklist_items').insert(projectItems)
  }
}
