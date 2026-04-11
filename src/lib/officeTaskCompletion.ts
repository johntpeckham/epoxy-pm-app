/**
 * Shared utility for toggling an office task's completion state.
 *
 * The equipment detail page creates an office task when a scheduled service
 * is assigned to a user, and links them via equipment_scheduled_services.task_id.
 * Completing the service from the equipment page already cascades to the
 * linked task (see EquipmentDetailClient.handleCompleteScheduled).
 *
 * This utility implements the REVERSE sync: when a task is toggled from an
 * office-tasks UI, we look for a linked scheduled service and mirror the
 * equipment page's completion logic — status change, completed_at/by,
 * recurrence generation, and a new linked task for the next occurrence.
 *
 * Call this from every office-task toggle handler instead of updating
 * office_tasks directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Parse a YYYY-MM-DD string as a local Date at midnight. */
function parseDateOnly(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

/**
 * Add interval units to a YYYY-MM-DD date and return the same format.
 * Mirrors the addInterval helper in EquipmentDetailClient so both sides
 * produce identical next-occurrence dates.
 */
function addInterval(dateStr: string, amount: number, unit: 'weeks' | 'months'): string {
  const d = parseDateOnly(dateStr)
  if (unit === 'weeks') {
    d.setDate(d.getDate() + amount * 7)
  } else {
    d.setMonth(d.getMonth() + amount)
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface LinkedService {
  id: string
  equipment_id: string
  description: string
  scheduled_date: string
  is_recurring: boolean
  recurrence_interval: number | null
  recurrence_unit: 'weeks' | 'months' | null
  status: string
  parent_service_id: string | null
}

/**
 * Toggle an office task's completion state and cascade to any linked
 * scheduled service.
 *
 * Completing: if a linked service is found AND it is not already completed,
 * mark the service completed, and if the service is recurring, generate the
 * next occurrence (with a fresh linked task when the original was assigned).
 *
 * Uncompleting: if a linked service is found AND it is currently completed,
 * revert the service to 'upcoming' and clear completed_at/by. (The generated
 * next occurrence, if any, is left alone — it is a separate row and the user
 * can manage it independently.)
 *
 * Non-linked tasks just get the boolean flipped and nothing else happens.
 */
export async function toggleOfficeTaskCompletion(
  supabase: SupabaseClient,
  taskId: string,
  newIsCompleted: boolean,
  userId: string
): Promise<void> {
  const nowIso = new Date().toISOString()

  // 1. Flip the task's completion flag.
  const { error: taskErr } = await supabase
    .from('office_tasks')
    .update({ is_completed: newIsCompleted, updated_at: nowIso })
    .eq('id', taskId)
  if (taskErr) {
    console.error('[toggleOfficeTaskCompletion] Failed to update task:', taskErr)
    throw taskErr
  }

  // 2. Find any linked scheduled service.
  const { data: linked, error: lookupErr } = await supabase
    .from('equipment_scheduled_services')
    .select(
      'id, equipment_id, description, scheduled_date, is_recurring, recurrence_interval, recurrence_unit, status, parent_service_id'
    )
    .eq('task_id', taskId)
    .maybeSingle()
  if (lookupErr) {
    console.error('[toggleOfficeTaskCompletion] Linked-service lookup failed:', lookupErr)
    return
  }
  if (!linked) return // Non-equipment task — we're done.

  const service = linked as LinkedService

  if (newIsCompleted) {
    // Completing path. Skip if the service is already completed — this
    // happens when the equipment page initiated the completion and cascaded
    // to the task, and then the UI toggles the task state again. Guards
    // against duplicate recurrence inserts.
    if (service.status === 'completed') return

    const { error: svcErr } = await supabase
      .from('equipment_scheduled_services')
      .update({
        status: 'completed',
        completed_at: nowIso,
        completed_by: userId,
      })
      .eq('id', service.id)
    if (svcErr) {
      console.error('[toggleOfficeTaskCompletion] Failed to complete service:', svcErr)
      return
    }

    // Generate next occurrence if recurring.
    if (service.is_recurring && service.recurrence_interval && service.recurrence_unit) {
      const nextDate = addInterval(
        service.scheduled_date,
        service.recurrence_interval,
        service.recurrence_unit
      )
      const parentId = service.parent_service_id ?? service.id

      // Carry the assignee forward from the task we just completed.
      const { data: existingTask } = await supabase
        .from('office_tasks')
        .select('assigned_to')
        .eq('id', taskId)
        .single()
      const carriedAssignee = (existingTask?.assigned_to as string | null) ?? null

      let newTaskId: string | null = null
      if (carriedAssignee) {
        // Fetch equipment name for the new task title.
        const { data: equipment } = await supabase
          .from('equipment')
          .select('name')
          .eq('id', service.equipment_id)
          .single()
        const equipmentName = (equipment?.name as string | undefined) ?? 'Equipment'

        const { data: newTask, error: taskCreateErr } = await supabase
          .from('office_tasks')
          .insert({
            title: `${equipmentName} — ${service.description}`,
            description: `Scheduled service for ${equipmentName}. Due: ${nextDate}`,
            assigned_to: carriedAssignee,
            due_date: nextDate,
            priority: 'Normal',
            created_by: userId,
          })
          .select('id')
          .single()
        if (taskCreateErr) {
          console.error(
            '[toggleOfficeTaskCompletion] Failed to create next-recurrence task:',
            taskCreateErr
          )
        } else {
          newTaskId = (newTask?.id as string | undefined) ?? null
        }
      }

      const { error: insertErr } = await supabase
        .from('equipment_scheduled_services')
        .insert({
          equipment_id: service.equipment_id,
          description: service.description,
          scheduled_date: nextDate,
          is_recurring: true,
          recurrence_interval: service.recurrence_interval,
          recurrence_unit: service.recurrence_unit,
          status: 'upcoming',
          parent_service_id: parentId,
          task_id: newTaskId,
          created_by: userId,
        })
      if (insertErr) {
        console.error('[toggleOfficeTaskCompletion] Failed to insert next recurrence:', insertErr)
      }
    }
  } else {
    // Uncompleting path. Only revert if the linked service is currently
    // completed; otherwise there's nothing to undo.
    if (service.status !== 'completed') return

    const { error: svcErr } = await supabase
      .from('equipment_scheduled_services')
      .update({
        status: 'upcoming',
        completed_at: null,
        completed_by: null,
      })
      .eq('id', service.id)
    if (svcErr) {
      console.error('[toggleOfficeTaskCompletion] Failed to revert service:', svcErr)
    }
  }
}
