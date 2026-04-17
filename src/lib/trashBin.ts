import { SupabaseClient } from '@supabase/supabase-js'

export type TrashItemType =
  | 'project'
  | 'feed_post'
  | 'calendar_event'
  | 'checklist_item'
  | 'material_order'
  | 'document'
  | 'contract'
  | 'salesman_expense'
  | 'estimate'
  | 'invoice'
  | 'change_order'
  | 'checklist_template'
  | 'customer'
  | 'employee'

export interface TrashBinItem {
  id: string
  item_type: TrashItemType
  item_id: string
  item_name: string
  item_data: Record<string, unknown>
  related_project: string | null
  deleted_by: string
  deleted_at: string
  expires_at: string
}

/** Maps item_type to the database table for restoring */
const TABLE_MAP: Record<string, string> = {
  project: 'projects',
  feed_post: 'feed_posts',
  calendar_event: 'calendar_events',
  checklist_item: 'project_checklist_items',
  material_order: 'material_orders',
  document: 'project_documents',
  contract: 'project_contracts',
  salesman_expense: 'salesman_expenses',
  estimate: 'estimates',
  invoice: 'invoices',
  change_order: 'change_orders',
  checklist_template: 'checklist_templates',
  customer: 'customers',
  employee: 'employee_profiles',
}

/** Tables with project_id FK that get cascade-deleted with a project */
const PROJECT_RELATED_TABLES = [
  'feed_posts',
  'tasks',
  'project_checklist_items',
  'calendar_events',
  'project_documents',
  'project_contracts',
  'material_orders',
]

/**
 * Move a single item to the trash bin, then delete from the original table.
 */
export async function moveToTrash(
  supabase: SupabaseClient,
  itemType: TrashItemType,
  itemId: string,
  itemName: string,
  deletedBy: string,
  itemData: Record<string, unknown>,
  relatedProject?: string | null,
): Promise<{ error: string | null }> {
  const { error: insertError } = await supabase.from('trash_bin').insert({
    item_type: itemType,
    item_id: itemId,
    item_name: itemName,
    item_data: itemData,
    related_project: relatedProject || null,
    deleted_by: deletedBy,
  })
  if (insertError) return { error: 'Failed to move to trash: ' + insertError.message }

  const table = TABLE_MAP[itemType]
  if (table) {
    const { error: deleteError } = await supabase.from(table).delete().eq('id', itemId)
    if (deleteError) return { error: 'Trashed but failed to remove original: ' + deleteError.message }
  }
  return { error: null }
}

/**
 * Soft-delete a project: snapshot the project + all related data, then delete.
 * Related data is bundled inside item_data so a restore brings everything back.
 */
export async function softDeleteProject(
  supabase: SupabaseClient,
  projectId: string,
  projectName: string,
  deletedBy: string,
): Promise<{ error: string | null }> {
  // 1. Snapshot the project record
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()
  if (projErr || !project) return { error: 'Failed to snapshot project: ' + (projErr?.message ?? 'not found') }

  // 2. Snapshot all related data
  const relatedData: Record<string, unknown[]> = {}
  for (const table of PROJECT_RELATED_TABLES) {
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq('project_id', projectId)
    if (data && data.length > 0) relatedData[table] = data
  }

  // 3. Also snapshot project_pins (not cascade-deleted but useful)
  // Skip — pins are user preference, not content

  // 4. Bundle everything
  const itemData: Record<string, unknown> = {
    project,
    ...relatedData,
  }

  // 5. Remove photos from storage before delete (they won't be recoverable from storage, but data is saved)
  const photoPosts = relatedData.feed_posts as Array<Record<string, unknown>> | undefined
  if (photoPosts) {
    const paths = photoPosts
      .filter((p) => p.post_type === 'photo')
      .flatMap((p) => ((p.content as Record<string, unknown>)?.photos as string[]) ?? [])
    if (paths.length) await supabase.storage.from('post-photos').remove(paths)
  }

  // 6. Insert into trash
  const { error: trashErr } = await supabase.from('trash_bin').insert({
    item_type: 'project',
    item_id: projectId,
    item_name: projectName,
    item_data: itemData,
    related_project: null,
    deleted_by: deletedBy,
  })
  if (trashErr) return { error: 'Failed to move to trash: ' + trashErr.message }

  // 7. Delete the project (cascades handle related data)
  const { error: deleteErr } = await supabase.from('projects').delete().eq('id', projectId)
  if (deleteErr) return { error: 'Trashed but failed to delete project: ' + deleteErr.message }

  return { error: null }
}

/**
 * Soft-delete an estimate with its change orders bundled together.
 */
export async function softDeleteEstimate(
  supabase: SupabaseClient,
  estimateId: string,
  estimateName: string,
  deletedBy: string,
  relatedProject?: string | null,
): Promise<{ error: string | null }> {
  const { data: estimate } = await supabase.from('estimates').select('*').eq('id', estimateId).single()
  if (!estimate) return { error: 'Estimate not found' }

  const { data: changeOrders } = await supabase.from('change_orders').select('*').eq('estimate_id', estimateId)

  const itemData: Record<string, unknown> = { estimate, change_orders: changeOrders ?? [] }

  const { error: trashErr } = await supabase.from('trash_bin').insert({
    item_type: 'estimate',
    item_id: estimateId,
    item_name: estimateName,
    item_data: itemData,
    related_project: relatedProject || null,
    deleted_by: deletedBy,
  })
  if (trashErr) return { error: 'Failed to move to trash: ' + trashErr.message }

  await supabase.from('change_orders').delete().eq('estimate_id', estimateId)
  const { error: deleteErr } = await supabase.from('estimates').delete().eq('id', estimateId)
  if (deleteErr) return { error: 'Trashed but failed to delete: ' + deleteErr.message }

  return { error: null }
}

/**
 * Soft-delete an invoice with its change orders bundled together.
 */
export async function softDeleteInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  invoiceName: string,
  deletedBy: string,
  relatedProject?: string | null,
): Promise<{ error: string | null }> {
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', invoiceId).single()
  if (!invoice) return { error: 'Invoice not found' }

  const { data: changeOrders } = await supabase.from('change_orders').select('*').eq('invoice_id', invoiceId)

  const itemData: Record<string, unknown> = { invoice, change_orders: changeOrders ?? [] }

  const { error: trashErr } = await supabase.from('trash_bin').insert({
    item_type: 'invoice',
    item_id: invoiceId,
    item_name: invoiceName,
    item_data: itemData,
    related_project: relatedProject || null,
    deleted_by: deletedBy,
  })
  if (trashErr) return { error: 'Failed to move to trash: ' + trashErr.message }

  await supabase.from('change_orders').delete().eq('invoice_id', invoiceId)
  const { error: deleteErr } = await supabase.from('invoices').delete().eq('id', invoiceId)
  if (deleteErr) return { error: 'Trashed but failed to delete: ' + deleteErr.message }

  return { error: null }
}

/**
 * Restore an item from the trash bin back to its original table.
 */
export async function restoreFromTrash(
  supabase: SupabaseClient,
  trashItem: TrashBinItem,
): Promise<{ error: string | null }> {
  const { item_type, item_data } = trashItem

  try {
    if (item_type === 'project') {
      // Restore project + all related data
      const projectData = item_data.project as Record<string, unknown>
      if (!projectData) return { error: 'No project data found in snapshot' }

      const { error: projErr } = await supabase.from('projects').insert(projectData)
      if (projErr) return { error: 'Failed to restore project: ' + projErr.message }

      // Restore related tables
      for (const table of PROJECT_RELATED_TABLES) {
        const rows = item_data[table] as Record<string, unknown>[] | undefined
        if (rows && rows.length > 0) {
          const { error } = await supabase.from(table).insert(rows)
          if (error) console.error(`[TrashBin] Failed to restore ${table}:`, error)
        }
      }
    } else if (item_type === 'estimate') {
      const estimateData = item_data.estimate as Record<string, unknown>
      if (!estimateData) return { error: 'No estimate data found' }

      // Check if parent project still exists
      if (estimateData.project_id) {
        const { data: proj } = await supabase.from('projects').select('id').eq('id', estimateData.project_id).single()
        if (!proj) return { error: 'Cannot restore — the parent project no longer exists' }
      }

      const { error } = await supabase.from('estimates').insert(estimateData)
      if (error) return { error: 'Failed to restore estimate: ' + error.message }

      const cos = item_data.change_orders as Record<string, unknown>[] | undefined
      if (cos && cos.length > 0) {
        await supabase.from('change_orders').insert(cos)
      }
    } else if (item_type === 'invoice') {
      const invoiceData = item_data.invoice as Record<string, unknown>
      if (!invoiceData) return { error: 'No invoice data found' }

      if (invoiceData.project_id) {
        const { data: proj } = await supabase.from('projects').select('id').eq('id', invoiceData.project_id).single()
        if (!proj) return { error: 'Cannot restore — the parent project no longer exists' }
      }

      const { error } = await supabase.from('invoices').insert(invoiceData)
      if (error) return { error: 'Failed to restore invoice: ' + error.message }

      const cos = item_data.change_orders as Record<string, unknown>[] | undefined
      if (cos && cos.length > 0) {
        await supabase.from('change_orders').insert(cos)
      }
    } else {
      // Simple single-record restore
      const table = TABLE_MAP[item_type]
      if (!table) return { error: `Unknown item type: ${item_type}` }

      // Check parent project exists for items with project_id
      const data = item_data as Record<string, unknown>
      if (data.project_id) {
        const { data: proj } = await supabase.from('projects').select('id').eq('id', data.project_id).single()
        if (!proj) return { error: 'Cannot restore — the parent project no longer exists' }
      }

      const { error } = await supabase.from(table).insert(data)
      if (error) return { error: 'Failed to restore: ' + error.message }
    }

    // Remove from trash
    const { error: removeErr } = await supabase.from('trash_bin').delete().eq('id', trashItem.id)
    if (removeErr) return { error: 'Restored but failed to remove from trash: ' + removeErr.message }

    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Restore failed' }
  }
}

/**
 * Permanently delete an item from the trash bin.
 */
export async function permanentlyDelete(
  supabase: SupabaseClient,
  trashItemId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trash_bin').delete().eq('id', trashItemId)
  if (error) return { error: 'Failed to permanently delete: ' + error.message }
  return { error: null }
}

/**
 * Clean up expired items (called when trash bin page loads).
 */
export async function cleanupExpired(supabase: SupabaseClient): Promise<void> {
  await supabase.from('trash_bin').delete().lt('expires_at', new Date().toISOString())
}

/** Human-readable labels for item types */
export const ITEM_TYPE_LABELS: Record<string, string> = {
  project: 'Project',
  feed_post: 'Feed Post',
  calendar_event: 'Calendar Event',
  checklist_item: 'Checklist Item',
  material_order: 'Material Order',
  document: 'Document',
  contract: 'Contract',
  salesman_expense: 'Expense',
  estimate: 'Estimate',
  invoice: 'Invoice',
  change_order: 'Change Order',
  checklist_template: 'Checklist Template',
  customer: 'Customer',
  employee: 'Employee',
}
