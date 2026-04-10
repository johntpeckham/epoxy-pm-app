'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeftIcon, PencilIcon, PlusIcon, TrashIcon, WrenchIcon, QrCodeIcon, UploadIcon, ExternalLinkIcon, CalendarClockIcon, CheckIcon } from 'lucide-react'
import type { EquipmentRow } from '@/app/(dashboard)/equipment/page'
import type { MaintenanceLogRow, EquipmentDocumentRow, ScheduledServiceRow } from '@/app/(dashboard)/equipment/[id]/page'
import EquipmentModal from './EquipmentModal'
import MaintenanceLogModal from './MaintenanceLogModal'
import DocumentUploadModal from './DocumentUploadModal'
import QrPreviewModal from './QrPreviewModal'
import ScheduledServiceModal from './ScheduledServiceModal'

const CATEGORY_LABEL: Record<string, string> = {
  vehicle: 'Vehicle',
  heavy_equipment: 'Heavy Equipment',
  trailer: 'Trailer',
  tool: 'Tool',
}

function formatLogDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function todayDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function parseDateOnly(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

type DisplayStatus = 'upcoming' | 'due_soon' | 'due' | 'overdue'

/** Derive display status from scheduled_date (completed services are filtered out separately). */
function deriveStatus(scheduledDate: string): DisplayStatus {
  const today = todayDate()
  const sd = parseDateOnly(scheduledDate)
  const diffMs = sd.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'due'
  if (diffDays <= 7) return 'due_soon'
  return 'upcoming'
}

/** Add interval units to a YYYY-MM-DD date and return the same format. */
function addInterval(dateStr: string, amount: number, unit: 'weeks' | 'months'): string {
  const d = parseDateOnly(dateStr)
  if (unit === 'weeks') {
    d.setDate(d.getDate() + amount * 7)
  } else {
    d.setMonth(d.getMonth() + amount)
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  equipment: EquipmentRow
  initialLogs: MaintenanceLogRow[]
  initialDocs: EquipmentDocumentRow[]
  initialScheduled?: ScheduledServiceRow[]
  userId: string
  userRole: string
  userDisplayName: string
  /** When provided, the "Equipment" back link calls this callback instead of navigating to /equipment. */
  onBack?: () => void
}

export default function EquipmentDetailClient({
  equipment: initialEquipment,
  initialLogs,
  initialDocs,
  initialScheduled = [],
  userId,
  userRole,
  userDisplayName,
  onBack,
}: Props) {
  const router = useRouter()
  const canManage = userRole === 'admin' || userRole === 'foreman'

  const [equipment, setEquipment] = useState(initialEquipment)
  const [logs, setLogs] = useState(initialLogs)
  const [docs, setDocs] = useState(initialDocs)
  const [scheduled, setScheduled] = useState<ScheduledServiceRow[]>(initialScheduled)
  const [showEquipmentModal, setShowEquipmentModal] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showDocModal, setShowDocModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [showScheduledModal, setShowScheduledModal] = useState(false)
  const [editingLog, setEditingLog] = useState<MaintenanceLogRow | null>(null)
  const [editingScheduled, setEditingScheduled] = useState<ScheduledServiceRow | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null)
  const [deleteScheduledId, setDeleteScheduledId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deletingDoc, setDeletingDoc] = useState(false)
  const [deletingScheduled, setDeletingScheduled] = useState(false)

  const refreshEquipment = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('equipment')
      .select('id, name, category, year, make, model, serial_number, vin, license_plate, custom_fields, status, created_at, created_by')
      .eq('id', equipment.id)
      .single()
    if (data) {
      setEquipment({
        id: data.id,
        name: data.name,
        category: data.category,
        year: data.year,
        make: data.make,
        model: data.model,
        serial_number: data.serial_number,
        vin: data.vin,
        license_plate: data.license_plate,
        custom_fields: (data.custom_fields ?? []) as { label: string; value: string }[],
        status: data.status,
        created_at: data.created_at,
        created_by: data.created_by,
      })
    }
  }, [equipment.id])

  const refreshLogs = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('maintenance_logs')
      .select('id, equipment_id, service_date, service_type, mileage_or_hours, performed_by, notes, created_at, created_by')
      .eq('equipment_id', equipment.id)
      .order('service_date', { ascending: false })
    if (data) {
      setLogs(data as MaintenanceLogRow[])
    }
  }, [equipment.id])

  const handleEquipmentSaved = useCallback(() => {
    setShowEquipmentModal(false)
    refreshEquipment()
    router.refresh()
  }, [refreshEquipment, router])

  const handleLogSaved = useCallback(() => {
    setShowLogModal(false)
    setEditingLog(null)
    refreshLogs()
  }, [refreshLogs])

  const handleDeleteLog = async (id: string) => {
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('maintenance_logs').delete().eq('id', id)
    if (!error) {
      setLogs((prev) => prev.filter((l) => l.id !== id))
    }
    setDeleting(false)
    setDeleteConfirmId(null)
  }

  const refreshScheduled = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('equipment_scheduled_services')
      .select('id, equipment_id, description, scheduled_date, is_recurring, recurrence_interval, recurrence_unit, status, completed_at, completed_by, parent_service_id, created_by, created_at')
      .eq('equipment_id', equipment.id)
      .order('scheduled_date', { ascending: true })
    if (data) {
      setScheduled(data as ScheduledServiceRow[])
    }
  }, [equipment.id])

  const handleScheduledSaved = useCallback(() => {
    setShowScheduledModal(false)
    setEditingScheduled(null)
    refreshScheduled()
  }, [refreshScheduled])

  /**
   * Mark a scheduled service complete. If it is recurring, also insert the
   * next occurrence chained via parent_service_id.
   */
  const handleCompleteScheduled = async (service: ScheduledServiceRow) => {
    const supabase = createClient()

    // 1. Mark the current service completed
    const { error: updateErr } = await supabase
      .from('equipment_scheduled_services')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: userId,
      })
      .eq('id', service.id)
    if (updateErr) {
      console.error('[EquipmentDetailClient] Failed to complete service:', updateErr)
      return
    }

    // 2. If recurring, generate the next occurrence
    if (service.is_recurring && service.recurrence_interval && service.recurrence_unit) {
      const nextDate = addInterval(
        service.scheduled_date,
        service.recurrence_interval,
        service.recurrence_unit
      )
      const parentId = service.parent_service_id ?? service.id
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
          created_by: userId,
        })
      if (insertErr) {
        console.error('[EquipmentDetailClient] Failed to insert next recurrence:', insertErr)
      }
    }

    refreshScheduled()
  }

  const handleDeleteScheduled = async (id: string) => {
    setDeletingScheduled(true)
    const supabase = createClient()
    const { error } = await supabase.from('equipment_scheduled_services').delete().eq('id', id)
    if (!error) {
      setScheduled((prev) => prev.filter((s) => s.id !== id))
    }
    setDeletingScheduled(false)
    setDeleteScheduledId(null)
  }

  /**
   * On first load, check if any recurring service has become overdue without
   * having its next occurrence generated yet. For each such chain, insert the
   * missing next occurrence so both the overdue row and the upcoming row
   * coexist. Runs once per mount.
   */
  const recurrenceCheckRan = useRef(false)
  useEffect(() => {
    if (recurrenceCheckRan.current) return
    if (scheduled.length === 0) return
    recurrenceCheckRan.current = true

    // Build a set of chain roots that already have descendant open rows.
    const chainHasOpenChild = new Set<string>()
    for (const s of scheduled) {
      if (s.status !== 'completed' && s.parent_service_id) {
        chainHasOpenChild.add(s.parent_service_id)
      }
    }

    const today = todayDate()
    const missing: ScheduledServiceRow[] = []

    for (const s of scheduled) {
      if (s.status === 'completed') continue
      if (!s.is_recurring || !s.recurrence_interval || !s.recurrence_unit) continue
      const chainRoot = s.parent_service_id ?? s.id
      if (chainHasOpenChild.has(chainRoot)) continue
      // If the scheduled_date is in the past (overdue), generate the next occurrence.
      const sd = parseDateOnly(s.scheduled_date)
      if (sd.getTime() < today.getTime()) {
        missing.push(s)
        chainHasOpenChild.add(chainRoot)
      }
    }

    if (missing.length === 0) return

    const run = async () => {
      const supabase = createClient()
      for (const s of missing) {
        const nextDate = addInterval(
          s.scheduled_date,
          s.recurrence_interval!,
          s.recurrence_unit!
        )
        const parentId = s.parent_service_id ?? s.id
        const { error: insertErr } = await supabase
          .from('equipment_scheduled_services')
          .insert({
            equipment_id: s.equipment_id,
            description: s.description,
            scheduled_date: nextDate,
            is_recurring: true,
            recurrence_interval: s.recurrence_interval,
            recurrence_unit: s.recurrence_unit,
            status: 'upcoming',
            parent_service_id: parentId,
            created_by: userId,
          })
        if (insertErr) {
          console.error('[EquipmentDetailClient] Auto-recurrence insert failed:', insertErr)
        }
      }
      refreshScheduled()
    }
    run()
  }, [scheduled, userId, refreshScheduled])

  const refreshDocs = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('equipment_documents')
      .select('id, equipment_id, label, file_url, uploaded_at, uploaded_by')
      .eq('equipment_id', equipment.id)
      .order('uploaded_at', { ascending: false })
    if (data) {
      setDocs(data as EquipmentDocumentRow[])
    }
  }, [equipment.id])

  const handleDocSaved = useCallback(() => {
    setShowDocModal(false)
    refreshDocs()
  }, [refreshDocs])

  const handleDeleteDoc = async (id: string) => {
    setDeletingDoc(true)
    const supabase = createClient()
    const { error } = await supabase.from('equipment_documents').delete().eq('id', id)
    if (!error) {
      setDocs((prev) => prev.filter((d) => d.id !== id))
    }
    setDeletingDoc(false)
    setDeleteDocId(null)
  }

  const hasDetails =
    equipment.category ||
    equipment.year ||
    equipment.make ||
    equipment.model ||
    equipment.serial_number ||
    equipment.vin ||
    equipment.license_plate

  const hasCustomFields = equipment.custom_fields && equipment.custom_fields.length > 0

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
      {/* Back button */}
      {onBack ? (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Equipment
        </button>
      ) : (
        <Link
          href="/equipment"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Equipment
        </Link>
      )}

      {/* Page header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{equipment.name}</h1>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
            equipment.status === 'active'
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {equipment.status === 'active' ? 'Active' : 'Out of Service'}
        </span>
        <button
          onClick={() => setShowQrModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <QrCodeIcon className="w-4 h-4" />
          QR Code
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Maintenance Log */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Maintenance Log</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {canManage && (
                <button
                  onClick={() => {
                    setEditingScheduled(null)
                    setShowScheduledModal(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-500 text-amber-600 hover:bg-amber-50 text-sm font-medium rounded-lg transition-colors"
                >
                  <CalendarClockIcon className="w-4 h-4" />
                  Next Service
                </button>
              )}
              <button
                onClick={() => {
                  setEditingLog(null)
                  setShowLogModal(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Add Entry
              </button>
            </div>
          </div>

          {/* Upcoming / due / overdue scheduled services */}
          {(() => {
            const activeScheduled = scheduled.filter((s) => s.status !== 'completed')
            if (activeScheduled.length === 0) return null
            return (
              <div className="space-y-3 mb-4">
                {activeScheduled.map((service) => {
                  const displayStatus = deriveStatus(service.scheduled_date)
                  const statusLabel =
                    displayStatus === 'overdue' ? 'Overdue'
                    : displayStatus === 'due' ? 'Due'
                    : displayStatus === 'due_soon' ? 'Due soon'
                    : 'Upcoming'
                  const statusCls =
                    displayStatus === 'overdue' ? 'bg-red-100 text-red-700'
                    : displayStatus === 'due' ? 'bg-orange-100 text-orange-700'
                    : displayStatus === 'due_soon' ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-700'
                  const borderCls =
                    displayStatus === 'overdue' ? 'border-red-200'
                    : displayStatus === 'due' ? 'border-orange-200'
                    : displayStatus === 'due_soon' ? 'border-amber-200'
                    : 'border-blue-200'
                  return (
                    <div
                      key={service.id}
                      className={`bg-white border ${borderCls} rounded-xl p-4 hover:shadow-sm transition-shadow`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusCls}`}>
                              {statusLabel}
                            </span>
                            {service.is_recurring && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-700">
                                Recurring
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400">{formatLogDate(service.scheduled_date)}</p>
                          <p className="text-sm font-bold text-gray-900 mt-1">{service.description}</p>
                          {service.is_recurring && service.recurrence_interval && service.recurrence_unit && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Every {service.recurrence_interval} {service.recurrence_unit}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleCompleteScheduled(service)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-500 hover:bg-green-400 text-white text-xs font-medium rounded-md transition-colors"
                              title="Mark complete"
                            >
                              <CheckIcon className="w-3.5 h-3.5" />
                              Complete
                            </button>
                            <button
                              onClick={() => {
                                setEditingScheduled(service)
                                setShowScheduledModal(true)
                              }}
                              className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-gray-100 rounded-md transition-colors"
                              title="Edit"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteScheduledId(service.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-md transition-colors"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Completed scheduled services (shown in history alongside manual entries) */}
          {(() => {
            const completedScheduled = scheduled.filter((s) => s.status === 'completed')
            if (completedScheduled.length === 0) return null
            return (
              <div className="space-y-3 mb-3">
                {completedScheduled.map((service) => (
                  <div
                    key={service.id}
                    className="relative bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">
                        Completed
                      </span>
                      {service.is_recurring && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-700">
                          Recurring
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{formatLogDate(service.scheduled_date)}</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{service.description}</p>
                    {service.completed_at && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Completed {new Date(service.completed_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}

          {logs.length === 0 && scheduled.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
                <WrenchIcon className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No maintenance records yet.</p>
              <p className="text-gray-400 text-sm mt-1">Add the first entry.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="relative bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                >
                  {/* Action buttons */}
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingLog(log)
                        setShowLogModal(true)
                      }}
                      className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-gray-100 rounded-md transition-colors"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(log.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-md transition-colors"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-gray-400">{formatLogDate(log.service_date)}</p>
                  <p className="text-sm font-bold text-gray-900 mt-1 pr-16">{log.service_type}</p>
                  {log.mileage_or_hours && (
                    <p className="text-sm text-gray-600 mt-1">Mileage / Hours: {log.mileage_or_hours}</p>
                  )}
                  <p className="text-sm text-gray-600 mt-1">Performed by: {log.performed_by}</p>
                  {log.notes && (
                    <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{log.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column — Details + Additional Info */}
        <div className="space-y-6">
          {/* Details card */}
          {hasDetails && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Details</h2>
                {canManage && (
                  <button
                    onClick={() => setShowEquipmentModal(true)}
                    className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-gray-100 rounded-md transition-colors"
                    title="Edit"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <dl className="space-y-3">
                {equipment.category && (
                  <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</dt>
                    <dd className="text-sm text-gray-900 mt-0.5">{CATEGORY_LABEL[equipment.category] ?? equipment.category}</dd>
                  </div>
                )}
                {(equipment.year || equipment.make || equipment.model) && (
                  <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Year / Make / Model</dt>
                    <dd className="text-sm text-gray-900 mt-0.5">
                      {[equipment.year, equipment.make, equipment.model].filter(Boolean).join(' / ')}
                    </dd>
                  </div>
                )}
                {equipment.serial_number && (
                  <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Serial Number</dt>
                    <dd className="text-sm text-gray-900 mt-0.5">{equipment.serial_number}</dd>
                  </div>
                )}
                {equipment.vin && (
                  <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">VIN</dt>
                    <dd className="text-sm text-gray-900 mt-0.5">{equipment.vin}</dd>
                  </div>
                )}
                {equipment.license_plate && (
                  <div>
                    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">License Plate</dt>
                    <dd className="text-sm text-gray-900 mt-0.5">{equipment.license_plate}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Additional Info card */}
          {hasCustomFields && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Info</h2>
              <dl className="space-y-3">
                {equipment.custom_fields.map((field, i) => (
                  <div key={i}>
                    <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{field.label}</dt>
                    <dd className="text-sm text-gray-900 mt-0.5">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Documents card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
              <button
                onClick={() => setShowDocModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
              >
                <UploadIcon className="w-4 h-4" />
                Upload
              </button>
            </div>
            {docs.length === 0 ? (
              <p className="text-sm text-gray-400">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-900 font-medium">{doc.label}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 transition-colors"
                      >
                        View
                        <ExternalLinkIcon className="w-3.5 h-3.5" />
                      </a>
                      {canManage && (
                        <button
                          onClick={() => setDeleteDocId(doc.id)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-md transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation for maintenance log */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">Delete Maintenance Entry</h3>
            <p className="text-sm text-gray-500 mt-2">
              Are you sure you want to delete this maintenance entry? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteLog(deleteConfirmId)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Equipment edit modal */}
      {showEquipmentModal && (
        <EquipmentModal
          item={equipment}
          userId={userId}
          onClose={() => setShowEquipmentModal(false)}
          onSaved={handleEquipmentSaved}
        />
      )}

      {/* Maintenance log add/edit modal */}
      {showLogModal && (
        <MaintenanceLogModal
          entry={editingLog}
          equipmentId={equipment.id}
          userId={userId}
          userDisplayName={userDisplayName}
          onClose={() => {
            setShowLogModal(false)
            setEditingLog(null)
          }}
          onSaved={handleLogSaved}
        />
      )}

      {/* Document upload modal */}
      {showDocModal && (
        <DocumentUploadModal
          equipmentId={equipment.id}
          userId={userId}
          onClose={() => setShowDocModal(false)}
          onSaved={handleDocSaved}
        />
      )}

      {/* QR preview modal */}
      {showQrModal && (
        <QrPreviewModal
          equipment={equipment}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {/* Scheduled service add/edit modal */}
      {showScheduledModal && (
        <ScheduledServiceModal
          entry={editingScheduled}
          equipmentId={equipment.id}
          userId={userId}
          onClose={() => {
            setShowScheduledModal(false)
            setEditingScheduled(null)
          }}
          onSaved={handleScheduledSaved}
        />
      )}

      {/* Delete scheduled service confirmation */}
      {deleteScheduledId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setDeleteScheduledId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">Delete Scheduled Service</h3>
            <p className="text-sm text-gray-500 mt-2">
              Are you sure you want to delete this scheduled service? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteScheduledId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteScheduled(deleteScheduledId)}
                disabled={deletingScheduled}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {deletingScheduled ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete document confirmation */}
      {deleteDocId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setDeleteDocId(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900">Delete Document</h3>
            <p className="text-sm text-gray-500 mt-2">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteDocId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDoc(deleteDocId)}
                disabled={deletingDoc}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {deletingDoc ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
