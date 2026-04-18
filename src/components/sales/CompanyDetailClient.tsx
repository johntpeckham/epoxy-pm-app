'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  PencilIcon,
  Trash2Icon,
  XIcon,
  PlusIcon,
  FileIcon,
  ImageIcon,
  LinkIcon,
  UploadIcon,
  PhoneIcon,
  MailIcon,
  MessageSquareIcon,
  CalendarIcon,
  CheckIcon,
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
} from 'lucide-react'
import { useUserRole } from '@/lib/useUserRole'
import Portal from '@/components/ui/Portal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import NewContactModal, { type ContactForModal } from './NewContactModal'
import AddressModal, { type AddressForModal } from './AddressModal'
import LogCallModal from './LogCallModal'
import EditCompanyModal, { type EditableCompany } from './EditCompanyModal'
import NewAppointmentModal from './NewAppointmentModal'
import NewReminderModal from './NewReminderModal'
import MergeContactsModal from './MergeContactsModal'
import ConvertCompanyToLeadModal from './leads/ConvertCompanyToLeadModal'

type CompanyStatus = 'prospect' | 'contacted' | 'hot_lead' | 'lost' | 'blacklisted' | 'active' | 'inactive'
type CompanyPriority = 'high' | 'medium' | 'low'

interface Company {
  id: string
  name: string
  industry: string | null
  zone: string | null
  region: string | null
  state: string | null
  county: string | null
  city: string | null
  status: CompanyStatus
  priority: CompanyPriority | null
  lead_source: string | null
  deal_value: number | null
  assigned_to: string | null
  notes: string | null
  import_metadata: Record<string, string> | null
  archived: boolean
  archived_at: string | null
  archived_by: string | null
  created_at: string
  updated_at: string
}

interface Contact {
  id: string
  first_name: string
  last_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  is_primary: boolean
}

interface Address {
  id: string
  label: string | null
  address: string
  city: string | null
  state: string | null
  zip: string | null
  is_primary: boolean
}

interface Tag {
  id: string
  name: string
}

interface CallLogEntry {
  id: string
  contact_id: string | null
  outcome: string
  notes: string | null
  call_date: string
  created_by: string | null
}

interface Comment {
  id: string
  content: string
  created_by: string | null
  created_at: string
}

interface FileRow {
  id: string
  file_name: string
  file_url: string
  storage_path: string
  file_type: string | null
  created_at: string
}

interface Reminder {
  id: string
  reminder_date: string
  note: string | null
  contact_id: string | null
  is_completed: boolean
  assigned_to: string | null
}

interface ProfileMini {
  id: string
  display_name: string | null
}

const STATUS_LABELS: Record<CompanyStatus, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  hot_lead: 'Hot Lead',
  lost: 'Lost',
  blacklisted: 'Blacklisted',
  active: 'Active',
  inactive: 'Inactive',
}

const STATUS_TEXT_COLOR: Record<CompanyStatus, string> = {
  prospect: 'text-[#27500A]',
  contacted: 'text-[#0C447C]',
  hot_lead: 'text-[#854F0B]',
  lost: 'text-[#791F1F]',
  blacklisted: 'text-gray-400',
  active: 'text-green-600',
  inactive: 'text-gray-400',
}

const PRIORITY_LABELS: Record<CompanyPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const PRIORITY_TEXT_COLOR: Record<CompanyPriority, string> = {
  high: 'text-amber-600',
  medium: 'text-gray-700',
  low: 'text-gray-400',
}

const OUTCOME_LABELS: Record<string, string> = {
  connected: 'Connected',
  voicemail: 'Voicemail',
  no_answer: 'No answer',
  busy: 'Busy',
  wrong_number: 'Wrong number',
  email_sent: 'Email sent',
  text_sent: 'Text sent',
}

const OUTCOME_DOT_COLOR: Record<string, string> = {
  connected: 'bg-emerald-500',
  voicemail: 'bg-amber-500',
  email_sent: 'bg-blue-500',
  text_sent: 'bg-blue-500',
  no_answer: 'bg-gray-300',
  busy: 'bg-gray-300',
  wrong_number: 'bg-gray-300',
}

const LEAD_SOURCE_LABELS: Record<string, string> = {
  google_maps: 'Google Maps',
  referral: 'Referral',
  website: 'Website',
  cold_call: 'Cold Call',
  quickbooks: 'QuickBooks',
  zoom: 'Zoom',
  other: 'Other',
}

const AVATAR_COLORS = [
  'bg-amber-500',
  'bg-purple-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-rose-500',
]

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

function formatDate(iso: string | null, opts?: { withTime?: boolean }): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (!opts?.withTime) return date
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

function formatAssigned(full: string | null): string {
  if (!full) return 'Unassigned'
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

function fileKind(fileType: string | null, fileName: string): 'image' | 'pdf' | 'csv' | 'link' | 'other' {
  if (fileType === 'link') return 'link'
  if (fileType === 'image') return 'image'
  if (fileType === 'pdf') return 'pdf'
  if (fileType === 'csv') return 'csv'
  const name = fileName.toLowerCase()
  if (/\.(png|jpg|jpeg|gif|webp|heic)$/.test(name)) return 'image'
  if (/\.pdf$/.test(name)) return 'pdf'
  if (/\.csv$/.test(name)) return 'csv'
  return 'other'
}

interface CompanyDetailClientProps {
  companyId: string
  userId: string
}

export default function CompanyDetailClient({ companyId, userId }: CompanyDetailClientProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [company, setCompany] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [addresses, setAddresses] = useState<Address[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [callLog, setCallLog] = useState<CallLogEntry[]>([])
  const [callLogLimit, setCallLogLimit] = useState(10)
  const [comments, setComments] = useState<Comment[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [profiles, setProfiles] = useState<ProfileMini[]>([])

  const profileMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of profiles) m.set(p.id, p.display_name ?? '')
    return m
  }, [profiles])

  // ─── Modal / UI state ────────────────────────────────────────────────────
  const [showEditCompany, setShowEditCompany] = useState(false)
  const [showNewContact, setShowNewContact] = useState(false)
  const [editContact, setEditContact] = useState<ContactForModal | null>(null)
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null)
  const [showNewAddress, setShowNewAddress] = useState(false)
  const [editAddress, setEditAddress] = useState<AddressForModal | null>(null)
  const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null)
  const [showLogCall, setShowLogCall] = useState(false)
  const [showNewAppointment, setShowNewAppointment] = useState(false)
  const [appointmentContactPrefill, setAppointmentContactPrefill] = useState<
    string | null
  >(null)
  const [showNewReminder, setShowNewReminder] = useState(false)
  const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null)
  const [mergeContactsMode, setMergeContactsMode] = useState(false)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    new Set()
  )
  const [showMergeContactsModal, setShowMergeContactsModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmBlacklist, setConfirmBlacklist] = useState(false)
  const [confirmConvert, setConfirmConvert] = useState(false)
  const [converting, setConverting] = useState(false)
  const [showConvertToLead, setShowConvertToLead] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null)
  const [showAddLink, setShowAddLink] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const { role } = useUserRole()
  const isAdmin = role === 'admin'
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false)
  const [showLeadSourceDropdown, setShowLeadSourceDropdown] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // ─── Data fetching ──────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)

    const { data: companyData, error: companyErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle()
    if (companyErr || !companyData) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setCompany(companyData as Company)

    const [
      { data: contactData },
      { data: addressData },
      { data: tagLinkData },
      { data: allTagsData },
      { data: callData },
      { data: commentData },
      { data: fileData },
      { data: profileData },
      { data: reminderData },
    ] = await Promise.all([
      supabase
        .from('contacts')
        .select('*')
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false })
        .order('last_name', { ascending: true }),
      supabase
        .from('crm_company_addresses')
        .select('*')
        .eq('company_id', companyId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase.from('crm_company_tags').select('tag_id').eq('company_id', companyId),
      supabase.from('crm_tags').select('id, name').order('name', { ascending: true }),
      supabase
        .from('crm_call_log')
        .select('*')
        .eq('company_id', companyId)
        .order('call_date', { ascending: false }),
      supabase
        .from('crm_comments')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('crm_files')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, display_name'),
      supabase
        .from('crm_follow_up_reminders')
        .select('id, reminder_date, note, contact_id, is_completed, assigned_to')
        .eq('company_id', companyId)
        .order('reminder_date', { ascending: true }),
    ])

    setContacts((contactData ?? []) as Contact[])
    setAddresses((addressData ?? []) as Address[])
    const allTagsList = (allTagsData ?? []) as Tag[]
    setAllTags(allTagsList)
    const tagIds = new Set(
      ((tagLinkData ?? []) as { tag_id: string }[]).map((t) => t.tag_id)
    )
    setTags(allTagsList.filter((t) => tagIds.has(t.id)))
    setCallLog((callData ?? []) as CallLogEntry[])
    setComments((commentData ?? []) as Comment[])
    setFiles((fileData ?? []) as FileRow[])
    setProfiles(
      ((profileData ?? []) as { id: string; display_name: string | null }[]).map((p) => ({
        id: p.id,
        display_name: p.display_name,
      }))
    )
    setReminders((reminderData ?? []) as Reminder[])
    setLoading(false)
  }, [supabase, companyId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ─── Mutations ──────────────────────────────────────────────────────────
  async function updateCompany(fields: Partial<Company>) {
    const { error } = await supabase.from('companies').update(fields).eq('id', companyId)
    if (error) {
      showToast(`Update failed: ${error.message}`)
      return
    }
    setCompany((prev) => (prev ? { ...prev, ...fields } : prev))
  }

  async function handleDeleteCompany() {
    setDeleting(true)
    const { error } = await supabase.from('companies').delete().eq('id', companyId)
    setDeleting(false)
    if (error) {
      showToast(`Delete failed: ${error.message}`)
      setConfirmDelete(false)
      return
    }
    router.push('/sales/crm')
  }

  async function handleBlacklist() {
    await updateCompany({ status: 'blacklisted' })
    setConfirmBlacklist(false)
  }

  async function handleArchiveToggle() {
    if (!company) return
    if (!isAdmin) {
      showToast('Only admins can archive or restore companies. Contact your admin.')
      return
    }
    setArchiving(true)
    const archive = !company.archived
    const updates: Record<string, unknown> = {
      archived: archive,
      archived_at: archive ? new Date().toISOString() : null,
      archived_by: archive ? userId : null,
    }
    const { error } = await supabase.from('companies').update(updates).eq('id', companyId)
    setArchiving(false)
    setShowArchiveConfirm(false)
    if (error) {
      showToast(`${archive ? 'Archive' : 'Restore'} failed: ${error.message}`)
      return
    }
    setCompany((prev) => prev ? { ...prev, archived: archive, archived_at: archive ? new Date().toISOString() : null, archived_by: archive ? userId : null } : prev)
    showToast(`Company ${archive ? 'archived' : 'restored'}`)
  }

  async function handleConvertToCustomer() {
    if (!company) return
    setConverting(true)
    const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null
    const primaryAddr = addresses.find((a) => a.is_primary) ?? addresses[0] ?? null
    const contactName = primary
      ? `${primary.first_name} ${primary.last_name}`.trim()
      : company.name
    const { error } = await supabase.from('companies').update({
      name: contactName,
      company: company.name,
      email: primary?.email ?? null,
      phone: primary?.phone ?? null,
      address: primaryAddr?.address ?? null,
      city: primaryAddr?.city ?? company.city ?? null,
      state: primaryAddr?.state ?? company.state ?? null,
      zip: primaryAddr?.zip ?? null,
    }).eq('id', company.id)
    setConverting(false)
    setConfirmConvert(false)
    if (error) {
      showToast(`Convert failed: ${error.message}`)
      return
    }
    showToast('Company updated with customer details')
  }

  async function handleDeleteContact(id: string) {
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) {
      showToast(`Delete failed: ${error.message}`)
      return
    }
    setContacts((prev) => prev.filter((c) => c.id !== id))
    setDeleteContactId(null)
  }

  async function handleDeleteAddress(id: string) {
    const { error } = await supabase.from('crm_company_addresses').delete().eq('id', id)
    if (error) {
      showToast(`Delete failed: ${error.message}`)
      return
    }
    setAddresses((prev) => prev.filter((a) => a.id !== id))
    setDeleteAddressId(null)
  }

  async function handleAddTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    // If the tag already exists globally, reuse; otherwise create.
    let tag = allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    if (!tag) {
      const { data, error } = await supabase
        .from('crm_tags')
        .insert({ name: trimmed })
        .select('id, name')
        .single()
      if (error || !data) {
        showToast(`Tag failed: ${error?.message ?? 'unknown error'}`)
        return
      }
      tag = data as Tag
      setAllTags((prev) => [...prev, tag!].sort((a, b) => a.name.localeCompare(b.name)))
    }
    // If already linked, skip
    if (tags.some((t) => t.id === tag!.id)) return
    const { error: linkErr } = await supabase
      .from('crm_company_tags')
      .insert({ company_id: companyId, tag_id: tag.id })
    if (linkErr) {
      showToast(`Tag failed: ${linkErr.message}`)
      return
    }
    setTags((prev) => [...prev, tag!])
  }

  async function handleRemoveTag(tagId: string) {
    const { error } = await supabase
      .from('crm_company_tags')
      .delete()
      .eq('company_id', companyId)
      .eq('tag_id', tagId)
    if (error) {
      showToast(`Remove tag failed: ${error.message}`)
      return
    }
    setTags((prev) => prev.filter((t) => t.id !== tagId))
  }

  async function handleAddComment() {
    const content = newComment.trim()
    if (!content) return
    const { data, error } = await supabase
      .from('crm_comments')
      .insert({ company_id: companyId, content, created_by: userId })
      .select('*')
      .single()
    if (error || !data) {
      showToast(`Comment failed: ${error?.message ?? 'unknown error'}`)
      return
    }
    setComments((prev) => [data as Comment, ...prev])
    setNewComment('')
  }

  async function handleUploadFile(file: File) {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('crm-files').upload(path, file)
    if (upErr) {
      showToast(`Upload failed: ${upErr.message}`)
      return
    }
    const fileUrl = supabase.storage.from('crm-files').getPublicUrl(path).data.publicUrl
    const kind = fileKind(null, file.name)
    const { data, error: insErr } = await supabase
      .from('crm_files')
      .insert({
        company_id: companyId,
        file_name: file.name,
        file_url: fileUrl,
        storage_path: path,
        file_type: kind === 'other' ? null : kind,
        created_by: userId,
      })
      .select('*')
      .single()
    if (insErr || !data) {
      showToast(`Save failed: ${insErr?.message ?? 'unknown error'}`)
      return
    }
    setFiles((prev) => [data as FileRow, ...prev])
  }

  async function handleAddLink() {
    const url = linkUrl.trim()
    if (!url) return
    const name = linkLabel.trim() || url
    const { data, error } = await supabase
      .from('crm_files')
      .insert({
        company_id: companyId,
        file_name: name,
        file_url: url,
        storage_path: url,
        file_type: 'link',
        created_by: userId,
      })
      .select('*')
      .single()
    if (error || !data) {
      showToast(`Link failed: ${error?.message ?? 'unknown error'}`)
      return
    }
    setFiles((prev) => [data as FileRow, ...prev])
    setLinkUrl('')
    setLinkLabel('')
    setShowAddLink(false)
  }

  async function handleDeleteFile(id: string) {
    const target = files.find((f) => f.id === id)
    if (!target) return
    if (target.file_type !== 'link') {
      await supabase.storage.from('crm-files').remove([target.storage_path])
    }
    const { error } = await supabase.from('crm_files').delete().eq('id', id)
    if (error) {
      showToast(`Delete failed: ${error.message}`)
      return
    }
    setFiles((prev) => prev.filter((f) => f.id !== id))
    setDeleteFileId(null)
  }

  async function handleToggleReminder(id: string, current: boolean) {
    const { error } = await supabase
      .from('crm_follow_up_reminders')
      .update({ is_completed: !current })
      .eq('id', id)
    if (error) {
      showToast(`Update failed: ${error.message}`)
      return
    }
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_completed: !current } : r))
    )
  }

  async function handleDeleteReminder(id: string) {
    const { error } = await supabase
      .from('crm_follow_up_reminders')
      .delete()
      .eq('id', id)
    if (error) {
      showToast(`Delete failed: ${error.message}`)
      return
    }
    setReminders((prev) => prev.filter((r) => r.id !== id))
    setDeleteReminderId(null)
  }

  // Placeholder; filled in subsequent edits.
  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (notFound)
    return (
      <div className="p-8">
        <Link href="/sales/crm" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeftIcon className="w-4 h-4" />
          CRM
        </Link>
        <p className="text-sm text-gray-500 mt-4">Company not found.</p>
      </div>
    )
  if (!company) return null

  const assignedName = company.assigned_to ? profileMap.get(company.assigned_to) ?? null : null
  const subtitleParts = [
    company.industry,
    company.zone,
    [company.city, company.state].filter(Boolean).join(', ') || null,
    assignedName ? `Assigned to ${formatAssigned(assignedName)}` : null,
  ].filter((p): p is string => !!p && p !== '')

  const lastActivity = callLog[0]?.call_date ?? null
  const visibleCallLog = callLog.slice(0, callLogLimit)

  const statusDropdownOptions: CompanyStatus[] = [
    'prospect',
    'contacted',
    'hot_lead',
    'lost',
    'blacklisted',
  ]
  const priorityDropdownOptions: CompanyPriority[] = ['high', 'medium', 'low']

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* ── Top bar ── */}
      <div className="px-4 sm:px-6 pt-4 pb-0">
        <Link
          href="/sales/crm"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          CRM
        </Link>
      </div>
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-[#2a2a2a] gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight truncate">
            {company.name}
          </h1>
          {company.archived && (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-500 rounded">
              Archived
            </span>
          )}
          <span className={`text-sm ${STATUS_TEXT_COLOR[company.status]}`}>
            {STATUS_LABELS[company.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {company.status !== 'blacklisted' && (
            <button
              onClick={() => setConfirmBlacklist(true)}
              className="px-3 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Blacklist
            </button>
          )}
          <button
            onClick={() => setShowConvertToLead(true)}
            className="px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
          >
            Convert to lead
          </button>
          <button
            onClick={() => setConfirmConvert(true)}
            className="px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
          >
            Convert to customer
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowArchiveConfirm(true)}
              disabled={archiving}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              title={company.archived ? 'Restore company' : 'Archive company'}
            >
              {company.archived ? (
                <ArchiveRestoreIcon className="w-4 h-4" />
              ) : (
                <ArchiveIcon className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={() => setShowEditCompany(true)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            title="Edit company"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete company"
          >
            <Trash2Icon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Subtitle ── */}
      <div className="px-4 sm:px-6 py-3 text-sm text-gray-400 flex items-center gap-2 flex-wrap">
        {subtitleParts.length > 0 ? (
          <span>{subtitleParts.join(' · ')}</span>
        ) : (
          <span className="italic">No details yet</span>
        )}
        {company.deal_value && company.deal_value > 0 ? (
          <span className="text-amber-600">
            · ${company.deal_value.toLocaleString()} deal
          </span>
        ) : null}
      </div>

      {/* ── Tags ── */}
      <div className="px-7 pb-4 flex items-center gap-2 flex-wrap">
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 rounded-full"
          >
            {t.name}
            <button
              onClick={() => handleRemoveTag(t.id)}
              className="text-amber-500 hover:text-amber-700"
              aria-label={`Remove ${t.name}`}
            >
              <XIcon className="w-3 h-3" />
            </button>
          </span>
        ))}
        {showTagInput ? (
          <div className="relative inline-flex items-center">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddTag(tagInput)
                  setTagInput('')
                  setShowTagInput(false)
                } else if (e.key === 'Escape') {
                  setTagInput('')
                  setShowTagInput(false)
                }
              }}
              placeholder="Tag name"
              className="px-2.5 py-1 text-xs border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              autoFocus
            />
            {tagInput && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px] max-h-[200px] overflow-y-auto">
                {allTags
                  .filter(
                    (t) =>
                      t.name.toLowerCase().includes(tagInput.toLowerCase()) &&
                      !tags.some((tg) => tg.id === t.id)
                  )
                  .slice(0, 6)
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        handleAddTag(t.name)
                        setTagInput('')
                        setShowTagInput(false)
                      }}
                      className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {t.name}
                    </button>
                  ))}
                {!allTags.some((t) => t.name.toLowerCase() === tagInput.toLowerCase()) && (
                  <button
                    onClick={() => {
                      handleAddTag(tagInput)
                      setTagInput('')
                      setShowTagInput(false)
                    }}
                    className="block w-full text-left px-3 py-1.5 text-xs text-amber-700 hover:bg-gray-50"
                  >
                    Create &ldquo;{tagInput}&rdquo;
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            + tag
          </button>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="px-7 pb-6 flex gap-3 flex-wrap">
        {/* Status */}
        <div className="relative">
          <button
            onClick={() => setShowStatusDropdown((v) => !v)}
            className="text-left bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-3 min-w-[140px] transition-colors"
          >
            <div className="text-[11px] text-gray-400">Status</div>
            <div className={`text-sm font-medium mt-0.5 ${STATUS_TEXT_COLOR[company.status]}`}>
              {STATUS_LABELS[company.status]}
            </div>
          </button>
          {showStatusDropdown && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowStatusDropdown(false)} />
              <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                {statusDropdownOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      updateCompany({ status: s })
                      setShowStatusDropdown(false)
                    }}
                    className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span className={STATUS_TEXT_COLOR[s]}>{STATUS_LABELS[s]}</span>
                    {company.status === s && <CheckIcon className="w-4 h-4 text-gray-400" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Priority */}
        <div className="relative">
          <button
            onClick={() => setShowPriorityDropdown((v) => !v)}
            className="text-left bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-3 min-w-[140px] transition-colors"
          >
            <div className="text-[11px] text-gray-400">Priority</div>
            <div
              className={`text-sm font-medium mt-0.5 ${
                company.priority ? PRIORITY_TEXT_COLOR[company.priority] : 'text-gray-400'
              }`}
            >
              {company.priority ? PRIORITY_LABELS[company.priority] : '—'}
            </div>
          </button>
          {showPriorityDropdown && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowPriorityDropdown(false)} />
              <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                {priorityDropdownOptions.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      updateCompany({ priority: p })
                      setShowPriorityDropdown(false)
                    }}
                    className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span className={PRIORITY_TEXT_COLOR[p]}>{PRIORITY_LABELS[p]}</span>
                    {company.priority === p && <CheckIcon className="w-4 h-4 text-gray-400" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Contacts count */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 min-w-[140px]">
          <div className="text-[11px] text-gray-400">Contacts</div>
          <div className="text-sm font-medium text-gray-900 mt-0.5">{contacts.length}</div>
        </div>

        {/* Last activity */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 min-w-[140px]">
          <div className="text-[11px] text-gray-400">Last activity</div>
          <div className="text-sm font-medium text-gray-900 mt-0.5">{formatDate(lastActivity)}</div>
        </div>

        {/* Deal value */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 min-w-[140px]">
          <div className="text-[11px] text-gray-400">Deal value</div>
          <div className="text-sm font-medium text-gray-900 mt-0.5">
            ${(company.deal_value ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="px-7 pb-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN: Contacts + Activity */}
        <div className="lg:col-span-2 space-y-8">
          {/* Contacts */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900">Contacts</h2>
              <div className="flex items-center gap-3">
                {mergeContactsMode ? (
                  <>
                    {selectedContactIds.size === 2 && (
                      <button
                        onClick={() => setShowMergeContactsModal(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
                      >
                        Merge selected
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setMergeContactsMode(false)
                        setSelectedContactIds(new Set())
                      }}
                      className="text-xs text-gray-500 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {contacts.length >= 2 && (
                      <button
                        onClick={() => {
                          setMergeContactsMode(true)
                          setSelectedContactIds(new Set())
                        }}
                        className="text-xs text-gray-500 hover:text-gray-800"
                      >
                        Merge contacts
                      </button>
                    )}
                    <button
                      onClick={() => setShowNewContact(true)}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Add contact
                    </button>
                  </>
                )}
              </div>
            </div>
            {contacts.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No contacts yet</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c, idx) => {
                  const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                  const checked = selectedContactIds.has(c.id)
                  return (
                    <div
                      key={c.id}
                      className={`group flex items-start gap-3 p-3 rounded-lg transition-colors ${
                        mergeContactsMode && checked
                          ? 'bg-amber-50/60'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      {mergeContactsMode && (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedContactIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(c.id)) next.delete(c.id)
                              else if (next.size < 2) next.add(c.id)
                              return next
                            })
                          }}
                          className="mt-3 w-4 h-4 text-amber-500 rounded border-gray-300 focus:ring-amber-500/20"
                        />
                      )}
                      <div
                        className={`flex-shrink-0 w-9 h-9 rounded-full ${avatarColor} text-white text-xs font-semibold flex items-center justify-center`}
                      >
                        {initials(c.first_name, c.last_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">
                            {c.first_name} {c.last_name}
                          </span>
                          {c.is_primary && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-500">
                              Primary
                            </span>
                          )}
                        </div>
                        {c.job_title && (
                          <div className="text-xs text-gray-500 mt-0.5">{c.job_title}</div>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-amber-600"
                            >
                              <PhoneIcon className="w-3 h-3" />
                              {c.phone}
                            </a>
                          )}
                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-amber-600"
                            >
                              <MailIcon className="w-3 h-3" />
                              {c.email}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setShowLogCall(true)}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-white rounded transition-colors"
                          title="Log call"
                        >
                          <PhoneIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setAppointmentContactPrefill(c.id)
                            setShowNewAppointment(true)
                          }}
                          className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-white rounded transition-colors"
                          title="Schedule appointment"
                        >
                          <CalendarIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setEditContact({
                              id: c.id,
                              first_name: c.first_name,
                              last_name: c.last_name,
                              job_title: c.job_title,
                              email: c.email,
                              phone: c.phone,
                              is_primary: c.is_primary,
                            })
                          }
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-white rounded transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteContactId(c.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2Icon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Activity timeline */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900">Activity</h2>
              <button
                onClick={() => setShowLogCall(true)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
              >
                <PlusIcon className="w-4 h-4" />
                Log call
              </button>
            </div>

            {/* New comment input */}
            <div className="mb-4">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={2}
                placeholder="Add a note or comment…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
              {newComment.trim() && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleAddComment}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
                  >
                    Post
                  </button>
                </div>
              )}
            </div>

            {/* Timeline entries (merged calls + comments) */}
            {(() => {
              type TimelineItem =
                | { kind: 'call'; at: string; entry: CallLogEntry }
                | { kind: 'comment'; at: string; entry: Comment }
              const items: TimelineItem[] = [
                ...visibleCallLog.map<TimelineItem>((c) => ({
                  kind: 'call',
                  at: c.call_date,
                  entry: c,
                })),
                ...comments.map<TimelineItem>((c) => ({
                  kind: 'comment',
                  at: c.created_at,
                  entry: c,
                })),
              ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

              if (items.length === 0) {
                return (
                  <p className="text-xs text-gray-400 italic">No activity yet</p>
                )
              }

              return (
                <div className="space-y-3">
                  {items.map((it) => {
                    if (it.kind === 'call') {
                      const c = it.entry
                      const contact = contacts.find((x) => x.id === c.contact_id)
                      const dot = OUTCOME_DOT_COLOR[c.outcome] ?? 'bg-gray-300'
                      return (
                        <div key={`call-${c.id}`} className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center relative">
                            <PhoneIcon className="w-4 h-4 text-gray-500" />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white ${dot}`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-gray-900">
                              <span className="font-medium">
                                {OUTCOME_LABELS[c.outcome] ?? c.outcome}
                              </span>
                              {contact && (
                                <span className="text-gray-500">
                                  {' '}
                                  · {contact.first_name} {contact.last_name}
                                </span>
                              )}
                            </div>
                            {c.notes && (
                              <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">
                                {c.notes}
                              </div>
                            )}
                            <div className="text-[11px] text-gray-400 mt-1">
                              {formatDate(c.call_date, { withTime: true })}
                              {c.created_by && profileMap.get(c.created_by) && (
                                <>
                                  {' '}
                                  · by {formatAssigned(profileMap.get(c.created_by) ?? null)}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    }
                    const c = it.entry
                    return (
                      <div key={`comment-${c.id}`} className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-9 h-9 bg-gray-50 rounded-full flex items-center justify-center">
                          <MessageSquareIcon className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-900 whitespace-pre-wrap">
                            {c.content}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-1">
                            {formatDate(c.created_at, { withTime: true })}
                            {c.created_by && profileMap.get(c.created_by) && (
                              <>
                                {' '}
                                · by {formatAssigned(profileMap.get(c.created_by) ?? null)}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {callLog.length > callLogLimit && (
                    <button
                      onClick={() => setCallLogLimit((n) => n + 10)}
                      className="text-xs text-gray-500 hover:text-gray-800"
                    >
                      Show older calls
                    </button>
                  )}
                </div>
              )
            })()}
          </section>
        </div>

        {/* RIGHT COLUMN: Addresses + Notes + Files + Lead source */}
        <div className="space-y-8">
          {/* Addresses */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900">Addresses</h2>
              <button
                onClick={() => setShowNewAddress(true)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
              >
                <PlusIcon className="w-4 h-4" />
                Add
              </button>
            </div>
            {addresses.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No addresses yet</p>
            ) : (
              <div className="space-y-2">
                {addresses.map((a) => (
                  <div
                    key={a.id}
                    className="group flex items-start justify-between gap-2 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {a.label && (
                          <span className="text-xs font-medium text-gray-700">{a.label}</span>
                        )}
                        {a.is_primary && (
                          <span className="text-[10px] uppercase tracking-wide text-amber-500">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-900 mt-0.5">{a.address}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[a.city, a.state, a.zip].filter(Boolean).join(', ') || '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          setEditAddress({
                            id: a.id,
                            label: a.label,
                            address: a.address,
                            city: a.city,
                            state: a.state,
                            zip: a.zip,
                            is_primary: a.is_primary,
                          })
                        }
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-white rounded transition-colors"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteAddressId(a.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Reminders */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900">Reminders</h2>
              <button
                onClick={() => setShowNewReminder(true)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
              >
                <PlusIcon className="w-4 h-4" />
                Add
              </button>
            </div>
            {reminders.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No reminders yet</p>
            ) : (
              <div className="space-y-2">
                {reminders.map((r) => {
                  const contact = contacts.find((c) => c.id === r.contact_id)
                  const isOverdue =
                    !r.is_completed && new Date(r.reminder_date) < new Date()
                  return (
                    <div
                      key={r.id}
                      className={`group flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                        r.is_completed ? 'opacity-60' : ''
                      }`}
                    >
                      <button
                        onClick={() => handleToggleReminder(r.id, r.is_completed)}
                        className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          r.is_completed
                            ? 'border-amber-400 bg-amber-500'
                            : 'border-gray-300 hover:border-amber-400'
                        }`}
                        aria-label={r.is_completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {r.is_completed && (
                          <CheckIcon className="w-2.5 h-2.5 text-white" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm flex items-center gap-1.5 ${
                            r.is_completed
                              ? 'text-gray-400 line-through'
                              : isOverdue
                              ? 'text-amber-600'
                              : 'text-gray-900'
                          }`}
                        >
                          <BellIcon className="w-4 h-4 flex-shrink-0" />
                          <span>
                            {formatDate(r.reminder_date, { withTime: true })}
                          </span>
                        </div>
                        {contact && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {contact.first_name} {contact.last_name}
                          </div>
                        )}
                        {r.note && (
                          <div
                            className={`text-xs mt-0.5 whitespace-pre-wrap ${
                              r.is_completed ? 'text-gray-400 line-through' : 'text-gray-600'
                            }`}
                          >
                            {r.note}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setDeleteReminderId(r.id)}
                        className="p-1 text-gray-300 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition"
                        title="Delete"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Notes */}
          <section>
            <h2 className="text-sm font-medium text-gray-900 mb-3">Notes</h2>
            <textarea
              value={company.notes ?? ''}
              onChange={(e) =>
                setCompany((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
              }
              onBlur={() => updateCompany({ notes: company.notes ?? null })}
              rows={4}
              placeholder="Add internal notes about this company…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </section>

          {/* Files */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900">Files &amp; Links</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                >
                  <UploadIcon className="w-4 h-4" />
                  Upload
                </button>
                <button
                  onClick={() => setShowAddLink(true)}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                >
                  <LinkIcon className="w-4 h-4" />
                  Link
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUploadFile(f)
                e.target.value = ''
              }}
            />
            {files.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No files yet</p>
            ) : (
              <div className="space-y-1.5">
                {files.map((f) => {
                  const kind = fileKind(f.file_type, f.file_name)
                  const Icon =
                    kind === 'link' ? LinkIcon : kind === 'image' ? ImageIcon : FileIcon
                  return (
                    <div
                      key={f.id}
                      className="group flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <a
                        href={f.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-gray-700 hover:text-amber-600 truncate flex-1"
                      >
                        {f.file_name}
                      </a>
                      <button
                        onClick={() => setDeleteFileId(f.id)}
                        className="p-1 text-gray-300 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition"
                        title="Delete"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Lead source */}
          <section>
            <h2 className="text-sm font-medium text-gray-900 mb-3">Lead source</h2>
            <div className="relative inline-block">
              <button
                onClick={() => setShowLeadSourceDropdown((v) => !v)}
                className="text-left bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-3 min-w-[180px] transition-colors"
              >
                <div className="text-[11px] text-gray-400">Source</div>
                <div className="text-sm font-medium text-gray-900 mt-0.5">
                  {company.lead_source
                    ? LEAD_SOURCE_LABELS[company.lead_source] ?? company.lead_source
                    : '—'}
                </div>
              </button>
              {showLeadSourceDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowLeadSourceDropdown(false)}
                  />
                  <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]">
                    <button
                      onClick={() => {
                        updateCompany({ lead_source: null })
                        setShowLeadSourceDropdown(false)
                      }}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                    >
                      — None —
                    </button>
                    {Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => {
                          updateCompany({ lead_source: value })
                          setShowLeadSourceDropdown(false)
                        }}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                      >
                        <span>{label}</span>
                        {company.lead_source === value && (
                          <CheckIcon className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Imported data */}
          {company.import_metadata && Object.keys(company.import_metadata).length > 0 && (
            <ImportedDataSection metadata={company.import_metadata} />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showEditCompany && (
        <EditCompanyModal
          company={
            {
              id: company.id,
              name: company.name,
              industry: company.industry,
              zone: company.zone,
              region: company.region,
              state: company.state,
              county: company.county,
              city: company.city,
              status: company.status,
              priority: company.priority,
              lead_source: company.lead_source,
              deal_value: company.deal_value,
              assigned_to: company.assigned_to,
            } as EditableCompany
          }
          onClose={() => setShowEditCompany(false)}
          onSaved={() => {
            setShowEditCompany(false)
            fetchAll()
          }}
        />
      )}

      {(showNewContact || editContact) && (
        <NewContactModal
          companyId={companyId}
          existing={editContact ?? undefined}
          onClose={() => {
            setShowNewContact(false)
            setEditContact(null)
          }}
          onSaved={() => {
            setShowNewContact(false)
            setEditContact(null)
            fetchAll()
          }}
        />
      )}

      {(showNewAddress || editAddress) && (
        <AddressModal
          companyId={companyId}
          existing={editAddress ?? undefined}
          onClose={() => {
            setShowNewAddress(false)
            setEditAddress(null)
          }}
          onSaved={() => {
            setShowNewAddress(false)
            setEditAddress(null)
            fetchAll()
          }}
        />
      )}

      {showLogCall && (
        <LogCallModal
          companyId={companyId}
          userId={userId}
          contacts={contacts.map((c) => ({
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
          }))}
          onClose={() => setShowLogCall(false)}
          onSaved={() => {
            setShowLogCall(false)
            fetchAll()
          }}
        />
      )}

      {showNewAppointment && (
        <NewAppointmentModal
          userId={userId}
          prefill={{
            companyId,
            contactId: appointmentContactPrefill,
          }}
          companies={[
            {
              id: company.id,
              name: company.name,
              city: company.city,
              state: company.state,
            },
          ]}
          contacts={contacts.map((c) => ({
            id: c.id,
            company_id: companyId,
            first_name: c.first_name,
            last_name: c.last_name,
            phone: c.phone,
            email: c.email,
            is_primary: c.is_primary,
          }))}
          assignees={profiles.map((p) => ({
            id: p.id,
            display_name: p.display_name,
          }))}
          onClose={() => {
            setShowNewAppointment(false)
            setAppointmentContactPrefill(null)
          }}
          onSaved={() => {
            setShowNewAppointment(false)
            setAppointmentContactPrefill(null)
            showToast('Appointment scheduled.')
          }}
        />
      )}

      {showNewReminder && (
        <NewReminderModal
          companyId={companyId}
          userId={userId}
          contacts={contacts.map((c) => ({
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
          }))}
          onClose={() => setShowNewReminder(false)}
          onSaved={() => {
            setShowNewReminder(false)
            fetchAll()
          }}
        />
      )}

      {deleteReminderId && (
        <ConfirmDialog
          title="Delete reminder?"
          message="This will permanently delete this reminder."
          onConfirm={() => handleDeleteReminder(deleteReminderId)}
          onCancel={() => setDeleteReminderId(null)}
          variant="destructive"
        />
      )}

      {showMergeContactsModal && selectedContactIds.size === 2 && (
        <MergeContactsModal
          contactIdA={[...selectedContactIds][0]}
          contactIdB={[...selectedContactIds][1]}
          onClose={() => setShowMergeContactsModal(false)}
          onMerged={() => {
            setShowMergeContactsModal(false)
            setMergeContactsMode(false)
            setSelectedContactIds(new Set())
            fetchAll()
            showToast('Contacts merged.')
          }}
        />
      )}

      {showAddLink && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
            onClick={() => setShowAddLink(false)}
          >
            <div
              className="mt-auto md:my-auto md:mx-auto w-full md:max-w-md h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex-none flex items-center justify-between px-4 border-b border-gray-200"
                style={{ minHeight: '56px' }}
              >
                <h3 className="text-lg font-semibold text-gray-900">Add Link</h3>
                <button
                  onClick={() => setShowAddLink(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">URL *</label>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://…"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <input
                    type="text"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder="Optional display name"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              </div>
              <div
                className="flex-none flex justify-end gap-2 px-5 py-4 border-t border-gray-200"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
              >
                <button
                  onClick={() => setShowAddLink(false)}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim()}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {showArchiveConfirm && company && (
        <ConfirmDialog
          title={company.archived ? 'Restore company?' : 'Archive company?'}
          message={
            company.archived
              ? `Restore "${company.name}"? It will reappear in the CRM list.`
              : `Archive "${company.name}"? It will be hidden from the CRM list but not deleted.`
          }
          confirmLabel={company.archived ? 'Restore' : 'Archive'}
          variant={company.archived ? 'default' : 'destructive'}
          loading={archiving}
          onConfirm={handleArchiveToggle}
          onCancel={() => (archiving ? null : setShowArchiveConfirm(false))}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete company?"
          message={`This will permanently delete ${company.name} and all associated contacts, calls, and notes. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteCompany}
          onCancel={() => setConfirmDelete(false)}
          loading={deleting}
          variant="destructive"
        />
      )}

      {confirmBlacklist && (
        <ConfirmDialog
          title="Blacklist company?"
          message={`Mark ${company.name} as blacklisted? You can always change the status back later.`}
          confirmLabel="Blacklist"
          onConfirm={handleBlacklist}
          onCancel={() => setConfirmBlacklist(false)}
          variant="default"
        />
      )}

      {confirmConvert && (
        <ConfirmDialog
          title="Convert to customer?"
          message={`Create a customer record for ${company.name} using the primary contact and address?`}
          confirmLabel="Convert"
          onConfirm={handleConvertToCustomer}
          onCancel={() => setConfirmConvert(false)}
          loading={converting}
          variant="default"
        />
      )}

      {deleteContactId && (
        <ConfirmDialog
          title="Delete contact?"
          message="This will permanently delete this contact."
          onConfirm={() => handleDeleteContact(deleteContactId)}
          onCancel={() => setDeleteContactId(null)}
          variant="destructive"
        />
      )}

      {deleteAddressId && (
        <ConfirmDialog
          title="Delete address?"
          message="This will permanently delete this address."
          onConfirm={() => handleDeleteAddress(deleteAddressId)}
          onCancel={() => setDeleteAddressId(null)}
          variant="destructive"
        />
      )}

      {deleteFileId && (
        <ConfirmDialog
          title="Delete file?"
          message="This will permanently remove the file."
          onConfirm={() => handleDeleteFile(deleteFileId)}
          onCancel={() => setDeleteFileId(null)}
          variant="destructive"
        />
      )}

      {showConvertToLead && (
        <ConvertCompanyToLeadModal
          userId={userId}
          companyId={companyId}
          companyName={company.name}
          companyCity={company.city}
          companyState={company.state}
          primaryContact={(() => {
            const p = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null
            if (!p) return null
            return {
              id: p.id,
              first_name: p.first_name,
              last_name: p.last_name,
              email: p.email,
              phone: p.phone,
            }
          })()}
          primaryAddress={(() => {
            const a = addresses.find((x) => x.is_primary) ?? addresses[0] ?? null
            if (!a) return null
            return {
              address: a.address,
              city: a.city,
              state: a.state,
              zip: a.zip,
            }
          })()}
          onClose={() => setShowConvertToLead(false)}
          onConverted={(leadId) => {
            setShowConvertToLead(false)
            showToast('Lead created.')
            router.push(`/sales/leads?lead=${leadId}`)
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <Portal>
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg">
            {toast}
          </div>
        </Portal>
      )}
    </div>
  )
}

function ImportedDataSection({ metadata }: { metadata: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(metadata)
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600"
      >
        {open ? (
          <ChevronDownIcon className="w-3 h-3" />
        ) : (
          <ChevronRightIcon className="w-3 h-3" />
        )}
        Additional imported fields
        <span className="text-gray-300">({entries.length})</span>
      </button>
      {open && (
        <dl className="mt-2 border-t border-gray-100 pt-2 space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[minmax(0,120px)_1fr] gap-2 text-xs">
              <dt className="text-gray-400 truncate" title={k}>
                {k}
              </dt>
              <dd className="text-gray-700 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
