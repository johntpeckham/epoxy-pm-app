'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  SendIcon,
  XIcon,
  CameraIcon,
  FileTextIcon,
  PlusIcon,
} from 'lucide-react'
import { Project } from '@/types'

interface AddPostPanelProps {
  project: Project
  userId: string
  onPosted: () => void
}

export default function AddPostPanel({ project, userId, onPosted }: AddPostPanelProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)

  function isPdf(file: File) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    setPhotoFiles((p) => [...p, ...selected])
    setPhotoPreviews((p) => [...p, ...selected.map((f) => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removePhoto(i: number) {
    setPhotoFiles((p) => p.filter((_, idx) => idx !== i))
    setPhotoPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  async function uploadFiles(files: File[]): Promise<string[]> {
    const supabase = createClient()
    const paths: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${project.id}/photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      console.log('[AddPostPanel] Uploading file:', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        bucket: 'post-photos',
        storagePath: path,
      })
      const { error: err } = await supabase.storage.from('post-photos').upload(path, file)
      if (err) {
        console.error('[AddPostPanel] Upload failed:', {
          message: err.message,
          name: err.name,
          error: err,
        })
        throw err
      }
      console.log('[AddPostPanel] Upload succeeded:', path)
      paths.push(path)
    }
    return paths
  }

  async function handleSubmit() {
    if (!message.trim() && !photoFiles.length) return
    setLoading(true)
    setError(null)
    const supabase = createClient()

    try {
      if (photoFiles.length > 0) {
        // Photo post (with optional caption from message field)
        const paths = await uploadFiles(photoFiles)
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'photo',
          content: { photos: paths, caption: message.trim() || undefined },
          is_pinned: false,
        })
        setPhotoFiles([])
        setPhotoPreviews([])
        if (photoInputRef.current) photoInputRef.current.value = ''
      } else {
        // Text post
        await supabase.from('feed_posts').insert({
          project_id: project.id,
          user_id: userId,
          post_type: 'text',
          content: { message: message.trim() },
          is_pinned: false,
        })
      }
      setMessage('')
      onPosted()
    } catch (err) {
      console.error('[AddPostPanel] Submit failed:', err)
      const msg =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to post'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">

      {/* Error toast */}
      {error && (
        <div className="px-4 pt-3">
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Photo thumbnails strip */}
      {photoPreviews.length > 0 && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 flex-wrap">
            {photoPreviews.map((url, i) => (
              <div
                key={i}
                className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100"
              >
                {photoFiles[i] && isPdf(photoFiles[i]) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-red-50">
                    <FileTextIcon className="w-5 h-5 text-red-400" />
                    <span className="text-[10px] text-red-400 font-medium mt-0.5">PDF</span>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={url} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-amber-400 hover:text-amber-500 transition"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">Add</span>
            </button>
          </div>
        </div>
      )}

      {/* Composer bar */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Hidden file input */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          multiple
          className="hidden"
          onChange={handlePhotoChange}
        />

        {/* Camera / attach button */}
        <button
          onClick={() => photoInputRef.current?.click()}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-amber-600 flex items-center justify-center transition"
        >
          <CameraIcon className="w-4 h-4" />
        </button>

        {/* Text input */}
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder={photoFiles.length > 0 ? 'Add a caption... (optional)' : 'Write a message...'}
          className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-colors"
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={loading || (!message.trim() && !photoFiles.length)}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white flex items-center justify-center transition"
        >
          <SendIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
