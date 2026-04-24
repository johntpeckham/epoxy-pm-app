'use client'

import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EstimatingProjectPdf } from './types'

export const MEASUREMENT_PDF_BUCKET = 'estimating-project-files'

export function useUploadMeasurementPdf(projectId: string) {
  return useCallback(
    async (file: File): Promise<EstimatingProjectPdf> => {
      const supabase = createClient()
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const path = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from(MEASUREMENT_PDF_BUCKET)
        .upload(path, file, {
          contentType: file.type || 'application/pdf',
        })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage
        .from(MEASUREMENT_PDF_BUCKET)
        .getPublicUrl(path)

      const { data: inserted, error: insertErr } = await supabase
        .from('estimating_project_measurement_pdfs')
        .insert({
          project_id: projectId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          storage_path: path,
        })
        .select('*')
        .single()
      if (insertErr) throw insertErr
      if (!inserted) throw new Error('Insert returned no row')

      return inserted as EstimatingProjectPdf
    },
    [projectId]
  )
}
