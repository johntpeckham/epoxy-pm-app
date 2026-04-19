'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeftIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
  GripVerticalIcon,
  ImageIcon,
  PencilIcon,
  FileDownIcon,
} from 'lucide-react'
import SOPImageMarkup from '@/components/sops/SOPImageMarkup'

interface StepImage {
  id: string
  sop_step_id: string
  image_url: string
  markup_data: Annotation[] | null
  sort_order: number
}

interface Annotation {
  type: 'arrow' | 'circle' | 'text' | 'freeform'
  points: number[][]
  strokeWidth: number
  text?: string
}

interface Step {
  id: string
  sop_id: string
  step_number: number
  text_content: string
  images: StepImage[]
}

interface Division {
  id: string
  name: string
  type: 'office' | 'field'
}

interface Props {
  userId: string
  sopId?: string
}

function renderAnnotationsToCtx(ctx: CanvasRenderingContext2D, annotations: Annotation[], w: number, h: number, scaleX = 1, scaleY = 1) {
  for (const a of annotations) {
    ctx.strokeStyle = '#f59e0b'
    ctx.fillStyle = '#f59e0b'
    ctx.lineWidth = a.strokeWidth * scaleX
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const pts = a.points.map(([x, y]) => [x * scaleX, y * scaleY])

    if (a.type === 'freeform' && pts.length > 1) {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.stroke()
    } else if (a.type === 'arrow' && pts.length === 2) {
      const [start, end] = pts
      ctx.beginPath()
      ctx.moveTo(start[0], start[1])
      ctx.lineTo(end[0], end[1])
      ctx.stroke()
      const angle = Math.atan2(end[1] - start[1], end[0] - start[0])
      const headLen = Math.max(10, ctx.lineWidth * 5)
      ctx.beginPath()
      ctx.moveTo(end[0], end[1])
      ctx.lineTo(end[0] - headLen * Math.cos(angle - Math.PI / 6), end[1] - headLen * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(end[0], end[1])
      ctx.lineTo(end[0] - headLen * Math.cos(angle + Math.PI / 6), end[1] - headLen * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    } else if (a.type === 'circle' && pts.length === 2) {
      const [start, end] = pts
      const rx = Math.abs(end[0] - start[0]) / 2
      const ry = Math.abs(end[1] - start[1]) / 2
      const cx = (start[0] + end[0]) / 2
      const cy = (start[1] + end[1]) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (a.type === 'text' && pts.length >= 1 && a.text) {
      const fs = Math.max(14, ctx.lineWidth * 6)
      ctx.font = `bold ${fs}px sans-serif`
      const metrics = ctx.measureText(a.text)
      const px = 4
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(pts[0][0] - px, pts[0][1] - fs - px, metrics.width + px * 2, fs + px * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fillText(a.text, pts[0][0], pts[0][1])
    }
  }
}

function MarkupOverlayImg({ annotations, imageUrl }: { annotations: Annotation[]; imageUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDims({ w: e.contentRect.width, h: e.contentRect.height })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !dims || !annotations.length) return

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scaleX = dims.w / img.naturalWidth
      const scaleY = dims.h / img.naturalHeight
      canvas.width = dims.w
      canvas.height = dims.h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, dims.w, dims.h)

      for (const a of annotations) {
        ctx.strokeStyle = '#f59e0b'
        ctx.fillStyle = '#f59e0b'
        ctx.lineWidth = a.strokeWidth * scaleX
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        const pts = a.points.map(([x, y]) => [x * scaleX, y * scaleY])

        if (a.type === 'freeform' && pts.length > 1) {
          ctx.beginPath()
          ctx.moveTo(pts[0][0], pts[0][1])
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
          ctx.stroke()
        } else if (a.type === 'arrow' && pts.length === 2) {
          const [start, end] = pts
          ctx.beginPath()
          ctx.moveTo(start[0], start[1])
          ctx.lineTo(end[0], end[1])
          ctx.stroke()
          const angle = Math.atan2(end[1] - start[1], end[0] - start[0])
          const headLen = Math.max(10, ctx.lineWidth * 5)
          ctx.beginPath()
          ctx.moveTo(end[0], end[1])
          ctx.lineTo(end[0] - headLen * Math.cos(angle - Math.PI / 6), end[1] - headLen * Math.sin(angle - Math.PI / 6))
          ctx.moveTo(end[0], end[1])
          ctx.lineTo(end[0] - headLen * Math.cos(angle + Math.PI / 6), end[1] - headLen * Math.sin(angle + Math.PI / 6))
          ctx.stroke()
        } else if (a.type === 'circle' && pts.length === 2) {
          const [start, end] = pts
          const rx = Math.abs(end[0] - start[0]) / 2
          const ry = Math.abs(end[1] - start[1]) / 2
          const cx = (start[0] + end[0]) / 2
          const cy = (start[1] + end[1]) / 2
          ctx.beginPath()
          ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
          ctx.stroke()
        } else if (a.type === 'text' && pts.length >= 1 && a.text) {
          const fs = Math.max(14, ctx.lineWidth * 6)
          ctx.font = `bold ${fs}px sans-serif`
          const metrics = ctx.measureText(a.text)
          const px = 4
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.fillRect(pts[0][0] - px, pts[0][1] - fs - px, metrics.width + px * 2, fs + px * 2)
          ctx.fillStyle = '#f59e0b'
          ctx.fillText(a.text, pts[0][0], pts[0][1])
        }
      }
    }
    img.src = imageUrl
  }, [annotations, dims, imageUrl])

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  )
}

function SortableStep({
  step,
  onTextChange,
  onDelete,
  onAddImage,
  onDeleteImage,
  onPreviewImage,
  onMarkup,
  uploadingStepId,
}: {
  step: Step
  onTextChange: (stepId: string, text: string) => void
  onDelete: (stepId: string) => void
  onAddImage: (stepId: string) => void
  onDeleteImage: (imageId: string, imageUrl: string) => void
  onPreviewImage: (url: string) => void
  onMarkup: (image: StepImage) => void
  uploadingStepId: string | null
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const supabase = createClient()

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-gray-200 rounded-xl p-4 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        >
          <GripVerticalIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Step {step.step_number}
            </span>
            <button
              onClick={() => onDelete(step.id)}
              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
              title="Delete step"
            >
              <Trash2Icon className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={step.text_content}
            onChange={(e) => onTextChange(step.id, e.target.value)}
            placeholder="Describe this step..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none min-h-[80px]"
            rows={3}
          />
          {step.images.length > 0 && (
            <div className="space-y-3 mt-3">
              {step.images.map((img) => {
                const publicUrl = supabase.storage.from('sop-images').getPublicUrl(img.image_url).data.publicUrl
                return (
                  <div key={img.id} className="relative group/img">
                    <div className="relative overflow-hidden rounded-lg border border-gray-200">
                      <img
                        src={publicUrl}
                        alt=""
                        className="w-full h-auto object-contain cursor-pointer"
                        onClick={() => onPreviewImage(publicUrl)}
                      />
                      {img.markup_data && img.markup_data.length > 0 && (
                        <MarkupOverlayImg annotations={img.markup_data} imageUrl={publicUrl} />
                      )}
                    </div>
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/img:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarkup(img) }}
                        className="bg-white border border-gray-200 rounded-full p-1.5 text-gray-500 hover:text-amber-600 shadow-sm transition"
                        title="Markup image"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteImage(img.id, img.image_url)}
                        className="bg-white border border-gray-200 rounded-full p-1.5 text-gray-400 hover:text-red-600 shadow-sm transition"
                        title="Delete image"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-3">
            <button
              onClick={() => onAddImage(step.id)}
              disabled={uploadingStepId === step.id}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-amber-600 hover:bg-amber-50 px-2 py-1.5 rounded-md transition disabled:opacity-50"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {uploadingStepId === step.id ? 'Uploading...' : 'Add Image'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SOPEditorClient({ userId, sopId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(!!sopId)
  const [title, setTitle] = useState('')
  const [sopType, setSopType] = useState<'office' | 'field'>('office')
  const [divisionId, setDivisionId] = useState<string>('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [divisions, setDivisions] = useState<Division[]>([])
  const [steps, setSteps] = useState<Step[]>([])

  const [currentSopId, setCurrentSopId] = useState<string | null>(sopId ?? null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [wasPublished, setWasPublished] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadStepRef = useRef<string | null>(null)

  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [deleteStepConfirm, setDeleteStepConfirm] = useState<string | null>(null)
  const [deletingStep, setDeletingStep] = useState(false)

  const [markupImage, setMarkupImage] = useState<StepImage | null>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [createdByName, setCreatedByName] = useState('')

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialLoad = useRef(true)
  const pendingStepTexts = useRef<Map<string, string>>(new Map())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const fetchDivisions = useCallback(async () => {
    const { data } = await supabase
      .from('sop_divisions')
      .select('id, name, type')
      .order('sort_order')
      .order('created_at')
    setDivisions((data as Division[]) ?? [])
  }, [supabase])

  const loadSOP = useCallback(async () => {
    if (!sopId) return
    setLoading(true)

    const { data: sop } = await supabase
      .from('sops')
      .select('*')
      .eq('id', sopId)
      .single()

    if (!sop) {
      router.replace('/sops')
      return
    }

    if (sop.sop_format === 'uploaded') {
      router.replace('/sops')
      return
    }

    setTitle(sop.title)
    setSopType(sop.type)
    setDivisionId(sop.division_id ?? '')
    setStatus(sop.status)
    setWasPublished(sop.status === 'published')
    setCurrentSopId(sop.id)

    const { data: creatorProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', sop.created_by)
      .single()
    setCreatedByName(creatorProfile?.display_name ?? 'Unknown')

    const { data: stepsData } = await supabase
      .from('sop_steps')
      .select('*')
      .eq('sop_id', sopId)
      .order('step_number')

    const stepsList = (stepsData ?? []) as { id: string; sop_id: string; step_number: number; text_content: string | null }[]

    const stepIds = stepsList.map((s) => s.id)
    let imagesData: StepImage[] = []
    if (stepIds.length > 0) {
      const { data: imgs } = await supabase
        .from('sop_step_images')
        .select('*')
        .in('sop_step_id', stepIds)
        .order('sort_order')
      imagesData = (imgs as StepImage[]) ?? []
    }

    const loadedSteps: Step[] = stepsList.map((s) => ({
      id: s.id,
      sop_id: s.sop_id,
      step_number: s.step_number,
      text_content: s.text_content ?? '',
      images: imagesData.filter((img) => img.sop_step_id === s.id),
    }))

    setSteps(loadedSteps)
    setLoading(false)
    isInitialLoad.current = false
  }, [sopId, supabase, router])

  useEffect(() => {
    fetchDivisions()
    if (sopId) {
      loadSOP()
    } else {
      isInitialLoad.current = false
    }
  }, [fetchDivisions, loadSOP, sopId])

  const saveToDb = useCallback(async () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle && !currentSopId) return

    setSaveStatus('saving')

    try {
      let id = currentSopId
      if (!id) {
        const { data, error } = await supabase.from('sops').insert({
          title: trimmedTitle || 'Untitled SOP',
          type: sopType,
          division_id: divisionId || null,
          status: 'draft',
          sop_format: 'created',
          created_by: userId,
        }).select('id').single()

        if (error || !data) {
          setSaveStatus('error')
          return
        }
        id = data.id
        setCurrentSopId(id)
      } else {
        const updates: Record<string, unknown> = {
          title: trimmedTitle || 'Untitled SOP',
          type: sopType,
          division_id: divisionId || null,
        }
        if (wasPublished && status === 'published') {
          updates.status = 'draft'
          setStatus('draft')
        }
        await supabase.from('sops').update(updates).eq('id', id)
      }

      for (const [stepId, text] of pendingStepTexts.current.entries()) {
        await supabase
          .from('sop_steps')
          .update({ text_content: text })
          .eq('id', stepId)
      }
      pendingStepTexts.current.clear()

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000)
    } catch {
      setSaveStatus('error')
    }
  }, [title, sopType, divisionId, currentSopId, userId, supabase, wasPublished, status])

  const triggerAutoSave = useCallback(() => {
    if (isInitialLoad.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveToDb()
    }, 1500)
  }, [saveToDb])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleTitleChange = (val: string) => {
    setTitle(val)
    triggerAutoSave()
  }

  const handleTypeChange = (val: 'office' | 'field') => {
    setSopType(val)
    setDivisionId('')
    triggerAutoSave()
  }

  const handleDivisionChange = (val: string) => {
    setDivisionId(val)
    triggerAutoSave()
  }

  const handleStepTextChange = (stepId: string, text: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, text_content: text } : s))
    )
    pendingStepTexts.current.set(stepId, text)
    triggerAutoSave()
  }

  const handleAddStep = async (insertAfterIndex?: number) => {
    let id = currentSopId
    if (!id) {
      setSaveStatus('saving')
      const { data, error } = await supabase.from('sops').insert({
        title: title.trim() || 'Untitled SOP',
        type: sopType,
        division_id: divisionId || null,
        status: 'draft',
        sop_format: 'created',
        created_by: userId,
      }).select('id').single()

      if (error || !data) {
        setSaveStatus('error')
        return
      }
      id = data.id
      setCurrentSopId(id)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000)
    }

    const insertIndex = insertAfterIndex !== undefined ? insertAfterIndex + 1 : steps.length
    const newStepNumber = insertIndex + 1

    if (insertAfterIndex !== undefined && insertAfterIndex < steps.length - 1) {
      const stepsToShift = steps.slice(insertIndex)
      for (const s of stepsToShift) {
        await supabase
          .from('sop_steps')
          .update({ step_number: s.step_number + 1 })
          .eq('id', s.id)
      }
    }

    const { data: newStep, error } = await supabase
      .from('sop_steps')
      .insert({ sop_id: id, step_number: newStepNumber, text_content: '' })
      .select('id, sop_id, step_number, text_content')
      .single()

    if (error || !newStep) return

    setSteps((prev) => {
      const updated = [...prev]
      for (let i = insertIndex; i < updated.length; i++) {
        updated[i] = { ...updated[i], step_number: updated[i].step_number + 1 }
      }
      const step: Step = {
        id: newStep.id,
        sop_id: newStep.sop_id,
        step_number: newStepNumber,
        text_content: newStep.text_content ?? '',
        images: [],
      }
      updated.splice(insertIndex, 0, step)
      return updated
    })
  }

  const handleDeleteStep = async (stepId: string) => {
    setDeletingStep(true)
    const stepIndex = steps.findIndex((s) => s.id === stepId)
    const step = steps[stepIndex]

    if (step?.images.length) {
      const paths = step.images.map((img) => img.image_url)
      await supabase.storage.from('sop-images').remove(paths)
    }

    await supabase.from('sop_steps').delete().eq('id', stepId)

    const remaining = steps.filter((s) => s.id !== stepId)
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].step_number !== i + 1) {
        await supabase
          .from('sop_steps')
          .update({ step_number: i + 1 })
          .eq('id', remaining[i].id)
        remaining[i] = { ...remaining[i], step_number: i + 1 }
      }
    }

    setSteps(remaining)
    setDeleteStepConfirm(null)
    setDeletingStep(false)
  }

  const handleAddImage = (stepId: string) => {
    uploadStepRef.current = stepId
    fileInputRef.current?.click()
  }

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const stepId = uploadStepRef.current
    if (!file || !stepId || !currentSopId) return
    e.target.value = ''

    setUploadingStepId(stepId)

    const ext = file.name.split('.').pop() ?? 'jpg'
    const storagePath = `${currentSopId}/${stepId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('sop-images')
      .upload(storagePath, file, { contentType: file.type })

    if (uploadErr) {
      setUploadingStepId(null)
      alert('Image upload failed: ' + uploadErr.message)
      return
    }

    const currentImages = steps.find((s) => s.id === stepId)?.images ?? []
    const { data: imgRow, error: insertErr } = await supabase
      .from('sop_step_images')
      .insert({
        sop_step_id: stepId,
        image_url: storagePath,
        sort_order: currentImages.length,
      })
      .select('id, sop_step_id, image_url, markup_data, sort_order')
      .single()

    if (insertErr || !imgRow) {
      setUploadingStepId(null)
      return
    }

    setSteps((prev) =>
      prev.map((s) =>
        s.id === stepId ? { ...s, images: [...s.images, imgRow as StepImage] } : s
      )
    )
    setUploadingStepId(null)
  }

  const handleDeleteImage = async (imageId: string, imageUrl: string) => {
    await supabase.storage.from('sop-images').remove([imageUrl])
    await supabase.from('sop_step_images').delete().eq('id', imageId)
    setSteps((prev) =>
      prev.map((s) => ({
        ...s,
        images: s.images.filter((img) => img.id !== imageId),
      }))
    )
  }

  const handleMarkupSave = async (imageId: string, annotations: Annotation[]) => {
    await supabase
      .from('sop_step_images')
      .update({ markup_data: annotations })
      .eq('id', imageId)
    setSteps((prev) =>
      prev.map((s) => ({
        ...s,
        images: s.images.map((img) =>
          img.id === imageId ? { ...img, markup_data: annotations } : img
        ),
      }))
    )
    setMarkupImage(null)
  }

  const handleExportPdf = async () => {
    setGeneratingPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
      const PW = doc.internal.pageSize.getWidth()
      const PH = doc.internal.pageSize.getHeight()
      const M = 20
      const CW = PW - M * 2
      let y = M

      function checkPage(needed = 20) {
        if (y + needed > PH - M) {
          doc.addPage()
          y = M
        }
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.text(title, M, y)
      y += 10

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(100)
      const meta = `Type: ${sopType === 'office' ? 'Office' : 'Field'}  |  Created by: ${createdByName}  |  ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      doc.text(meta, M, y)
      y += 8
      doc.setTextColor(0)

      doc.setDrawColor(200)
      doc.line(M, y, PW - M, y)
      y += 8

      for (const step of steps) {
        checkPage(30)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.text(`Step ${step.step_number}`, M, y)
        y += 7

        if (step.text_content.trim()) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(11)
          const lines = doc.splitTextToSize(step.text_content, CW)
          for (const line of lines) {
            checkPage(6)
            doc.text(line, M, y)
            y += 5.5
          }
          y += 4
        }

        for (const img of step.images) {
          const publicUrl = supabase.storage.from('sop-images').getPublicUrl(img.image_url).data.publicUrl
          try {
            const imgEl = document.createElement('img')
            imgEl.crossOrigin = 'anonymous'
            await new Promise<void>((resolve, reject) => {
              imgEl.onload = () => resolve()
              imgEl.onerror = reject
              imgEl.src = publicUrl
            })

            let canvas: HTMLCanvasElement
            if (img.markup_data && img.markup_data.length > 0) {
              canvas = document.createElement('canvas')
              canvas.width = imgEl.naturalWidth
              canvas.height = imgEl.naturalHeight
              const ctx = canvas.getContext('2d')!
              ctx.drawImage(imgEl, 0, 0)
              renderAnnotationsToCtx(ctx, img.markup_data, imgEl.naturalWidth, imgEl.naturalHeight)
            } else {
              canvas = document.createElement('canvas')
              canvas.width = imgEl.naturalWidth
              canvas.height = imgEl.naturalHeight
              const ctx = canvas.getContext('2d')!
              ctx.drawImage(imgEl, 0, 0)
            }

            const ratio = canvas.height / canvas.width
            const imgW = Math.min(CW, 160)
            const imgH = imgW * ratio
            checkPage(imgH + 5)
            const imgData = canvas.toDataURL('image/jpeg', 0.85)
            doc.addImage(imgData, 'JPEG', M, y, imgW, imgH)
            y += imgH + 5
          } catch {
            // skip images that fail to load
          }
        }

        y += 4
      }

      const safeName = title.trim().replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'SOP'
      doc.save(`${safeName}.pdf`)
    } catch {
      alert('Failed to generate PDF')
    }
    setGeneratingPdf(false)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = steps.findIndex((s) => s.id === active.id)
    const newIndex = steps.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...steps]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    const renumbered = reordered.map((s, i) => ({ ...s, step_number: i + 1 }))
    setSteps(renumbered)

    for (const s of renumbered) {
      await supabase
        .from('sop_steps')
        .update({ step_number: s.step_number })
        .eq('id', s.id)
    }
  }

  const handlePublish = async () => {
    if (!title.trim()) {
      alert('Please enter a title for the SOP')
      return
    }
    if (steps.length === 0) {
      alert('Add at least one step before publishing')
      return
    }
    const hasContent = steps.some((s) => s.text_content.trim() || s.images.length > 0)
    if (!hasContent) {
      alert('At least one step must have content before publishing')
      return
    }

    setPublishing(true)

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    try {
      let id = currentSopId
      if (!id) {
        const { data, error } = await supabase.from('sops').insert({
          title: title.trim(),
          type: sopType,
          division_id: divisionId || null,
          status: 'published',
          sop_format: 'created',
          created_by: userId,
        }).select('id').single()

        if (error || !data) {
          setPublishing(false)
          alert('Failed to publish SOP')
          return
        }
        id = data.id
      } else {
        for (const [stepId, text] of pendingStepTexts.current.entries()) {
          await supabase
            .from('sop_steps')
            .update({ text_content: text })
            .eq('id', stepId)
        }
        pendingStepTexts.current.clear()

        await supabase.from('sops').update({
          title: title.trim(),
          type: sopType,
          division_id: divisionId || null,
          status: 'published',
        }).eq('id', id)
      }

      router.push('/sops')
    } catch {
      setPublishing(false)
      alert('Failed to publish SOP')
    }
  }

  const handleManualSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await saveToDb()
  }

  const filteredDivisions = divisions.filter((d) => d.type === sopType)
  const stepIds = steps.map((s) => s.id)

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileChange}
        className="hidden"
      />

      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/sops" className="flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-400">
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'Saved'}
              {saveStatus === 'error' && 'Save failed'}
            </span>
            <span
              className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                status === 'published'
                  ? 'text-green-700 bg-green-100'
                  : 'text-gray-500 bg-gray-100'
              }`}
            >
              {status === 'published' ? 'Published' : 'Draft'}
            </span>
            <button
              onClick={handleManualSave}
              className="text-xs font-medium text-gray-500 hover:text-amber-600 px-2 py-1 rounded transition"
            >
              Save Draft
            </button>
            {status === 'published' && (
              <button
                onClick={handleExportPdf}
                disabled={generatingPdf}
                className="inline-flex items-center gap-1.5 border border-amber-500 text-amber-600 hover:bg-amber-50 px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
              >
                <FileDownIcon className="w-4 h-4" />
                {generatingPdf ? 'Generating...' : 'PDF'}
              </button>
            )}
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
            >
              {publishing ? 'Publishing...' : wasPublished ? 'Republish' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 w-full space-y-6">
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled SOP"
            className="w-full text-2xl font-bold text-gray-900 placeholder-gray-300 border-none outline-none bg-transparent"
          />
          {wasPublished && status === 'draft' && (
            <p className="text-xs text-amber-600">
              Editing sets this SOP back to draft until republished
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={sopType}
              onChange={(e) => handleTypeChange(e.target.value as 'office' | 'field')}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              <option value="office">Office</option>
              <option value="field">Field</option>
            </select>
            <select
              value={divisionId}
              onChange={(e) => handleDivisionChange(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              <option value="">No division</option>
              {filteredDivisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={step.id}>
                  {index > 0 && (
                    <div className="flex justify-center py-1">
                      <button
                        onClick={() => handleAddStep(index - 1)}
                        className="text-gray-300 hover:text-amber-500 transition p-1 rounded-full hover:bg-amber-50"
                        title="Insert step here"
                      >
                        <PlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <SortableStep
                    step={step}
                    onTextChange={handleStepTextChange}
                    onDelete={(id) => setDeleteStepConfirm(id)}
                    onAddImage={handleAddImage}
                    onDeleteImage={handleDeleteImage}
                    onPreviewImage={setPreviewImage}
                    onMarkup={setMarkupImage}
                    uploadingStepId={uploadingStepId}
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          onClick={() => handleAddStep()}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm font-medium text-gray-400 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50/50 transition flex items-center justify-center gap-1.5"
        >
          <PlusIcon className="w-4 h-4" />
          Add Step
        </button>
      </div>

      {previewImage && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg text-gray-500 hover:text-gray-700 transition z-10"
              >
                <XIcon className="w-4 h-4" />
              </button>
              <img
                src={previewImage}
                alt=""
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </Portal>
      )}

      {deleteStepConfirm && (
        <ConfirmDialog
          title="Delete Step"
          message="This will permanently delete this step and all its images. This cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          loading={deletingStep}
          onConfirm={() => handleDeleteStep(deleteStepConfirm)}
          onCancel={() => deletingStep ? null : setDeleteStepConfirm(null)}
        />
      )}

      {markupImage && (
        <SOPImageMarkup
          imageUrl={supabase.storage.from('sop-images').getPublicUrl(markupImage.image_url).data.publicUrl}
          initialAnnotations={markupImage.markup_data ?? []}
          onSave={(annotations) => handleMarkupSave(markupImage.id, annotations)}
          onCancel={() => setMarkupImage(null)}
        />
      )}
    </div>
  )
}
