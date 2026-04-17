'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
  BookOpenIcon,
  GripVerticalIcon,
  ImageIcon,
} from 'lucide-react'
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
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Portal from '@/components/ui/Portal'

/* ── Types ──────────────────────────────────────────────── */

interface FieldGuideTemplate {
  id: string
  title: string
  created_by: string | null
  created_at: string
  updated_at: string
}

interface FieldGuideSection {
  id: string
  template_id: string
  heading: string
  body: string | null
  sort_order: number
  created_at: string
}

interface FieldGuideSectionImage {
  id: string
  section_id: string
  image_url: string
  storage_path: string
  sort_order: number
  created_at: string
}

/* ── Form state types ───────────────────────────────────── */

interface FormImage {
  tempId: string
  image_url: string
  storage_path: string
  dbId?: string // set for existing images from DB
}

interface FormSection {
  tempId: string
  dbId?: string // set for existing sections from DB
  heading: string
  body: string
  images: FormImage[]
}

interface FieldGuideManagementProps {
  userId: string
}

/* ── Sortable Section wrapper ───────────────────────────── */

function SortableSectionCard({
  section,
  index,
  onUpdate,
  onRemove,
  onAddImage,
  onRemoveImage,
  uploadingFor,
}: {
  section: FormSection
  index: number
  onUpdate: (tempId: string, field: 'heading' | 'body', value: string) => void
  onRemove: (tempId: string) => void
  onAddImage: (tempId: string) => void
  onRemoveImage: (tempId: string, imageTempId: string) => void
  uploadingFor: string | null
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.tempId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border border-gray-200 rounded-lg p-4 bg-gray-50 ${isDragging ? 'z-50 opacity-80 shadow-lg ring-2 ring-amber-400' : ''}`}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none mt-1 flex-shrink-0"
        >
          <GripVerticalIcon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          {/* Section heading */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Section Heading *
            </label>
            <input
              value={section.heading}
              onChange={(e) => onUpdate(section.tempId, 'heading', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              placeholder="e.g., Surface Preparation"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Body
            </label>
            <textarea
              value={section.body}
              onChange={(e) => onUpdate(section.tempId, 'body', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white resize-y min-h-[60px]"
              placeholder="Instructions, notes, or details for this section..."
              rows={3}
            />
          </div>

          {/* Images */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Images
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {section.images.map((img) => (
                <div key={img.tempId} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                  <img
                    src={img.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => onRemoveImage(section.tempId, img.tempId)}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => onAddImage(section.tempId)}
                disabled={uploadingFor === section.tempId}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 hover:border-amber-400 flex items-center justify-center text-gray-400 hover:text-amber-500 transition flex-shrink-0 disabled:opacity-50"
              >
                {uploadingFor === section.tempId ? (
                  <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Remove section button */}
        <button
          onClick={() => onRemove(section.tempId)}
          className="p-1 text-gray-400 hover:text-red-600 transition flex-shrink-0 mt-1"
          title="Remove section"
        >
          <Trash2Icon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/* ── Main component ─────────────────────────────────────── */

export default function FieldGuideManagement({ userId }: FieldGuideManagementProps) {
  const [guides, setGuides] = useState<FieldGuideTemplate[]>([])
  const [loading, setLoading] = useState(true)

  // Edit/Create state
  const [editingGuide, setEditingGuide] = useState<FieldGuideTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formSections, setFormSections] = useState<FormSection[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Delete state
  const [guideToDelete, setGuideToDelete] = useState<FieldGuideTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Section counts
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({})

  // Image upload
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string | null>(null)

  // Images to delete on save (storage_path values)
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const isEditing = isCreating || editingGuide !== null

  /* ── Data fetching ──────────────────────────────────────── */

  const fetchGuides = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('field_guide_templates')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('[FieldGuides] Fetch failed:', error)
    setGuides((data as FieldGuideTemplate[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchGuides()
  }, [fetchGuides])

  useEffect(() => {
    async function loadCounts() {
      const supabase = createClient()
      const { data } = await supabase.from('field_guide_sections').select('template_id')
      if (data) {
        const counts: Record<string, number> = {}
        for (const row of data) {
          counts[row.template_id] = (counts[row.template_id] ?? 0) + 1
        }
        setSectionCounts(counts)
      }
    }
    if (!isEditing) loadCounts()
  }, [isEditing, guides])

  const loadGuideSections = useCallback(async (templateId: string) => {
    const supabase = createClient()
    const { data: sectionsData } = await supabase
      .from('field_guide_sections')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })

    const sections = (sectionsData as FieldGuideSection[]) ?? []
    const sectionIds = sections.map((s) => s.id)

    let images: FieldGuideSectionImage[] = []
    if (sectionIds.length > 0) {
      const { data: imagesData } = await supabase
        .from('field_guide_section_images')
        .select('*')
        .in('section_id', sectionIds)
        .order('sort_order', { ascending: true })
      images = (imagesData as FieldGuideSectionImage[]) ?? []
    }

    const formSecs: FormSection[] = sections.map((s) => ({
      tempId: s.id,
      dbId: s.id,
      heading: s.heading,
      body: s.body ?? '',
      images: images
        .filter((img) => img.section_id === s.id)
        .map((img) => ({
          tempId: img.id,
          dbId: img.id,
          image_url: img.image_url,
          storage_path: img.storage_path,
        })),
    }))

    setFormSections(formSecs)
  }, [])

  /* ── Form helpers ───────────────────────────────────────── */

  const makeTempId = () => `new-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const startCreate = () => {
    setIsCreating(true)
    setEditingGuide(null)
    setFormTitle('')
    setFormSections([{ tempId: makeTempId(), heading: '', body: '', images: [] }])
    setImagesToDelete([])
    setError('')
  }

  const startEdit = async (guide: FieldGuideTemplate) => {
    setEditingGuide(guide)
    setIsCreating(false)
    setFormTitle(guide.title)
    setImagesToDelete([])
    setError('')
    await loadGuideSections(guide.id)
  }

  const cancelForm = () => {
    setIsCreating(false)
    setEditingGuide(null)
    setFormTitle('')
    setFormSections([])
    setImagesToDelete([])
    setError('')
  }

  const addSection = () => {
    setFormSections((prev) => [
      ...prev,
      { tempId: makeTempId(), heading: '', body: '', images: [] },
    ])
  }

  const removeSection = (tempId: string) => {
    setFormSections((prev) => {
      const section = prev.find((s) => s.tempId === tempId)
      if (section) {
        // Mark any existing images for storage deletion
        const paths = section.images
          .filter((img) => img.storage_path)
          .map((img) => img.storage_path)
        if (paths.length) setImagesToDelete((old) => [...old, ...paths])
      }
      return prev.filter((s) => s.tempId !== tempId)
    })
  }

  const updateSection = (tempId: string, field: 'heading' | 'body', value: string) => {
    setFormSections((prev) =>
      prev.map((s) => (s.tempId === tempId ? { ...s, [field]: value } : s))
    )
  }

  /* ── Image handling ─────────────────────────────────────── */

  const triggerImageUpload = (sectionTempId: string) => {
    uploadTargetRef.current = sectionTempId
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadTargetRef.current) return
    const sectionTempId = uploadTargetRef.current

    // Reset input so same file can be selected again
    e.target.value = ''

    setUploadingFor(sectionTempId)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('field-guide-images')
        .upload(storagePath, file)
      if (uploadErr) throw uploadErr

      const imageUrl = supabase.storage
        .from('field-guide-images')
        .getPublicUrl(storagePath).data.publicUrl

      const newImage: FormImage = {
        tempId: makeTempId(),
        image_url: imageUrl,
        storage_path: storagePath,
      }

      setFormSections((prev) =>
        prev.map((s) =>
          s.tempId === sectionTempId
            ? { ...s, images: [...s.images, newImage] }
            : s
        )
      )
    } catch (err) {
      console.error('[FieldGuides] Image upload failed:', err)
      setError('Image upload failed. Please try again.')
    } finally {
      setUploadingFor(null)
    }
  }

  const removeImage = (sectionTempId: string, imageTempId: string) => {
    setFormSections((prev) =>
      prev.map((s) => {
        if (s.tempId !== sectionTempId) return s
        const img = s.images.find((i) => i.tempId === imageTempId)
        if (img?.storage_path) {
          setImagesToDelete((old) => [...old, img.storage_path])
        }
        return { ...s, images: s.images.filter((i) => i.tempId !== imageTempId) }
      })
    )
  }

  /* ── Drag & drop ────────────────────────────────────────── */

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setFormSections((prev) => {
      const oldIdx = prev.findIndex((s) => s.tempId === active.id)
      const newIdx = prev.findIndex((s) => s.tempId === over.id)
      if (oldIdx < 0 || newIdx < 0) return prev

      const reordered = [...prev]
      const [moved] = reordered.splice(oldIdx, 1)
      reordered.splice(newIdx, 0, moved)
      return reordered
    })
  }

  /* ── Save ───────────────────────────────────────────────── */

  const handleSave = async () => {
    if (!formTitle.trim()) {
      setError('Title is required')
      return
    }
    const validSections = formSections.filter((s) => s.heading.trim())
    if (validSections.length === 0) {
      setError('Add at least one section with a heading')
      return
    }

    setSaving(true)
    setError('')
    const supabase = createClient()

    try {
      // Delete removed images from storage
      if (imagesToDelete.length > 0) {
        await supabase.storage.from('field-guide-images').remove(imagesToDelete)
      }

      let templateId: string

      if (editingGuide) {
        // Update template title
        const { error: updateErr } = await supabase
          .from('field_guide_templates')
          .update({ title: formTitle.trim() })
          .eq('id', editingGuide.id)
        if (updateErr) throw updateErr
        templateId = editingGuide.id

        // Delete all existing sections (cascade deletes images rows)
        await supabase
          .from('field_guide_sections')
          .delete()
          .eq('template_id', templateId)
      } else {
        // Create new template
        const { data: newTemplate, error: createErr } = await supabase
          .from('field_guide_templates')
          .insert({ title: formTitle.trim(), created_by: userId })
          .select()
          .single()
        if (createErr) throw createErr
        templateId = newTemplate.id
      }

      // Insert sections
      for (let i = 0; i < validSections.length; i++) {
        const sec = validSections[i]
        const { data: newSection, error: secErr } = await supabase
          .from('field_guide_sections')
          .insert({
            template_id: templateId,
            heading: sec.heading.trim(),
            body: sec.body.trim() || null,
            sort_order: i,
          })
          .select()
          .single()
        if (secErr) throw secErr

        // Insert images for this section
        if (sec.images.length > 0) {
          const imageRows = sec.images.map((img, imgIdx) => ({
            section_id: newSection.id,
            image_url: img.image_url,
            storage_path: img.storage_path,
            sort_order: imgIdx,
          }))
          const { error: imgErr } = await supabase
            .from('field_guide_section_images')
            .insert(imageRows)
          if (imgErr) throw imgErr
        }
      }

      cancelForm()
      fetchGuides()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  /* ── Delete ─────────────────────────────────────────────── */

  const handleDelete = async () => {
    if (!guideToDelete) return
    setDeleting(true)
    const supabase = createClient()

    // Collect storage paths for images before deleting
    const { data: sections } = await supabase
      .from('field_guide_sections')
      .select('id')
      .eq('template_id', guideToDelete.id)
    const sectionIds = (sections ?? []).map((s: { id: string }) => s.id)

    if (sectionIds.length > 0) {
      const { data: images } = await supabase
        .from('field_guide_section_images')
        .select('storage_path')
        .in('section_id', sectionIds)
      const paths = (images ?? []).map((i: { storage_path: string }) => i.storage_path)
      if (paths.length > 0) {
        await supabase.storage.from('field-guide-images').remove(paths)
      }
    }

    // Delete template (cascade deletes sections + image rows)
    const { error } = await supabase
      .from('field_guide_templates')
      .delete()
      .eq('id', guideToDelete.id)
    if (error) console.error('[FieldGuides] Delete failed:', error)

    setDeleting(false)
    setGuideToDelete(null)
    fetchGuides()
  }

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Sub-header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <p className="text-xs text-gray-400">Create reusable field guides for job reports.</p>
        </div>
        {!isEditing && (
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New Field Guide
          </button>
        )}
      </div>

      {isEditing ? (
        /* ── Modal overlay ──────────────────────────────────── */
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
            onClick={cancelForm}
          >
            <div
              className="mt-auto md:my-auto md:mx-auto w-full md:max-w-3xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex-none flex items-center justify-between px-4 border-b border-gray-200" style={{ minHeight: '56px' }}>
                <h3 className="text-base font-semibold text-gray-900">
                  {editingGuide ? 'Edit Field Guide' : 'New Field Guide'}
                </h3>
                <button onClick={cancelForm} className="p-1.5 text-gray-400 hover:text-gray-600 transition">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>
                )}

                {/* Title */}
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Title *
                  </label>
                  <input
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    placeholder="e.g., Epoxy Floor Coating SOP"
                  />
                </div>

                {/* Sections */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Sections</h3>
                  {formSections.length === 0 ? (
                    <p className="text-xs text-gray-400 mb-3">No sections yet. Add your first section below.</p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={formSections.map((s) => s.tempId)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {formSections.map((section, idx) => (
                            <SortableSectionCard
                              key={section.tempId}
                              section={section}
                              index={idx}
                              onUpdate={updateSection}
                              onRemove={removeSection}
                              onAddImage={triggerImageUpload}
                              onRemoveImage={removeImage}
                              uploadingFor={uploadingFor}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}

                  <button
                    onClick={addSection}
                    className="mt-3 flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Section
                  </button>
                </div>
              </div>

              {/* Modal footer */}
              <div
                className="flex-none flex gap-3 justify-end p-4 md:pb-6 border-t border-gray-200"
                style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))' }}
              >
                <button
                  onClick={cancelForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingGuide ? 'Save Changes' : 'Create Field Guide'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {/* ── List view (always visible behind modal) ─────────── */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : guides.length === 0 && !isEditing ? (
          <div className="text-center py-20">
            <BookOpenIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">No field guides yet. Create one to get started.</p>
            <button onClick={startCreate} className="mt-3 text-sm text-amber-600 hover:text-amber-700 font-medium">
              + Create your first field guide
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {guides.map((guide) => (
              <div key={guide.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-all">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">{guide.title}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {sectionCounts[guide.id] ?? 0} section{(sectionCounts[guide.id] ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(guide)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-100 transition"
                      title="Edit field guide"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setGuideToDelete(guide)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 transition"
                      title="Delete field guide"
                    >
                      <Trash2Icon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {guideToDelete && (
        <ConfirmDialog
          title="Delete Field Guide"
          message={`Delete "${guideToDelete.title}"? This will permanently remove the field guide and all its sections and images. This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setGuideToDelete(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
