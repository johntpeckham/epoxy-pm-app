import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Storage helpers used by the Lead/Appointment/Job Walk → Project
 * conversion flow.
 *
 * The conversion COPIES files (bytes) from the source's bucket to the
 * project's bucket so each row owns its own storage object. We can't use
 * `storage.objects.copy` from the client because the public API doesn't
 * expose that — instead we download a Blob and re-upload it. Each call
 * keeps the original file in place so deleting the source row later
 * doesn't affect the converted project.
 */

interface SupabaseLikeError {
  message?: string
  details?: unknown
  hint?: unknown
  code?: unknown
}

export interface CopyFileSuccess {
  success: true
  /** Public URL of the newly-uploaded object in destBucket. */
  publicUrl: string
}

export interface CopyFileFailure {
  success: false
  /** Which step failed — useful for distinguishing download vs upload bugs. */
  stage: 'download' | 'upload' | 'public_url'
  error: SupabaseLikeError | Error | { message: string }
}

export type CopyFileResult = CopyFileSuccess | CopyFileFailure

interface CopyFileOpts {
  supabase: SupabaseClient
  sourceBucket: string
  sourcePath: string
  destBucket: string
  destPath: string
}

/**
 * Download bytes from one bucket and upload them to another, leaving the
 * source object untouched. Returns the destination's public URL on
 * success.
 */
export async function copyFile({
  supabase,
  sourceBucket,
  sourcePath,
  destBucket,
  destPath,
}: CopyFileOpts): Promise<CopyFileResult> {
  // 1. Download the source object as a Blob.
  const { data: blob, error: downloadErr } = await supabase.storage
    .from(sourceBucket)
    .download(sourcePath)
  if (downloadErr || !blob) {
    console.error('[copyFile] Download failed:', {
      sourceBucket,
      sourcePath,
      code: (downloadErr as SupabaseLikeError | null)?.code,
      message: (downloadErr as SupabaseLikeError | null)?.message,
      hint: (downloadErr as SupabaseLikeError | null)?.hint,
      details: (downloadErr as SupabaseLikeError | null)?.details,
    })
    return {
      success: false,
      stage: 'download',
      error: (downloadErr as SupabaseLikeError) ?? {
        message: 'Download returned no data',
      },
    }
  }

  // 2. Re-upload to the destination bucket. upsert:false so we never
  //    silently clobber an existing object — collisions on the destPath
  //    indicate a buildProjectFilePath bug and should surface loudly.
  const { error: uploadErr } = await supabase.storage
    .from(destBucket)
    .upload(destPath, blob, {
      upsert: false,
      contentType: blob.type || undefined,
    })
  if (uploadErr) {
    console.error('[copyFile] Upload failed:', {
      destBucket,
      destPath,
      code: (uploadErr as SupabaseLikeError).code,
      message: (uploadErr as SupabaseLikeError).message,
      hint: (uploadErr as SupabaseLikeError).hint,
      details: (uploadErr as SupabaseLikeError).details,
    })
    return {
      success: false,
      stage: 'upload',
      error: uploadErr as SupabaseLikeError,
    }
  }

  // 3. Resolve the new public URL. getPublicUrl is synchronous-style and
  //    doesn't return an error object, but if `publicUrl` is missing we
  //    treat that as a failure so the caller can roll back.
  const { data: urlData } = supabase.storage.from(destBucket).getPublicUrl(destPath)
  if (!urlData?.publicUrl) {
    console.error('[copyFile] getPublicUrl returned no URL:', {
      destBucket,
      destPath,
    })
    return {
      success: false,
      stage: 'public_url',
      error: { message: 'getPublicUrl returned no URL' },
    }
  }

  return { success: true, publicUrl: urlData.publicUrl }
}

/**
 * Build a destination path for files copied into a project bucket
 * (project-photos or estimating-project-files). Mirrors the path shape
 * used by PhotosCard / MeasurementsCard for fresh uploads:
 *
 *   `${projectId}/${timestamp}-${random}.${ext}`
 *
 * The extension is preserved so existing card components can render
 * thumbnails the same way; the random suffix prevents collisions when
 * a project converts from multiple sources or re-converts with
 * lookalike filenames.
 */
export function buildProjectFilePath(
  projectId: string,
  originalFileName: string
): string {
  const dotIndex = originalFileName.lastIndexOf('.')
  const ext =
    dotIndex >= 0 && dotIndex < originalFileName.length - 1
      ? originalFileName.slice(dotIndex + 1).toLowerCase()
      : 'bin'
  const random = Math.random().toString(36).slice(2)
  return `${projectId}/${Date.now()}-${random}.${ext}`
}
