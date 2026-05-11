import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assignNextProjectNumber,
  peekNextProjectNumber,
} from '@/lib/nextProjectNumber'
import { buildProjectFilePath, copyFile } from '@/lib/storage/copyFile'
import type { EstimatingProject } from '@/components/sales/estimating/types'

/**
 * Source → Project conversion logic.
 *
 * Reads a Lead / Appointment / Job Walk row, inserts a new
 * estimating_projects row using values from the (possibly edited)
 * conversion modal, byte-copies every photo and measurement PDF into
 * the project's buckets, and finally flips the source row's status +
 * converted_to_project_id pointer.
 *
 * Every step after the project insert is rolled back if anything later
 * fails — the source row is left untouched throughout.
 */

// ─── Public types ──────────────────────────────────────────────────────

export type ConversionSourceType = 'lead' | 'appointment' | 'job_walk'

export interface ConversionProjectFields {
  name: string
  company_id: string
  email: string | null
  phone: string | null
  project_address_street: string | null
  project_address_city: string | null
  project_address_state: string | null
  project_address_zip: string | null
  description: string | null
  lead_source: string | null
  lead_category_id: string | null
  measurements: string | null
  /**
   * If null, the conversion runs assignNextProjectNumber to allocate one.
   * If non-null, the user overrode the auto-assigned number — use it
   * verbatim and do NOT increment the user's sequence.
   */
  project_number: string | null
}

export interface ConvertOpts {
  supabase: SupabaseClient
  userId: string
  sourceType: ConversionSourceType
  sourceId: string
  projectFields: ConversionProjectFields
}

export interface ConversionError {
  stage:
    | 'preflight'
    | 'project_number'
    | 'project_insert'
    | 'photo_copy'
    | 'pdf_copy'
    | 'source_update'
  message: string
  details?: Record<string, unknown>
}

export type ConversionResult =
  | { success: true; project: EstimatingProject }
  | { success: false; error: ConversionError }

// ─── Source-table configuration (kept here, not the wrapper, so call ──
//     sites don't need to know which bucket/table goes with which type). ─

interface SourceConfig {
  rowTable: string
  photoTable: string
  photoFk: string
  photoBucket: string
  pdfTable: string
  pdfFk: string
  pdfBucket: string
  /** Status to write back on the source row after a successful convert. */
  doneStatus: string
}

const SOURCE_CONFIG: Record<ConversionSourceType, SourceConfig> = {
  lead: {
    rowTable: 'leads',
    photoTable: 'lead_photos',
    photoFk: 'lead_id',
    photoBucket: 'lead-photos',
    pdfTable: 'lead_measurement_pdfs',
    pdfFk: 'lead_id',
    pdfBucket: 'lead-measurement-pdfs',
    doneStatus: 'sent_to_estimating',
  },
  appointment: {
    rowTable: 'crm_appointments',
    photoTable: 'appointment_photos',
    photoFk: 'appointment_id',
    photoBucket: 'appointment-photos',
    pdfTable: 'appointment_measurement_pdfs',
    pdfFk: 'appointment_id',
    pdfBucket: 'appointment-measurement-pdfs',
    doneStatus: 'completed',
  },
  job_walk: {
    rowTable: 'job_walks',
    photoTable: 'job_walk_photos',
    photoFk: 'job_walk_id',
    photoBucket: 'job-walk-photos',
    pdfTable: 'job_walk_measurement_pdfs',
    pdfFk: 'job_walk_id',
    // Asymmetric: job walk's PDF bucket doesn't end in '-pdfs'. Confirmed
    // against the live MeasurementsCard CONFIG entry.
    pdfBucket: 'job-walk-measurements',
    doneStatus: 'sent_to_estimating',
  },
}

const PROJECT_PHOTO_BUCKET = 'project-photos'
const PROJECT_PHOTO_TABLE = 'project_photos'
const PROJECT_PDF_BUCKET = 'estimating-project-files'
const PROJECT_PDF_TABLE = 'estimating_project_measurement_pdfs'

const MAX_PROJECT_NUMBER_RETRIES = 5

// ─── Source row shape (only the fields we actually read) ──────────────

interface SourceRow {
  id: string
  converted_to_project_id: string | null
  // Appointments use timestamptz so the prefix can render the time too.
  // Leads/Job Walks use date — we don't add a prefix for them anyway.
  date: string | null
}

interface SourcePhotoRow {
  id: string
  image_url: string
  storage_path: string
  caption: string | null
  sort_order: number
}

interface SourcePdfRow {
  id: string
  file_name: string
  file_url: string
  storage_path: string
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Build the "Originally scheduled visit: …" prefix for Appointment
 * conversions. Returns null if the source has no date — we just skip the
 * prefix in that case.
 */
function buildAppointmentPrefix(dateTimestamptz: string | null): string | null {
  if (!dateTimestamptz) return null
  const d = new Date(dateTimestamptz)
  if (Number.isNaN(d.getTime())) return null
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `Originally scheduled visit: ${dateStr} at ${timeStr}`
}

/**
 * Combine the optional Appointment prefix with the user-edited
 * description. Two newlines between them so the prefix reads as its own
 * paragraph at the top of the project's details. Returns null if both
 * pieces are absent — keeping the column NULL is friendlier to "is
 * details empty" checks downstream than an empty string.
 */
function composeDescription(
  prefix: string | null,
  edited: string | null
): string | null {
  const trimmedEdited = edited?.trim() || null
  if (prefix && trimmedEdited) return `${prefix}\n\n${trimmedEdited}`
  if (prefix) return prefix
  return trimmedEdited
}

/** Convenience: standardize the supabase-error → ConversionError mapping. */
function asConversionError(
  stage: ConversionError['stage'],
  message: string,
  raw?: unknown
): ConversionError {
  const err: ConversionError = { stage, message }
  if (raw && typeof raw === 'object') {
    err.details = raw as Record<string, unknown>
  }
  return err
}

// ─── Main entry point ─────────────────────────────────────────────────

export async function convertSourceToProject(
  opts: ConvertOpts
): Promise<ConversionResult> {
  const { supabase, userId, sourceType, sourceId, projectFields } = opts
  const cfg = SOURCE_CONFIG[sourceType]

  // ─── Step 1 — Pre-flight ────────────────────────────────────────────
  // Load the source row to (a) check it isn't already converted and
  // (b) read the timestamp we'll need for the Appointment prefix.
  // Photos and PDFs are also fetched here so we know upfront what we'll
  // be copying — and so a query error here aborts before we touch any
  // project tables.
  const { data: sourceRowRaw, error: sourceErr } = await supabase
    .from(cfg.rowTable)
    .select('id, converted_to_project_id, date')
    .eq('id', sourceId)
    .maybeSingle()

  if (sourceErr || !sourceRowRaw) {
    console.error('[projectConversion] Source load failed:', {
      sourceType,
      sourceId,
      code: sourceErr?.code,
      message: sourceErr?.message,
      hint: sourceErr?.hint,
      details: sourceErr?.details,
    })
    return {
      success: false,
      error: asConversionError(
        'preflight',
        sourceErr?.message ?? 'Source row not found',
        sourceErr ?? undefined
      ),
    }
  }
  const sourceRow = sourceRowRaw as SourceRow

  if (sourceRow.converted_to_project_id) {
    return {
      success: false,
      error: asConversionError(
        'preflight',
        'This source has already been converted to a project.'
      ),
    }
  }

  // Photos + PDFs to copy. Empty results are normal and not an error.
  const { data: photoRows, error: photosErr } = await supabase
    .from(cfg.photoTable)
    .select('id, image_url, storage_path, caption, sort_order')
    .eq(cfg.photoFk, sourceId)

  if (photosErr) {
    console.error('[projectConversion] Photos load failed:', {
      code: photosErr.code,
      message: photosErr.message,
      hint: photosErr.hint,
      details: photosErr.details,
    })
    return {
      success: false,
      error: asConversionError('preflight', photosErr.message, photosErr),
    }
  }

  const { data: pdfRows, error: pdfsErr } = await supabase
    .from(cfg.pdfTable)
    .select('id, file_name, file_url, storage_path')
    .eq(cfg.pdfFk, sourceId)

  if (pdfsErr) {
    console.error('[projectConversion] PDFs load failed:', {
      code: pdfsErr.code,
      message: pdfsErr.message,
      hint: pdfsErr.hint,
      details: pdfsErr.details,
    })
    return {
      success: false,
      error: asConversionError('preflight', pdfsErr.message, pdfsErr),
    }
  }

  const sourcePhotos = (photoRows ?? []) as SourcePhotoRow[]
  const sourcePdfs = (pdfRows ?? []) as SourcePdfRow[]

  // ─── Step 2 — Compose the project's description ─────────────────────
  // Done before the insert so we can write it in a single round trip
  // rather than insert-then-update.
  const appointmentPrefix =
    sourceType === 'appointment'
      ? buildAppointmentPrefix(sourceRow.date)
      : null
  const finalDescription = composeDescription(
    appointmentPrefix,
    projectFields.description
  )

  // ─── Step 3 — Reserve / accept the project number ───────────────────
  // If the user manually overrode the number in the modal, use it
  // verbatim (no sequence touch). Otherwise, atomically reserve the
  // next number — and retry on 23505 collisions up to a small bound,
  // mirroring NewProjectModal's behavior.
  const userOverrodeNumber = projectFields.project_number != null
  let assignedNumber: string
  if (userOverrodeNumber) {
    assignedNumber = projectFields.project_number as string
  } else {
    try {
      assignedNumber = await assignNextProjectNumber(supabase, userId)
    } catch (err) {
      console.error('[projectConversion] assignNextProjectNumber failed:', err)
      return {
        success: false,
        error: asConversionError(
          'project_number',
          err instanceof Error ? err.message : 'Failed to reserve project number'
        ),
      }
    }
  }

  // ─── Step 4 — Insert the new project row ────────────────────────────
  // Insert is wrapped in a retry loop only when we're auto-assigning AND
  // the failure is a 23505 (duplicate project_number) — that covers the
  // narrow window where another concurrent insert grabbed the same
  // number we just reserved. Manual overrides surface the error without
  // retry (the user explicitly picked that number).
  let attempt = 0
  let newProject: EstimatingProject | null = null
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const insertPayload = {
      company_id: projectFields.company_id,
      name: projectFields.name,
      description: finalDescription,
      email: projectFields.email,
      phone: projectFields.phone,
      project_address_street: projectFields.project_address_street,
      project_address_city: projectFields.project_address_city,
      project_address_state: projectFields.project_address_state,
      project_address_zip: projectFields.project_address_zip,
      project_number: assignedNumber,
      lead_source: projectFields.lead_source,
      lead_category_id: projectFields.lead_category_id,
      measurements: projectFields.measurements,
      status: 'active' as const,
      source: sourceType,
      source_ref_id: sourceId,
      converted_at: new Date().toISOString(),
      created_by: userId,
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('estimating_projects')
      .insert(insertPayload)
      .select('*')
      .single()

    if (!insertErr && inserted) {
      newProject = inserted as EstimatingProject
      break
    }

    const isDup =
      insertErr?.code === '23505' ||
      (insertErr?.message ?? '').toLowerCase().includes('duplicate')

    if (isDup && userOverrodeNumber) {
      return {
        success: false,
        error: asConversionError(
          'project_insert',
          `Project number ${assignedNumber} is already in use. Please pick a different number.`,
          insertErr ?? undefined
        ),
      }
    }
    if (isDup && !userOverrodeNumber) {
      attempt += 1
      if (attempt >= MAX_PROJECT_NUMBER_RETRIES) {
        return {
          success: false,
          error: asConversionError(
            'project_insert',
            `Project number kept colliding after ${MAX_PROJECT_NUMBER_RETRIES} attempts. Try again in a moment.`,
            insertErr ?? undefined
          ),
        }
      }
      try {
        // Refresh the peek so the next loop iteration uses the latest.
        // assignNextProjectNumber will actually do the increment; this
        // call is informational. If peek fails it's non-fatal — the next
        // assign will still work.
        await peekNextProjectNumber(supabase, userId)
      } catch {
        // ignore
      }
      try {
        assignedNumber = await assignNextProjectNumber(supabase, userId)
      } catch (err) {
        console.error('[projectConversion] assign retry failed:', err)
        return {
          success: false,
          error: asConversionError(
            'project_number',
            err instanceof Error ? err.message : 'Failed to reserve project number'
          ),
        }
      }
      continue
    }

    // Some other insert error — abort, no rollback needed (nothing to
    // undo yet).
    console.error('[projectConversion] Project insert failed:', {
      code: insertErr?.code,
      message: insertErr?.message,
      hint: insertErr?.hint,
      details: insertErr?.details,
    })
    return {
      success: false,
      error: asConversionError(
        'project_insert',
        insertErr?.message ?? 'Failed to create project',
        insertErr ?? undefined
      ),
    }
  }

  if (!newProject) {
    // Defensive — the loop above either returns or sets newProject.
    return {
      success: false,
      error: asConversionError('project_insert', 'Project insert returned no row'),
    }
  }

  // ─── Step 5+6 — Copy photos and PDFs ────────────────────────────────
  // Track every successfully-inserted row + uploaded storage path so the
  // rollback helper can undo them in reverse if a later step fails.
  const insertedPhotoIds: string[] = []
  const insertedPhotoPaths: string[] = []
  const insertedPdfIds: string[] = []
  const insertedPdfPaths: string[] = []

  async function rollback(): Promise<void> {
    // Best-effort cleanup. Each call logs its own error and we never
    // throw out of here — the user-facing error is whatever caused the
    // original failure.
    for (const id of insertedPhotoIds) {
      const { error: delErr } = await supabase
        .from(PROJECT_PHOTO_TABLE)
        .delete()
        .eq('id', id)
      if (delErr) {
        console.error('[projectConversion] Rollback photo row delete failed:', {
          id,
          code: delErr.code,
          message: delErr.message,
          hint: delErr.hint,
          details: delErr.details,
        })
      }
    }
    if (insertedPhotoPaths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from(PROJECT_PHOTO_BUCKET)
        .remove(insertedPhotoPaths)
      if (storageErr) {
        console.error('[projectConversion] Rollback photo storage remove failed:', {
          paths: insertedPhotoPaths,
          message: (storageErr as { message?: string }).message,
        })
      }
    }
    for (const id of insertedPdfIds) {
      const { error: delErr } = await supabase
        .from(PROJECT_PDF_TABLE)
        .delete()
        .eq('id', id)
      if (delErr) {
        console.error('[projectConversion] Rollback PDF row delete failed:', {
          id,
          code: delErr.code,
          message: delErr.message,
          hint: delErr.hint,
          details: delErr.details,
        })
      }
    }
    if (insertedPdfPaths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from(PROJECT_PDF_BUCKET)
        .remove(insertedPdfPaths)
      if (storageErr) {
        console.error('[projectConversion] Rollback PDF storage remove failed:', {
          paths: insertedPdfPaths,
          message: (storageErr as { message?: string }).message,
        })
      }
    }
    // Project row last so the cascade FKs don't pull anything still
    // referenced from underneath us during the earlier deletes.
    if (newProject) {
      const { error: projDelErr } = await supabase
        .from('estimating_projects')
        .delete()
        .eq('id', newProject.id)
      if (projDelErr) {
        console.error('[projectConversion] Rollback project delete failed:', {
          projectId: newProject.id,
          code: projDelErr.code,
          message: projDelErr.message,
          hint: projDelErr.hint,
          details: projDelErr.details,
        })
      }
    }
  }

  // ─── Step 5 — Copy photos ────────────────────────────────────────────
  for (const photo of sourcePhotos) {
    // Recover the original filename from the storage_path so the new
    // path keeps the same extension. We don't store the original
    // filename for photos, so this is our only signal — and it's good
    // enough since the buildProjectFilePath helper just needs an
    // extension to preserve.
    const lastSlash = photo.storage_path.lastIndexOf('/')
    const originalFileName =
      lastSlash >= 0
        ? photo.storage_path.slice(lastSlash + 1)
        : photo.storage_path
    const newPath = buildProjectFilePath(newProject.id, originalFileName)

    const copyResult = await copyFile({
      supabase,
      sourceBucket: cfg.photoBucket,
      sourcePath: photo.storage_path,
      destBucket: PROJECT_PHOTO_BUCKET,
      destPath: newPath,
    })
    if (!copyResult.success) {
      await rollback()
      return {
        success: false,
        error: asConversionError(
          'photo_copy',
          `Failed to copy photo (${copyResult.stage}): ${
            (copyResult.error as { message?: string }).message ?? 'unknown error'
          }`,
          copyResult.error as Record<string, unknown>
        ),
      }
    }

    const { data: insertedPhoto, error: insertErr } = await supabase
      .from(PROJECT_PHOTO_TABLE)
      .insert({
        project_id: newProject.id,
        image_url: copyResult.publicUrl,
        storage_path: newPath,
        caption: photo.caption,
        sort_order: photo.sort_order,
        created_by: userId,
      })
      .select('id')
      .single()

    if (insertErr || !insertedPhoto) {
      console.error('[projectConversion] project_photos insert failed:', {
        code: insertErr?.code,
        message: insertErr?.message,
        hint: insertErr?.hint,
        details: insertErr?.details,
      })
      // The file is in the bucket but the row never landed — track the
      // path so rollback removes it, then bail.
      insertedPhotoPaths.push(newPath)
      await rollback()
      return {
        success: false,
        error: asConversionError(
          'photo_copy',
          insertErr?.message ?? 'Failed to insert project photo row',
          insertErr ?? undefined
        ),
      }
    }

    insertedPhotoIds.push((insertedPhoto as { id: string }).id)
    insertedPhotoPaths.push(newPath)
  }

  // ─── Step 6 — Copy measurement PDFs ──────────────────────────────────
  for (const pdf of sourcePdfs) {
    const newPath = buildProjectFilePath(newProject.id, pdf.file_name)

    const copyResult = await copyFile({
      supabase,
      sourceBucket: cfg.pdfBucket,
      sourcePath: pdf.storage_path,
      destBucket: PROJECT_PDF_BUCKET,
      destPath: newPath,
    })
    if (!copyResult.success) {
      await rollback()
      return {
        success: false,
        error: asConversionError(
          'pdf_copy',
          `Failed to copy measurement PDF (${copyResult.stage}): ${
            (copyResult.error as { message?: string }).message ?? 'unknown error'
          }`,
          copyResult.error as Record<string, unknown>
        ),
      }
    }

    const { data: insertedPdf, error: insertErr } = await supabase
      .from(PROJECT_PDF_TABLE)
      .insert({
        project_id: newProject.id,
        file_name: pdf.file_name,
        file_url: copyResult.publicUrl,
        storage_path: newPath,
        // Converted PDFs are site measurements — they came from a Lead /
        // Appointment / Job Walk, not from the Takeoff tool.
        source: 'site',
        created_by: userId,
      })
      .select('id')
      .single()

    if (insertErr || !insertedPdf) {
      console.error(
        '[projectConversion] estimating_project_measurement_pdfs insert failed:',
        {
          code: insertErr?.code,
          message: insertErr?.message,
          hint: insertErr?.hint,
          details: insertErr?.details,
        }
      )
      insertedPdfPaths.push(newPath)
      await rollback()
      return {
        success: false,
        error: asConversionError(
          'pdf_copy',
          insertErr?.message ?? 'Failed to insert project measurement PDF row',
          insertErr ?? undefined
        ),
      }
    }

    insertedPdfIds.push((insertedPdf as { id: string }).id)
    insertedPdfPaths.push(newPath)
  }

  // ─── Step 7 — Mark the source row converted ─────────────────────────
  // Two columns: converted_to_project_id links back to the project
  // (typed FK with ON DELETE SET NULL, see 20260547), and status is
  // bumped to its per-type "done" value. If this update fails we have
  // to roll back everything because the source would otherwise be
  // perceived as "not yet converted" while a real project row exists.
  const { error: sourceUpdateErr } = await supabase
    .from(cfg.rowTable)
    .update({
      converted_to_project_id: newProject.id,
      status: cfg.doneStatus,
    })
    .eq('id', sourceId)

  if (sourceUpdateErr) {
    console.error('[projectConversion] Source status update failed:', {
      sourceType,
      sourceId,
      code: sourceUpdateErr.code,
      message: sourceUpdateErr.message,
      hint: sourceUpdateErr.hint,
      details: sourceUpdateErr.details,
    })
    await rollback()
    return {
      success: false,
      error: asConversionError(
        'source_update',
        sourceUpdateErr.message ?? 'Failed to update source row',
        sourceUpdateErr
      ),
    }
  }

  return { success: true, project: newProject }
}
