import type { SupabaseClient } from '@supabase/supabase-js'
import { buildProjectFilePath, copyFile } from '@/lib/storage/copyFile'

/**
 * Source → Source lateral conversion logic.
 *
 * Used by the six "Push to..." flows between Lead / Appointment / Job
 * Walk. Mirrors the convertSourceToProject pattern from
 * `src/lib/projectConversion.ts` but for lateral targets — so it skips:
 *
 *   - project-number reservation (lateral targets have no project_number)
 *   - description-prefix composition (project_details copies verbatim)
 *   - duplicate-number retry loop
 *
 * The wrapper modal composes the target insert payload (whatever shape
 * the target table expects) and hands it to this utility. We then:
 *
 *   1. Insert the target row
 *   2. Byte-copy each source photo into the target's photo bucket and
 *      insert the matching target photo row
 *   3. Byte-copy each measurement PDF the same way
 *   4. Flip the source row's status (and, where the CHECK constraint
 *      allows it, write pushed_to + pushed_ref_id)
 *
 * On any failure after step 1 we roll back in reverse: delete copied
 * storage objects, delete inserted photo/PDF rows, delete the new
 * target row. Source row stays untouched until step 4 succeeds.
 */

export type LateralSourceType = 'lead' | 'appointment' | 'job_walk'
export type LateralTargetType = 'lead' | 'appointment' | 'job_walk'

interface SourceConfig {
  rowTable: string
  photoTable: string
  photoFk: string
  photoBucket: string
  pdfTable: string
  pdfFk: string
  pdfBucket: string
  /** Status value written back to the source row after a successful push. */
  doneStatus: string
}

interface TargetConfig {
  rowTable: string
  photoTable: string
  photoFk: string
  photoBucket: string
  pdfTable: string
  pdfFk: string
  pdfBucket: string
}

const SOURCE_CONFIG: Record<LateralSourceType, SourceConfig> = {
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
    // Asymmetric: job walk's PDF bucket doesn't end in '-pdfs'. Matches
    // the convention used by projectConversion.ts + MeasurementsCard.
    pdfBucket: 'job-walk-measurements',
    doneStatus: 'sent_to_estimating',
  },
}

const TARGET_CONFIG: Record<LateralTargetType, TargetConfig> = {
  lead: {
    rowTable: 'leads',
    photoTable: 'lead_photos',
    photoFk: 'lead_id',
    photoBucket: 'lead-photos',
    pdfTable: 'lead_measurement_pdfs',
    pdfFk: 'lead_id',
    pdfBucket: 'lead-measurement-pdfs',
  },
  appointment: {
    rowTable: 'crm_appointments',
    photoTable: 'appointment_photos',
    photoFk: 'appointment_id',
    photoBucket: 'appointment-photos',
    pdfTable: 'appointment_measurement_pdfs',
    pdfFk: 'appointment_id',
    pdfBucket: 'appointment-measurement-pdfs',
  },
  job_walk: {
    rowTable: 'job_walks',
    photoTable: 'job_walk_photos',
    photoFk: 'job_walk_id',
    photoBucket: 'job-walk-photos',
    pdfTable: 'job_walk_measurement_pdfs',
    pdfFk: 'job_walk_id',
    pdfBucket: 'job-walk-measurements',
  },
}

export interface LateralConvertOpts {
  supabase: SupabaseClient
  userId: string
  sourceType: LateralSourceType
  sourceId: string
  targetType: LateralTargetType
  /**
   * Pre-composed insert payload for the target table. The wrapper modal
   * is responsible for matching the target's column shape (e.g.
   * 'scheduled' status + ISO datetime for appointments, plain date for
   * lead/job_walk). The utility never edits these fields — it just
   * forwards them into the insert.
   */
  targetInsertPayload: Record<string, unknown>
  /**
   * Optional value to write to `source.pushed_to`. Skipped when null —
   * the caller should pass null whenever the source table's
   * CHECK(pushed_to) constraint forbids the lateral direction (e.g.
   * crm_appointments.pushed_to does not permit 'lead'). When provided
   * we also write pushed_ref_id = targetId.
   */
  sourcePushedToValue: string | null
}

export interface LateralConversionError {
  stage:
    | 'target_insert'
    | 'photo_copy'
    | 'pdf_copy'
    | 'source_update'
  message: string
  details?: Record<string, unknown>
}

export type LateralConversionResult =
  | { success: true; targetId: string }
  | { success: false; error: LateralConversionError }

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

function asError(
  stage: LateralConversionError['stage'],
  message: string,
  raw?: unknown
): LateralConversionError {
  const err: LateralConversionError = { stage, message }
  if (raw && typeof raw === 'object') {
    err.details = raw as Record<string, unknown>
  }
  return err
}

export async function convertSourceLateral(
  opts: LateralConvertOpts
): Promise<LateralConversionResult> {
  const {
    supabase,
    userId,
    sourceType,
    sourceId,
    targetType,
    targetInsertPayload,
    sourcePushedToValue,
  } = opts
  const srcCfg = SOURCE_CONFIG[sourceType]
  const tgtCfg = TARGET_CONFIG[targetType]

  // ─── Step 1 — Insert the target row ─────────────────────────────────
  // Done first so a failed insert aborts before we touch any storage.
  // No rollback work yet at this stage — nothing has been created.
  const { data: inserted, error: insertErr } = await supabase
    .from(tgtCfg.rowTable)
    .insert(targetInsertPayload)
    .select('id')
    .single()

  if (insertErr || !inserted) {
    console.error('[lateralConversion] Target insert failed:', {
      sourceType,
      targetType,
      code: insertErr?.code,
      message: insertErr?.message,
      hint: insertErr?.hint,
      details: insertErr?.details,
    })
    return {
      success: false,
      error: asError(
        'target_insert',
        insertErr?.message ?? 'Failed to create target row',
        insertErr ?? undefined
      ),
    }
  }
  const targetId = (inserted as { id: string }).id

  // ─── Step 2 — Load source photos/PDFs to copy ───────────────────────
  // Empty lists are normal (a Lead may have no photos) and not an error.
  const { data: photoRows, error: photosErr } = await supabase
    .from(srcCfg.photoTable)
    .select('id, image_url, storage_path, caption, sort_order')
    .eq(srcCfg.photoFk, sourceId)

  if (photosErr) {
    console.error('[lateralConversion] Source photos load failed:', {
      code: photosErr.code,
      message: photosErr.message,
      hint: photosErr.hint,
      details: photosErr.details,
    })
    await deleteTargetRow(supabase, tgtCfg.rowTable, targetId)
    return {
      success: false,
      error: asError('photo_copy', photosErr.message, photosErr),
    }
  }

  const { data: pdfRows, error: pdfsErr } = await supabase
    .from(srcCfg.pdfTable)
    .select('id, file_name, file_url, storage_path')
    .eq(srcCfg.pdfFk, sourceId)

  if (pdfsErr) {
    console.error('[lateralConversion] Source PDFs load failed:', {
      code: pdfsErr.code,
      message: pdfsErr.message,
      hint: pdfsErr.hint,
      details: pdfsErr.details,
    })
    await deleteTargetRow(supabase, tgtCfg.rowTable, targetId)
    return {
      success: false,
      error: asError('pdf_copy', pdfsErr.message, pdfsErr),
    }
  }

  const sourcePhotos = (photoRows ?? []) as SourcePhotoRow[]
  const sourcePdfs = (pdfRows ?? []) as SourcePdfRow[]

  // Track everything we successfully create so rollback can undo it in
  // reverse if a later step fails.
  const insertedPhotoIds: string[] = []
  const insertedPhotoPaths: string[] = []
  const insertedPdfIds: string[] = []
  const insertedPdfPaths: string[] = []

  async function rollback(): Promise<void> {
    // Best-effort cleanup. Each call logs its own error; we never throw
    // out of here — the user-facing error is whatever caused the original
    // failure.
    for (const id of insertedPhotoIds) {
      const { error: delErr } = await supabase
        .from(tgtCfg.photoTable)
        .delete()
        .eq('id', id)
      if (delErr) {
        console.error('[lateralConversion] Rollback photo row delete failed:', {
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
        .from(tgtCfg.photoBucket)
        .remove(insertedPhotoPaths)
      if (storageErr) {
        console.error('[lateralConversion] Rollback photo storage remove failed:', {
          paths: insertedPhotoPaths,
          message: (storageErr as { message?: string }).message,
        })
      }
    }
    for (const id of insertedPdfIds) {
      const { error: delErr } = await supabase
        .from(tgtCfg.pdfTable)
        .delete()
        .eq('id', id)
      if (delErr) {
        console.error('[lateralConversion] Rollback PDF row delete failed:', {
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
        .from(tgtCfg.pdfBucket)
        .remove(insertedPdfPaths)
      if (storageErr) {
        console.error('[lateralConversion] Rollback PDF storage remove failed:', {
          paths: insertedPdfPaths,
          message: (storageErr as { message?: string }).message,
        })
      }
    }
    await deleteTargetRow(supabase, tgtCfg.rowTable, targetId)
  }

  // ─── Step 3 — Copy photos ────────────────────────────────────────────
  for (const photo of sourcePhotos) {
    const lastSlash = photo.storage_path.lastIndexOf('/')
    const originalFileName =
      lastSlash >= 0
        ? photo.storage_path.slice(lastSlash + 1)
        : photo.storage_path
    // buildProjectFilePath is named "Project" but its implementation is
    // generic (`${id}/${timestamp}-${random}.${ext}`) — safe to reuse.
    const newPath = buildProjectFilePath(targetId, originalFileName)

    const copyResult = await copyFile({
      supabase,
      sourceBucket: srcCfg.photoBucket,
      sourcePath: photo.storage_path,
      destBucket: tgtCfg.photoBucket,
      destPath: newPath,
    })
    if (!copyResult.success) {
      await rollback()
      return {
        success: false,
        error: asError(
          'photo_copy',
          `Failed to copy photo (${copyResult.stage}): ${
            (copyResult.error as { message?: string }).message ?? 'unknown error'
          }`,
          copyResult.error as Record<string, unknown>
        ),
      }
    }

    const { data: insertedPhoto, error: photoInsertErr } = await supabase
      .from(tgtCfg.photoTable)
      .insert({
        [tgtCfg.photoFk]: targetId,
        image_url: copyResult.publicUrl,
        storage_path: newPath,
        caption: photo.caption,
        sort_order: photo.sort_order,
        created_by: userId,
      })
      .select('id')
      .single()

    if (photoInsertErr || !insertedPhoto) {
      console.error('[lateralConversion] Target photo insert failed:', {
        code: photoInsertErr?.code,
        message: photoInsertErr?.message,
        hint: photoInsertErr?.hint,
        details: photoInsertErr?.details,
      })
      // File is in the bucket but row never landed — track the path so
      // rollback removes it.
      insertedPhotoPaths.push(newPath)
      await rollback()
      return {
        success: false,
        error: asError(
          'photo_copy',
          photoInsertErr?.message ?? 'Failed to insert target photo row',
          photoInsertErr ?? undefined
        ),
      }
    }

    insertedPhotoIds.push((insertedPhoto as { id: string }).id)
    insertedPhotoPaths.push(newPath)
  }

  // ─── Step 4 — Copy measurement PDFs ──────────────────────────────────
  for (const pdf of sourcePdfs) {
    const newPath = buildProjectFilePath(targetId, pdf.file_name)

    const copyResult = await copyFile({
      supabase,
      sourceBucket: srcCfg.pdfBucket,
      sourcePath: pdf.storage_path,
      destBucket: tgtCfg.pdfBucket,
      destPath: newPath,
    })
    if (!copyResult.success) {
      await rollback()
      return {
        success: false,
        error: asError(
          'pdf_copy',
          `Failed to copy measurement PDF (${copyResult.stage}): ${
            (copyResult.error as { message?: string }).message ?? 'unknown error'
          }`,
          copyResult.error as Record<string, unknown>
        ),
      }
    }

    const { data: insertedPdf, error: pdfInsertErr } = await supabase
      .from(tgtCfg.pdfTable)
      .insert({
        [tgtCfg.pdfFk]: targetId,
        file_name: pdf.file_name,
        file_url: copyResult.publicUrl,
        storage_path: newPath,
        created_by: userId,
      })
      .select('id')
      .single()

    if (pdfInsertErr || !insertedPdf) {
      console.error('[lateralConversion] Target PDF insert failed:', {
        code: pdfInsertErr?.code,
        message: pdfInsertErr?.message,
        hint: pdfInsertErr?.hint,
        details: pdfInsertErr?.details,
      })
      insertedPdfPaths.push(newPath)
      await rollback()
      return {
        success: false,
        error: asError(
          'pdf_copy',
          pdfInsertErr?.message ?? 'Failed to insert target PDF row',
          pdfInsertErr ?? undefined
        ),
      }
    }

    insertedPdfIds.push((insertedPdf as { id: string }).id)
    insertedPdfPaths.push(newPath)
  }

  // ─── Step 5 — Flip the source row's status (and pushed_to if allowed) ─
  // Spec: status always flips. pushed_to / pushed_ref_id are written
  // only when the source table's CHECK(pushed_to) allows the lateral
  // value (caller decides; null means skip).
  const sourceUpdate: Record<string, unknown> = { status: srcCfg.doneStatus }
  if (sourcePushedToValue !== null) {
    sourceUpdate.pushed_to = sourcePushedToValue
    sourceUpdate.pushed_ref_id = targetId
  }

  const { error: sourceUpdateErr } = await supabase
    .from(srcCfg.rowTable)
    .update(sourceUpdate)
    .eq('id', sourceId)

  if (sourceUpdateErr) {
    console.error('[lateralConversion] Source status update failed:', {
      sourceType,
      sourceId,
      code: sourceUpdateErr.code,
      message: sourceUpdateErr.message,
      hint: sourceUpdateErr.hint,
      details: sourceUpdateErr.details,
    })
    // Per Section E of the spec: the target row + copied files already
    // exist and the user is about to be navigated to them. Don't rollback
    // storage at this stage — just surface the error so dev tools see it.
    // Return success with the targetId so the modal can still navigate.
    return {
      success: false,
      error: asError(
        'source_update',
        sourceUpdateErr.message ?? 'Failed to update source row',
        sourceUpdateErr
      ),
    }
  }

  return { success: true, targetId }
}

async function deleteTargetRow(
  supabase: SupabaseClient,
  table: string,
  id: string
): Promise<void> {
  const { error: delErr } = await supabase.from(table).delete().eq('id', id)
  if (delErr) {
    console.error('[lateralConversion] Rollback target row delete failed:', {
      table,
      id,
      code: delErr.code,
      message: delErr.message,
      hint: delErr.hint,
      details: delErr.details,
    })
  }
}
