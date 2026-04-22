'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, PlusIcon, UploadCloudIcon, FileTextIcon, AlertTriangleIcon, CheckIcon, XIcon, Trash2Icon, UserIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parseCsv, findSimilarNames } from '@/lib/csv'
import * as XLSX from 'xlsx'

interface ImportRecord {
  id: string
  file_name: string
  file_type: string
  record_count: number
  total_rows: number
  status: string
  column_mapping: Record<string, string> | null
  error_message: string | null
  imported_by: string
  created_at: string
}

interface StagingRecord {
  id: string
  import_id: string
  company_name: string
  industry: string | null; zone: string | null
  state: string | null; city: string | null
  status: string | null; priority: string | null; lead_source: string | null
  contact_first_name: string | null; contact_last_name: string | null
  contact_job_title: string | null; contact_email: string | null; contact_phone: string | null
  address: string | null
  number_of_locations: string | null; revenue_range: string | null; employee_range: string | null
  last_call_status: string | null; last_call_date: string | null
  contact_phones: Array<{ type: string; number: string }> | null
  extras: Record<string, string> | null
  duplicate_of: string | null; duplicate_score: number | null
  merge_decision: 'import' | 'merge' | 'skip' | 'rejected'
  approved: boolean; approved_at: string | null; approved_by: string | null
  row_index: number; created_at: string
}

interface ImportContact {
  id: string
  import_record_id: string
  contact_order: number
  first_name: string | null
  last_name: string | null
  title: string | null
  email: string | null
  phones: Array<{ type: string; number: string }> | null
  call_status: string | null
  call_date: string | null
}

type Step = 'upload' | 'mapping' | 'review' | 'importing' | 'done'

type TargetField =
  | 'skip' | 'company_name' | 'industry' | 'zone' | 'state'
  | 'city' | 'status' | 'priority' | 'lead_source'
  | 'contact_first_name' | 'contact_last_name' | 'contact_job_title'
  | 'contact_email' | 'contact_phone' | 'contact_mobile' | 'address'
  | 'number_of_locations' | 'revenue_range' | 'employee_range'
  | 'last_call_status' | 'last_call_date'

const TARGET_LABELS: Record<TargetField, string> = {
  skip: '— Skip this column —', company_name: 'Company name', industry: 'Industry',
  zone: 'Zone', state: 'State', city: 'City',
  status: 'Status', priority: 'Priority', lead_source: 'Lead source',
  contact_first_name: 'Contact first name', contact_last_name: 'Contact last name',
  contact_job_title: 'Contact job title', contact_email: 'Contact email',
  contact_phone: 'Contact phone (office)', contact_mobile: 'Contact mobile', address: 'Address',
  number_of_locations: 'Number of Locations', revenue_range: 'Revenue Range',
  employee_range: 'Employee Range',
  last_call_status: 'Last Call Status', last_call_date: 'Last Call Date',
}


function guessMapping(header: string): TargetField {
  const h = header.toLowerCase().trim()
  if (!h) return 'skip'
  if (/(company|business|account)\s*(name)?/.test(h)) return 'company_name'
  if (/^industry$|sector|vertical/.test(h)) return 'industry'
  if (/^zone$|territory/.test(h)) return 'zone'
  if (/^state$|^st$|province/.test(h)) return 'state'
  if (/^city$|town/.test(h)) return 'city'
  if (/^status$/.test(h)) return 'status'
  if (/priority/.test(h)) return 'priority'
  if (/(lead|referr?al)\s*source|source/.test(h)) return 'lead_source'
  if (/first\s*name|^fname$|^given/.test(h)) return 'contact_first_name'
  if (/last\s*name|^lname$|surname|family/.test(h)) return 'contact_last_name'
  if (/job\s*title|^title$|position|role/.test(h)) return 'contact_job_title'
  if (/email|^e-?mail$/.test(h)) return 'contact_email'
  if (/mobile|cell/.test(h)) return 'contact_mobile'
  if (/phone|telephone/.test(h)) return 'contact_phone'
  if (/street\s*addr|^address$|^addr$|address\s*(line\s*)?1/.test(h)) return 'address'
  if (/loc(ation)?s?\s*(count|number|#|num)?$|number\s*of\s*loc/.test(h)) return 'number_of_locations'
  if (/revenue\s*(range)?|annual\s*rev/.test(h)) return 'revenue_range'
  if (/employee\s*(range|count|size)?|head\s*count|company\s*size/.test(h)) return 'employee_range'
  if (/last\s*call\s*status|call\s*(outcome|result|disposition)/.test(h)) return 'last_call_status'
  if (/last\s*call\s*date|call\s*date/.test(h)) return 'last_call_date'
  return 'skip'
}

interface MappedRow {
  company_name: string
  industry: string | null; zone: string | null
  state: string | null; city: string | null
  status: string | null; priority: string | null; lead_source: string | null
  contact_first_name: string | null; contact_last_name: string | null
  contact_job_title: string | null; contact_email: string | null; contact_phone: string | null
  contact_mobile: string | null
  address: string | null
  number_of_locations: string | null; revenue_range: string | null; employee_range: string | null
  last_call_status: string | null; last_call_date: string | null
  extras: Record<string, string>
}

function buildMappedRow(headers: string[], row: string[], mapping: TargetField[]): MappedRow {
  const out: MappedRow = {
    company_name: '', industry: null, zone: null,
    state: null, city: null, status: null, priority: null,
    lead_source: null,
    contact_first_name: null, contact_last_name: null,
    contact_job_title: null, contact_email: null, contact_phone: null,
    contact_mobile: null,
    address: null,
    number_of_locations: null, revenue_range: null, employee_range: null,
    last_call_status: null, last_call_date: null,
    extras: {},
  }
  for (let i = 0; i < headers.length; i++) {
    const target = mapping[i] ?? 'skip'
    const raw = (row[i] ?? '').trim()
    if (target === 'skip') {
      if (raw && headers[i]) out.extras[headers[i]] = raw
      continue
    }
    if (!raw) continue
    if (target === 'company_name') out.company_name = raw
    else {
      ;(out as unknown as Record<string, unknown>)[target] = raw
    }
  }
  return out
}

function normalizeStatus(s: string | null): string | null {
  if (!s) return null
  const v = s.toLowerCase().trim().replace(/[\s-]/g, '_')
  if (['prospect', 'contacted', 'hot_lead', 'lost', 'blacklisted'].includes(v)) return v
  if (/hot/.test(v)) return 'hot_lead'
  if (/contact/.test(v)) return 'contacted'
  if (/black/.test(v)) return 'blacklisted'
  if (/lost|dead/.test(v)) return 'lost'
  if (/prospect|lead|new/.test(v)) return 'prospect'
  return null
}

function normalizePriority(p: string | null): 'high' | 'medium' | 'low' | null {
  if (!p) return null
  const v = p.toLowerCase().trim()
  if (v.startsWith('h')) return 'high'
  if (v.startsWith('m')) return 'medium'
  if (v.startsWith('l')) return 'low'
  return null
}

function mapCallOutcome(raw: string | null): string {
  if (!raw) return 'connected'
  const v = raw.toLowerCase().trim()
  if (/connect|spoke|reach/.test(v)) return 'connected'
  if (/voicemail|vm|left\s*message/.test(v)) return 'voicemail'
  if (/no\s*answer|n\/a|did\s*not/.test(v)) return 'no_answer'
  if (/busy/.test(v)) return 'busy'
  if (/wrong/.test(v)) return 'wrong_number'
  if (/email/.test(v)) return 'email_sent'
  if (/text|sms/.test(v)) return 'text_sent'
  return 'connected'
}

function buildContactPhonesJson(phone: string | null, mobile: string | null): Array<{ type: string; number: string }> | null {
  const phones: Array<{ type: string; number: string }> = []
  if (phone?.trim()) phones.push({ type: 'office', number: phone.trim() })
  if (mobile?.trim()) phones.push({ type: 'mobile', number: mobile.trim() })
  return phones.length > 0 ? phones : null
}

type View = 'history' | 'new-import' | 'staging'

export default function ImportCenterClient({ userId }: { userId: string }) {
  const [view, setView] = useState<View>('history')
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchImports()
  }, [])

  async function fetchImports() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('crm_imports')
      .select('*')
      .order('created_at', { ascending: false })
    setImports((data ?? []) as ImportRecord[])
    setLoading(false)
  }

  // ── Import flow state ──
  const supabase = useMemo(() => createClient(), [])

  async function deleteImport(id: string) {
    const { error } = await supabase.from('crm_imports').delete().eq('id', id)
    if (error) {
      console.error('Failed to delete import:', error)
      return
    }
    setImports((prev) => prev.filter((imp) => imp.id !== id))
  }

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState(0)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mapping, setMapping] = useState<TargetField[]>([])
  const [previewRowIdx, setPreviewRowIdx] = useState(0)
  const [editingField, setEditingField] = useState<TargetField | null>(null)

  type DupeMatch = { id: string; name: string; score: number }
  type RowDecision = 'import' | 'skip' | 'merge'
  interface ReviewedRow { index: number; mapped: MappedRow; duplicates: DupeMatch[]; decision: RowDecision; mergeTargetId: string | null }
  const [reviewedRows, setReviewedRows] = useState<ReviewedRow[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [finalStats, setFinalStats] = useState({ companies: 0, contacts: 0, skipped: 0, merged: 0 })

  // ── Staging view state ──
  const [stagingImportId, setStagingImportId] = useState<string | null>(null)
  const [stagingRecords, setStagingRecords] = useState<StagingRecord[]>([])
  const [stagingLoading, setStagingLoading] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)
  const [approveProgress, setApproveProgress] = useState<{ running: boolean; current: number; total: number }>({ running: false, current: 0, total: 0 })
  const [importContacts, setImportContacts] = useState<Map<string, ImportContact[]>>(new Map())

  async function fetchStagingRecords(importId: string) {
    setStagingLoading(true)
    const { data } = await supabase
      .from('crm_import_records')
      .select('*')
      .eq('import_id', importId)
      .order('row_index', { ascending: true })
    const records = (data ?? []) as StagingRecord[]
    setStagingRecords(records)
    setSelectedRows(new Set())

    const recordIds = records.map((r) => r.id)
    if (recordIds.length > 0) {
      const { data: contactRows } = await supabase
        .from('crm_import_contacts')
        .select('*')
        .in('import_record_id', recordIds)
        .order('contact_order', { ascending: true })
      const cMap = new Map<string, ImportContact[]>()
      for (const c of (contactRows ?? []) as ImportContact[]) {
        const arr = cMap.get(c.import_record_id) ?? []
        arr.push(c)
        cMap.set(c.import_record_id, arr)
      }
      setImportContacts(cMap)
    } else {
      setImportContacts(new Map())
    }
    setStagingLoading(false)
  }

  function openStagingView(importId: string) {
    setStagingImportId(importId)
    fetchStagingRecords(importId)
    resetImportFlow()
    setView('staging')
  }

  const mappedTargets = useMemo(() => new Set(mapping.filter((m) => m !== 'skip')), [mapping])
  const companyNameMapped = mappedTargets.has('company_name')

  // Auto-guess mapping when headers change
  useEffect(() => {
    if (headers.length === 0) { setMapping([]); return }
    const used = new Set<TargetField>()
    setMapping(headers.map((h) => {
      const guess = guessMapping(h)
      if (guess !== 'skip' && used.has(guess)) return 'skip' as TargetField
      if (guess !== 'skip') used.add(guess)
      return guess
    }))
  }, [headers])

  function setFieldSource(target: TargetField, sourceIdx: number | null) {
    setMapping((prev) => {
      const next = [...prev]
      for (let i = 0; i < next.length; i++) {
        if (next[i] === target) next[i] = 'skip'
      }
      if (sourceIdx !== null && sourceIdx >= 0 && sourceIdx < next.length) {
        next[sourceIdx] = target
      }
      return next
    })
  }

  const handleFile = useCallback(async (file: File) => {
    setParseError(null)
    setDetectedFormat(null)
    setFileName(file.name)
    setFileSize(file.size)
    const name = file.name.toLowerCase()
    const applyParsed = (parsed: string[][]) => {
      if (parsed.length < 2) { setParseError('File has no data rows.'); return }
      const [head, ...rest] = parsed
      setHeaders(head.map((h) => h.trim()))
      setRows(rest)
    }
    try {
      if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
        setDetectedFormat(name.endsWith('.tsv') ? 'TSV' : 'CSV')
        const text = await file.text()
        applyParsed(parseCsv(text, name.endsWith('.tsv') ? '\t' : undefined))
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.numbers')) {
        setDetectedFormat(name.endsWith('.numbers') ? 'Numbers' : name.endsWith('.xlsx') ? 'Excel (.xlsx)' : 'Excel (.xls)')
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        if (!sheetName) { setParseError('No sheets found.'); return }
        const data: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
        applyParsed(data.map((row) => row.map((cell) => String(cell ?? ''))))
      } else if (name.endsWith('.pdf')) {
        setDetectedFormat('PDF')
        const buf = await file.arrayBuffer()
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise
        const lines: string[] = []
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p)
          const content = await page.getTextContent()
          let currentLine = '', lastY: number | null = null
          for (const item of content.items) {
            if (!('str' in item)) continue
            const y = Math.round((item as { transform: number[] }).transform[5])
            if (lastY !== null && Math.abs(y - lastY) > 3) { if (currentLine.trim()) lines.push(currentLine.trim()); currentLine = '' }
            currentLine += (currentLine ? '\t' : '') + item.str; lastY = y
          }
          if (currentLine.trim()) lines.push(currentLine.trim())
        }
        if (lines.length < 2) { setParseError("PDF doesn't contain tabular data."); return }
        const tabCounts = lines.map((l) => (l.match(/\t/g) ?? []).length)
        const medianTabs = tabCounts.sort((a, b) => a - b)[Math.floor(tabCounts.length / 2)]
        if (medianTabs < 1) { setParseError("PDF doesn't contain tabular data."); return }
        applyParsed(lines.filter((l) => (l.match(/\t/g) ?? []).length >= medianTabs - 1).map((l) => l.split('\t')))
      } else {
        setParseError('Unsupported file format.')
      }
    } catch { setParseError('Could not read the file.') }
  }, [])

  function resetImportFlow() {
    setStep('upload'); setFileName(null); setFileSize(0); setHeaders([]); setRows([])
    setParseError(null); setDetectedFormat(null); setMapping([]); setPreviewRowIdx(0); setEditingField(null); setReviewedRows([])
    setImportProgress(0); setImportTotal(0); setImportError(null)
    setFinalStats({ companies: 0, contacts: 0, skipped: 0, merged: 0 })
  }

  async function addImportContact(importRecordId: string) {
    const existing = importContacts.get(importRecordId) ?? []
    const nextOrder = existing.length > 0 ? Math.max(...existing.map((c) => c.contact_order)) + 1 : 1
    const { data, error } = await supabase.from('crm_import_contacts').insert({
      import_record_id: importRecordId, contact_order: nextOrder,
    }).select('*').single()
    if (!error && data) {
      setImportContacts((prev) => {
        const next = new Map(prev)
        const arr = [...(next.get(importRecordId) ?? []), data as ImportContact]
        next.set(importRecordId, arr)
        return next
      })
    }
  }

  async function deleteImportContact(contactId: string, importRecordId: string) {
    const { error } = await supabase.from('crm_import_contacts').delete().eq('id', contactId)
    if (!error) {
      setImportContacts((prev) => {
        const next = new Map(prev)
        const arr = (next.get(importRecordId) ?? []).filter((c) => c.id !== contactId)
        next.set(importRecordId, arr)
        return next
      })
    }
  }

  async function updateImportContactField(contactId: string, importRecordId: string, field: string, value: unknown) {
    const { error } = await supabase.from('crm_import_contacts').update({ [field]: value }).eq('id', contactId)
    if (!error) {
      setImportContacts((prev) => {
        const next = new Map(prev)
        const arr = (next.get(importRecordId) ?? []).map((c) => c.id === contactId ? { ...c, [field]: value } : c)
        next.set(importRecordId, arr)
        return next
      })
    }
  }

  async function updateImportContactPhones(contactId: string, importRecordId: string, phones: Array<{ type: string; number: string }>) {
    const { error } = await supabase.from('crm_import_contacts').update({ phones: phones.length > 0 ? phones : null }).eq('id', contactId)
    if (!error) {
      setImportContacts((prev) => {
        const next = new Map(prev)
        const arr = (next.get(importRecordId) ?? []).map((c) => c.id === contactId ? { ...c, phones: phones.length > 0 ? phones : null } : c)
        next.set(importRecordId, arr)
        return next
      })
    }
  }

  async function updateStagingField(id: string, field: string, value: string | number | null) {
    const { error } = await supabase.from('crm_import_records').update({ [field]: value }).eq('id', id)
    if (!error) setStagingRecords((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r))
    setEditingCell(null)
  }

  async function setStagingDecision(ids: string[], decision: StagingRecord['merge_decision']) {
    const { error } = await supabase.from('crm_import_records').update({ merge_decision: decision }).in('id', ids)
    if (!error) setStagingRecords((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, merge_decision: decision } : r))
    setSelectedRows(new Set())
  }

  async function deleteStagingRows(ids: string[]) {
    const { error } = await supabase.from('crm_import_records').delete().in('id', ids)
    if (!error) setStagingRecords((prev) => prev.filter((r) => !ids.includes(r.id)))
    setSelectedRows(new Set())
  }

  async function approveAndImport(ids: string[]) {
    setApproveProgress({ running: true, current: 0, total: ids.length })
    const toApprove = stagingRecords.filter((r) => ids.includes(r.id) && r.merge_decision !== 'skip' && r.merge_decision !== 'rejected')
    const batchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    let done = 0

    try {
      const newRows = toApprove.filter((r) => r.merge_decision === 'import')
      const mergeRows = toApprove.filter((r) => r.merge_decision === 'merge' && r.duplicate_of)

      const BATCH = 50
      for (let start = 0; start < newRows.length; start += BATCH) {
        const chunk = newRows.slice(start, start + BATCH)
        const payload = chunk.map((r) => ({
            name: r.company_name, industry: r.industry, zone: r.zone,
            address: r.address, state: r.state, city: r.city,
            status: normalizeStatus(r.status) ?? 'prospect',
            priority: normalizePriority(r.priority) ?? 'medium',
            lead_source: r.lead_source,
            number_of_locations: r.number_of_locations ? parseInt(r.number_of_locations, 10) || null : null,
            revenue_range: r.revenue_range || null,
            employee_range: r.employee_range || null,
            import_metadata: r.extras && Object.keys(r.extras).length > 0 ? r.extras : null,
            import_batch_id: batchId, created_by: userId, archived: false,
          }))
        const { data: inserted, error: insertErr } = await supabase.from('companies').insert(payload).select('id, name')
        if (insertErr) throw insertErr
        const insertedRows = (inserted ?? []) as { id: string; name: string }[]

        const contactPayload: Array<Record<string, unknown>> = []
        const contactPhoneMap: Map<number, { companyId: string; phones: Array<{ type: string; number: string }> }> = new Map()
        const contactCallData: Map<number, { callStatus: string | null; callDate: string | null }> = new Map()
        for (let i = 0; i < chunk.length; i++) {
          const row = chunk[i], co = insertedRows[i]
          if (!co) continue
          const contacts = importContacts.get(row.id) ?? []
          if (contacts.length > 0) {
            for (let ci = 0; ci < contacts.length; ci++) {
              const ic = contacts[ci]
              if (!ic.first_name && !ic.last_name) continue
              const cpIdx = contactPayload.length
              const primaryPhone = ic.phones?.[0]?.number || null
              contactPayload.push({ company_id: co.id, first_name: ic.first_name || '', last_name: ic.last_name || '', job_title: ic.title, email: ic.email, phone: primaryPhone, is_primary: ci === 0, import_batch_id: batchId })
              if (ic.phones && ic.phones.length > 0) contactPhoneMap.set(cpIdx, { companyId: co.id, phones: ic.phones })
              if (ic.call_status || ic.call_date) contactCallData.set(cpIdx, { callStatus: ic.call_status, callDate: ic.call_date })
            }
          } else if (row.contact_first_name || row.contact_last_name) {
            const cpIdx = contactPayload.length
            contactPayload.push({ company_id: co.id, first_name: row.contact_first_name || '', last_name: row.contact_last_name || '', job_title: row.contact_job_title, email: row.contact_email, phone: row.contact_phone, is_primary: true, import_batch_id: batchId })
            const phones = row.contact_phones ?? buildContactPhonesJson(row.contact_phone, null) ?? []
            if (phones.length > 0) contactPhoneMap.set(cpIdx, { companyId: co.id, phones })
            if (row.last_call_status || row.last_call_date) contactCallData.set(cpIdx, { callStatus: row.last_call_status, callDate: row.last_call_date })
          }
        }
        let allInsertedContacts: Array<{ id: string; company_id: string }> = []
        if (contactPayload.length > 0) {
          const { data: insertedContacts, error: cerr } = await supabase.from('contacts').insert(contactPayload).select('id, company_id')
          if (cerr) throw cerr
          allInsertedContacts = (insertedContacts ?? []) as Array<{ id: string; company_id: string }>
          const phonePayload: Array<Record<string, unknown>> = []
          for (const [idx, entry] of contactPhoneMap.entries()) {
            const contact = allInsertedContacts[idx]
            if (!contact) continue
            entry.phones.forEach((p, pi) => {
              phonePayload.push({ contact_id: contact.id, company_id: entry.companyId, phone_number: p.number, phone_type: p.type, is_primary: pi === 0 })
            })
          }
          if (phonePayload.length > 0) await supabase.from('contact_phone_numbers').insert(phonePayload)
        }
        const callLogPayload: Array<Record<string, unknown>> = []
        for (let i = 0; i < chunk.length; i++) {
          const row = chunk[i], co = insertedRows[i]
          if (!co) continue
          if (row.last_call_status || row.last_call_date) {
            const callDate = row.last_call_date ? new Date(row.last_call_date) : new Date()
            const validDate = !isNaN(callDate.getTime()) ? callDate.toISOString() : new Date().toISOString()
            callLogPayload.push({
              company_id: co.id,
              outcome: mapCallOutcome(row.last_call_status),
              notes: `Imported from ${stagingImportId ? 'import' : 'file'} — Original status: ${row.last_call_status || 'N/A'}`,
              call_date: validDate,
              created_by: userId,
            })
          }
          for (const [cpIdx, cd] of contactCallData.entries()) {
            const contact = allInsertedContacts[cpIdx]
            if (contact && (cd.callStatus || cd.callDate)) {
              const callDate = cd.callDate ? new Date(cd.callDate) : new Date()
              const validDate = !isNaN(callDate.getTime()) ? callDate.toISOString() : new Date().toISOString()
              callLogPayload.push({
                company_id: contact.company_id,
                outcome: mapCallOutcome(cd.callStatus),
                notes: `Imported — Original status: ${cd.callStatus || 'N/A'}`,
                call_date: validDate,
                created_by: userId,
              })
            }
          }
        }
        if (callLogPayload.length > 0) { await supabase.from('crm_call_log').insert(callLogPayload) }

        done += chunk.length
        setApproveProgress((p) => ({ ...p, current: done }))
      }

      for (const row of mergeRows) {
        const targetId = row.duplicate_of!
        const contacts = importContacts.get(row.id) ?? []
        if (contacts.length > 0) {
          for (const ic of contacts) {
            if (!ic.first_name && !ic.last_name) continue
            const primaryPhone = ic.phones?.[0]?.number || null
            const { data: mergeContact } = await supabase.from('contacts').insert({ company_id: targetId, first_name: ic.first_name || '', last_name: ic.last_name || '', job_title: ic.title, email: ic.email, phone: primaryPhone, is_primary: false, import_batch_id: batchId }).select('id').single()
            if (mergeContact && ic.phones && ic.phones.length > 0) {
              await supabase.from('contact_phone_numbers').insert(ic.phones.map((p, pi) => ({ contact_id: mergeContact.id, company_id: targetId, phone_number: p.number, phone_type: p.type, is_primary: pi === 0 })))
            }
            if (ic.call_status || ic.call_date) {
              const callDate = ic.call_date ? new Date(ic.call_date) : new Date()
              const validDate = !isNaN(callDate.getTime()) ? callDate.toISOString() : new Date().toISOString()
              await supabase.from('crm_call_log').insert({ company_id: targetId, outcome: mapCallOutcome(ic.call_status), notes: `Imported — Original status: ${ic.call_status || 'N/A'}`, call_date: validDate, created_by: userId })
            }
          }
        } else if (row.contact_first_name || row.contact_last_name) {
          const { data: mergeContact } = await supabase.from('contacts').insert({ company_id: targetId, first_name: row.contact_first_name || '', last_name: row.contact_last_name || '', job_title: row.contact_job_title, email: row.contact_email, phone: row.contact_phone, is_primary: false, import_batch_id: batchId }).select('id').single()
          if (mergeContact) {
            const phones = row.contact_phones ?? buildContactPhonesJson(row.contact_phone, null) ?? []
            if (phones.length > 0) {
              await supabase.from('contact_phone_numbers').insert(phones.map((p, pi) => ({ contact_id: mergeContact.id, company_id: targetId, phone_number: p.number, phone_type: p.type, is_primary: pi === 0 })))
            }
          }
        }
        if (row.last_call_status || row.last_call_date) {
          const callDate = row.last_call_date ? new Date(row.last_call_date) : new Date()
          const validDate = !isNaN(callDate.getTime()) ? callDate.toISOString() : new Date().toISOString()
          await supabase.from('crm_call_log').insert({
            company_id: targetId,
            outcome: mapCallOutcome(row.last_call_status),
            notes: `Imported from import — Original status: ${row.last_call_status || 'N/A'}`,
            call_date: validDate,
            created_by: userId,
          })
        }
        done += 1
        setApproveProgress((p) => ({ ...p, current: done }))
      }

      // Mark approved rows
      const approvedIds = toApprove.map((r) => r.id)
      await supabase.from('crm_import_records').update({ approved: true, approved_at: new Date().toISOString(), approved_by: userId }).in('id', approvedIds)
      setStagingRecords((prev) => prev.map((r) => approvedIds.includes(r.id) ? { ...r, approved: true, approved_at: new Date().toISOString(), approved_by: userId } : r))

      // Check if all rows are now approved or rejected — update import status
      const remaining = stagingRecords.filter((r) => !approvedIds.includes(r.id) && !r.approved && r.merge_decision !== 'rejected' && r.merge_decision !== 'skip')
      if (remaining.length === 0 && stagingImportId) {
        await supabase.from('crm_imports').update({ status: 'completed', record_count: toApprove.length }).eq('id', stagingImportId)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approve failed'
      alert(msg)
    } finally {
      setApproveProgress({ running: false, current: 0, total: 0 })
      setSelectedRows(new Set())
    }
  }

  if (view === 'staging') {
    const activeRecords = stagingRecords.filter((r) => r.merge_decision !== 'rejected' && !r.approved)
    const rejectedRecords = stagingRecords.filter((r) => r.merge_decision === 'rejected' && !r.approved)
    const approvedRecords = stagingRecords.filter((r) => r.approved)
    const allActiveSelected = activeRecords.length > 0 && activeRecords.every((r) => selectedRows.has(r.id))
    const COMPANY_FIELDS: { key: keyof StagingRecord; label: string; width: string }[] = [
      { key: 'company_name', label: 'Company', width: 'min-w-[180px]' },
      { key: 'industry', label: 'Industry', width: 'min-w-[120px]' },
      { key: 'city', label: 'City', width: 'min-w-[100px]' },
      { key: 'state', label: 'State', width: 'min-w-[80px]' },
      { key: 'zone', label: 'Zone', width: 'min-w-[80px]' },
      { key: 'number_of_locations', label: 'Locations', width: 'min-w-[80px]' },
      { key: 'revenue_range', label: 'Revenue', width: 'min-w-[100px]' },
      { key: 'employee_range', label: 'Employees', width: 'min-w-[90px]' },
      { key: 'status', label: 'CRM Status', width: 'min-w-[110px]' },
      { key: 'priority', label: 'Priority', width: 'min-w-[80px]' },
    ]
    const CRM_STATUSES = ['prospect', 'contacted', 'hot_lead', 'lost', 'blacklisted'] as const

    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 pt-4 pb-2">
          <button onClick={() => { fetchImports(); setView('history') }} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Import Center
          </button>
        </div>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Review Import</h1>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">{activeRecords.length} pending</span>
            {approvedRecords.length > 0 && <span className="text-green-600">· {approvedRecords.length} approved</span>}
            {rejectedRecords.length > 0 && <span className="text-red-500">· {rejectedRecords.length} rejected</span>}
          </div>
        </div>

        {approveProgress.running && (
          <div className="px-4 sm:px-6 mb-3">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 mb-2">Approving… {approveProgress.current} of {approveProgress.total}</p>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${approveProgress.total === 0 ? 0 : Math.round((approveProgress.current / approveProgress.total) * 100)}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Bulk actions */}
        <div className="px-4 sm:px-6 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => approveAndImport(selectedRows.size > 0 ? Array.from(selectedRows) : activeRecords.map((r) => r.id))} disabled={approveProgress.running || activeRecords.length === 0} className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-500 disabled:opacity-40 transition-colors">
              <CheckIcon className="w-3 h-3 inline mr-1" />
              {selectedRows.size > 0 ? `Approve Selected (${selectedRows.size})` : `Approve All (${activeRecords.length})`}
            </button>
            {selectedRows.size > 0 && (
              <>
                <button onClick={() => setStagingDecision(Array.from(selectedRows), 'rejected')} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors">
                  <XIcon className="w-3 h-3 inline mr-1" />
                  Reject ({selectedRows.size})
                </button>
                <button onClick={() => deleteStagingRows(Array.from(selectedRows))} className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
                  <Trash2Icon className="w-3 h-3 inline mr-1" />
                  Delete ({selectedRows.size})
                </button>
              </>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6 pb-6">
          {stagingLoading ? (
            <p className="text-sm text-gray-400 italic py-8 text-center">Loading staged records…</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <input type="checkbox" checked={allActiveSelected} onChange={(e) => { if (e.target.checked) setSelectedRows(new Set(activeRecords.map((r) => r.id))); else setSelectedRows(new Set()) }} className="w-3.5 h-3.5 text-amber-500 rounded" />
                    </th>
                    <th className="px-3 py-2 text-left w-8">#</th>
                    {COMPANY_FIELDS.map((f) => (
                      <th key={f.key} className={`px-3 py-2 text-left font-medium text-gray-600 ${f.width}`}>{f.label}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-gray-600 min-w-[80px]">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRecords.map((rec, gi) => (
                    <StagingCompanyWithContact
                      key={rec.id}
                      rec={rec}
                      groupIndex={gi}
                      contacts={importContacts.get(rec.id) ?? []}
                      companyFields={COMPANY_FIELDS}
                      crmStatuses={CRM_STATUSES}
                      selected={selectedRows.has(rec.id)}
                      onSelect={(sel) => { setSelectedRows((prev) => { const next = new Set(prev); if (sel) next.add(rec.id); else next.delete(rec.id); return next }) }}
                      editingCell={editingCell}
                      onStartEdit={(field) => setEditingCell({ id: rec.id, field })}
                      onSave={(field, value) => updateStagingField(rec.id, field, value)}
                      onDecisionChange={(d) => setStagingDecision([rec.id], d)}
                      onAddContact={() => addImportContact(rec.id)}
                      onDeleteContact={(cid) => deleteImportContact(cid, rec.id)}
                      onUpdateContactField={(cid, field, val) => updateImportContactField(cid, rec.id, field, val)}
                      onUpdateContactPhones={(cid, phones) => updateImportContactPhones(cid, rec.id, phones)}
                      dimmed={false}
                    />
                  ))}
                </tbody>
              </table>

              {rejectedRecords.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-red-50 border-t border-b border-red-100 text-xs font-medium text-red-600">
                    Rejected ({rejectedRecords.length})
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {rejectedRecords.map((rec, gi) => (
                        <StagingCompanyWithContact
                          key={rec.id}
                          rec={rec}
                          groupIndex={gi}
                          contacts={importContacts.get(rec.id) ?? []}
                          companyFields={COMPANY_FIELDS}
                          crmStatuses={CRM_STATUSES}
                          selected={false}
                          onSelect={() => {}}
                          editingCell={null}
                          onStartEdit={() => {}}
                          onSave={() => {}}
                          onDecisionChange={(d) => setStagingDecision([rec.id], d)}
                          onAddContact={() => {}}
                          onDeleteContact={() => {}}
                          onUpdateContactField={() => {}}
                          onUpdateContactPhones={() => {}}
                          dimmed
                        />
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {approvedRecords.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-green-50 border-t border-b border-green-100 text-xs font-medium text-green-600">
                    Approved ({approvedRecords.length})
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {approvedRecords.map((rec, gi) => (
                        <StagingCompanyWithContact
                          key={rec.id}
                          rec={rec}
                          groupIndex={gi}
                          contacts={importContacts.get(rec.id) ?? []}
                          companyFields={COMPANY_FIELDS}
                          crmStatuses={CRM_STATUSES}
                          selected={false}
                          onSelect={() => {}}
                          editingCell={null}
                          onStartEdit={() => {}}
                          onSave={() => {}}
                          onDecisionChange={() => {}}
                          onAddContact={() => {}}
                          onDeleteContact={() => {}}
                          onUpdateContactField={() => {}}
                          onUpdateContactPhones={() => {}}
                          dimmed
                          approved
                        />
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (view === 'history') {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 pt-4 pb-2">
          <Link href="/sales/crm" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600">
            <ArrowLeftIcon className="w-4 h-4" />
            Back to CRM
          </Link>
        </div>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <h1 className="text-2xl font-bold text-gray-900">Import Center</h1>
          <button
            onClick={() => setView('new-import')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            New Import
          </button>
        </div>

        <div className="px-4 sm:px-6 pb-6">
          {loading ? (
            <p className="text-sm text-gray-400 italic py-8 text-center">Loading...</p>
          ) : imports.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
              <UploadCloudIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No imports yet.</p>
              <p className="text-xs text-gray-400 mt-1">Click + New Import to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {imports.map((imp) => (
                <ImportHistoryCard key={imp.id} imp={imp} onReview={openStagingView} onDelete={deleteImport} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const stepLabels = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Map Fields' },
    { key: 'review', label: 'Review' },
    { key: 'importing', label: 'Import' },
  ] as const
  const activeIdx = stepLabels.findIndex((l) => l.key === step)

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="px-4 sm:px-6 pt-4 pb-2">
        <button
          onClick={() => { resetImportFlow(); setView('history') }}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Import Center
        </button>
      </div>
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">New Import</h1>
        <div className="flex items-center gap-1.5 text-xs">
          {stepLabels.map((l, i) => {
            const isCurrent = i === activeIdx
            const isDone = i < activeIdx || step === 'done'
            return (
              <div key={l.key} className="flex items-center gap-1.5">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${isDone ? 'bg-amber-500 text-white' : isCurrent ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {i + 1}
                </span>
                <span className={isCurrent ? 'text-gray-900 font-medium' : isDone ? 'text-gray-500' : 'text-gray-400'}>{l.label}</span>
                {i < stepLabels.length - 1 && <span className="text-gray-300 mx-1">→</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          {step === 'upload' && <UploadStep />}
          {step === 'mapping' && <MappingStep />}
          {step === 'review' && <ReviewStep />}
          {step === 'importing' && <ImportingStep />}
          {step === 'done' && <DoneStep />}
        </div>
      </div>
    </div>
  )

  function UploadStep() {
    const previewRows = rows.slice(0, 3)
    return (
      <div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
          className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-12 cursor-pointer transition-colors ${dragging ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
        >
          <UploadCloudIcon className="w-10 h-10 text-gray-300" />
          <div className="text-sm text-gray-700 font-medium">Drop a file here, or click to browse</div>
          <p className="text-xs text-gray-400">Accepts CSV, Excel (.xlsx/.xls), Numbers, or PDF</p>
          <input ref={fileInputRef} type="file" accept=".csv,.tsv,.xlsx,.xls,.numbers,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); if (fileInputRef.current) fileInputRef.current.value = '' }} />
        </label>
        {parseError && <p className="text-xs text-red-600 mt-3">{parseError}</p>}
        {fileName && headers.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm text-gray-700 mb-2 flex-wrap">
              <FileTextIcon className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{fileName}</span>
              <span className="text-gray-400">· {(fileSize / 1024).toFixed(1)} KB · {rows.length} rows, {headers.length} columns</span>
              {detectedFormat && <span className="inline-flex px-2 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-600 rounded-full">{detectedFormat}</span>}
            </div>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>{headers.map((h, i) => <th key={i} className="text-left px-3 py-2 font-medium text-gray-700 border-b border-gray-200 whitespace-nowrap">{h || <span className="text-gray-300">(empty)</span>}</th>)}</tr>
                </thead>
                <tbody>
                  {previewRows.map((r, ri) => (
                    <tr key={ri} className="border-b border-gray-100 last:border-b-0">
                      {headers.map((_, ci) => <td key={ci} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[200px] truncate" title={r[ci] ?? ''}>{r[ci] ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button onClick={() => setStep('mapping')} disabled={headers.length === 0 || rows.length === 0} className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors">Next</button>
        </div>
      </div>
    )
  }

  function MappingStep() {
    const COMPANY_FIELDS: { target: TargetField; label: string }[] = [
      { target: 'company_name', label: 'Company Name' },
      { target: 'industry', label: 'Industry' },
      { target: 'zone', label: 'Zone' },
      { target: 'address', label: 'Street Address' },
      { target: 'city', label: 'City' },
      { target: 'state', label: 'State' },
      { target: 'number_of_locations', label: 'Number of Locations' },
      { target: 'revenue_range', label: 'Revenue Range' },
      { target: 'employee_range', label: 'Employee Range' },
      { target: 'status', label: 'Status' },
      { target: 'priority', label: 'Priority' },
      { target: 'lead_source', label: 'Lead Source' },
    ]
    const CONTACT_FIELDS: { target: TargetField; label: string }[] = [
      { target: 'contact_first_name', label: 'First Name' },
      { target: 'contact_last_name', label: 'Last Name' },
      { target: 'contact_job_title', label: 'Job Title' },
      { target: 'contact_email', label: 'Email' },
      { target: 'contact_phone', label: 'Office Phone' },
      { target: 'contact_mobile', label: 'Mobile Phone' },
      { target: 'last_call_status', label: 'Last Call Status' },
      { target: 'last_call_date', label: 'Last Call Date' },
    ]

    const reverseMap = new Map<TargetField, number>()
    mapping.forEach((target, idx) => { if (target !== 'skip') reverseMap.set(target, idx) })
    const mappedCount = reverseMap.size
    const totalFields = COMPANY_FIELDS.length + CONTACT_FIELDS.length
    const previewRow = rows[previewRowIdx] ?? []
    const unmappedCols = headers.map((h, i) => ({ header: h, index: i, sample: previewRow[i] ?? '' })).filter((c) => (mapping[c.index] ?? 'skip') === 'skip' && c.header)

    function renderFieldCard(f: { target: TargetField; label: string }) {
      const srcIdx = reverseMap.get(f.target)
      const isMapped = srcIdx !== undefined
      const value = isMapped ? (previewRow[srcIdx] ?? '').trim() || null : null
      const sourceColName = isMapped ? (headers[srcIdx] || `Column ${srcIdx + 1}`) : null
      const isRequired = f.target === 'company_name'
      const isEditing = editingField === f.target

      if (isEditing) {
        return (
          <div key={f.target} className="border border-amber-400 rounded-lg p-3 bg-amber-50/50 ring-2 ring-amber-400/20">
            <div className="text-[12px] font-medium text-gray-500 mb-1.5">{f.label}{isRequired ? ' *' : ''}</div>
            <select
              autoFocus
              value={isMapped ? String(srcIdx) : '__none__'}
              onChange={(e) => {
                const val = e.target.value
                setFieldSource(f.target, val === '__none__' ? null : Number(val))
                setEditingField(null)
              }}
              onBlur={() => setEditingField(null)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
            >
              <option value="__none__">— None (skip this field) —</option>
              {headers.map((h, i) => {
                const sample = (previewRow[i] ?? '').trim()
                const alreadyUsed = mapping[i] !== 'skip' && mapping[i] !== f.target
                return (
                  <option key={i} value={String(i)} disabled={alreadyUsed}>
                    {h || `Column ${i + 1}`}{sample ? ` → ${sample}` : ''}{alreadyUsed ? ` (used by ${TARGET_LABELS[mapping[i]]})` : ''}
                  </option>
                )
              })}
            </select>
          </div>
        )
      }

      return (
        <div
          key={f.target}
          onClick={() => setEditingField(f.target)}
          className={`border rounded-lg p-3 cursor-pointer transition-all hover:border-amber-300 hover:shadow-sm ${
            isMapped ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50/50'
          }`}
        >
          <div className="text-[12px] font-medium text-gray-400 mb-0.5">{f.label}{isRequired ? ' *' : ''}</div>
          {isMapped ? (
            <>
              <div className="text-[14px] text-gray-900 truncate">{value || <span className="text-gray-300">—</span>}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 truncate">← {sourceColName}</div>
            </>
          ) : (
            <>
              <div className="text-[14px] text-red-400 italic">— Unmapped —</div>
              <div className="text-[11px] text-gray-300 mt-0.5">Click to map a column</div>
            </>
          )}
        </div>
      )
    }

    return (
      <div>
        {/* Header with row navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <p className="text-xs text-gray-500">Click any field to change which source column maps to it.</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setPreviewRowIdx((i) => Math.max(0, i - 1))}
              disabled={previewRowIdx === 0}
              className="px-2 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-xs text-gray-500 tabular-nums">
              Record {previewRowIdx + 1} of {rows.length}
            </span>
            <button
              onClick={() => setPreviewRowIdx((i) => Math.min(rows.length - 1, i + 1))}
              disabled={previewRowIdx >= rows.length - 1}
              className="px-2 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>

        {/* Company card */}
        <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Company</span>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMPANY_FIELDS.map(renderFieldCard)}
          </div>
        </div>

        {/* Contact card */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
            <UserIcon className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Contact</span>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CONTACT_FIELDS.map(renderFieldCard)}
          </div>
        </div>

        {/* Unmapped source columns */}
        {unmappedCols.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2">
              Unmapped source columns ({unmappedCols.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {unmappedCols.map((c) => (
                <div key={c.index} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-500">
                  <span className="font-medium text-gray-700">{c.header}</span>
                  {c.sample && <span className="text-gray-400 truncate max-w-[120px]">: {c.sample}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary & navigation */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">{mappedCount} of {totalFields} fields mapped</span>
        </div>
        {!companyNameMapped && <p className="text-xs text-amber-600 mt-2">At least one column must be mapped to <strong>Company name</strong>.</p>}
        <div className="mt-4 flex justify-between">
          <button onClick={() => setStep('upload')} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg">Back</button>
          <button onClick={async () => { setStep('review'); await runDuplicateDetection() }} disabled={!companyNameMapped} className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors">Continue</button>
        </div>
      </div>
    )
  }

  async function runDuplicateDetection() {
    setReviewLoading(true)
    const built: { mapped: MappedRow; index: number }[] = []
    for (let i = 0; i < rows.length; i++) {
      const m = buildMappedRow(headers, rows[i], mapping)
      if (m.company_name.trim()) built.push({ mapped: m, index: i })
    }
    const { data: existingCompanies } = await supabase.from('companies').select('id, name').order('name', { ascending: true })
    const candidates = (existingCompanies ?? []) as { id: string; name: string }[]
    const reviewed: ReviewedRow[] = built.map(({ mapped, index }) => {
      const matches = findSimilarNames(mapped.company_name, candidates, 0.82)
      return { index, mapped, duplicates: matches.slice(0, 3), decision: 'import' as RowDecision, mergeTargetId: matches[0]?.id ?? null }
    })
    setReviewedRows(reviewed)
    setReviewLoading(false)
  }

  function ReviewStep() {
    const newCount = reviewedRows.filter((r) => r.decision === 'import').length
    const skipCount = reviewedRows.filter((r) => r.decision === 'skip').length
    const mergeCount = reviewedRows.filter((r) => r.decision === 'merge').length
    const dupeCount = reviewedRows.filter((r) => r.duplicates.length > 0).length
    return (
      <div>
        {reviewLoading ? (
          <p className="text-sm text-gray-400 italic py-8 text-center">Checking for duplicates…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs mb-4">
              <StatBadge label="Ready to import" value={newCount} accent />
              <StatBadge label="Possible duplicates" value={dupeCount} />
              {mergeCount > 0 && <StatBadge label="Will merge" value={mergeCount} />}
              {skipCount > 0 && <StatBadge label="Skipped" value={skipCount} />}
            </div>
            <div className="space-y-2">
              {reviewedRows.filter((r) => r.duplicates.length > 0).map((r) => (
                <div key={r.index} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangleIcon className="w-4 h-4 text-amber-600 flex-none" />
                    <span className="text-sm font-medium text-gray-900">Possible duplicate</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Incoming</p>
                      <p className="text-gray-900 font-medium">{r.mapped.company_name}</p>
                      {(r.mapped.city || r.mapped.state) && <p className="text-gray-500">{[r.mapped.city, r.mapped.state].filter(Boolean).join(', ')}</p>}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Existing</p>
                      <ul className="space-y-0.5">
                        {r.duplicates.map((d) => (
                          <li key={d.id} className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name={`merge-${r.index}`} checked={r.mergeTargetId === d.id} onChange={() => setReviewedRows((prev) => prev.map((p) => p.index === r.index ? { ...p, mergeTargetId: d.id, decision: 'merge' } : p))} className="w-3 h-3 text-amber-500 focus:ring-amber-500/20" />
                              <span className="text-gray-900">{d.name}</span>
                            </label>
                            <span className="text-gray-400 text-[10px]">{Math.round(d.score * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {(['import', 'skip', 'merge'] as const).map((dec) => (
                      <button key={dec} onClick={() => setReviewedRows((prev) => prev.map((p) => p.index === r.index ? { ...p, decision: dec } : p))} className={`px-3 py-1 text-xs rounded-full border transition-colors ${r.decision === dec ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {dec === 'import' ? 'Import as new' : dec === 'skip' ? 'Skip' : 'Merge'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="mt-6 flex justify-between">
          <button onClick={() => setStep('mapping')} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg">Back</button>
          <button onClick={runImport} disabled={reviewLoading || reviewedRows.length === 0} className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors">Import</button>
        </div>
      </div>
    )
  }

  async function runImport() {
    setStep('importing')
    setImportError(null)
    setImportProgress(0)
    const allRows = reviewedRows
    setImportTotal(allRows.length)

    try {
      // 1. Create the import record with 'staged' status
      const fileExt = (fileName ?? '').split('.').pop()?.toLowerCase() ?? 'csv'
      const validTypes = ['csv', 'xlsx', 'xls', 'numbers', 'pdf']
      const mappingObj: Record<string, string> = {}
      headers.forEach((h, i) => { if (mapping[i] && mapping[i] !== 'skip') mappingObj[h] = mapping[i] })
      const { data: importRec, error: importErr } = await supabase.from('crm_imports').insert({
        company_id: userId,
        file_name: fileName ?? 'unknown',
        file_type: validTypes.includes(fileExt) ? fileExt : 'csv',
        record_count: 0,
        total_rows: rows.length,
        status: 'staged',
        column_mapping: mappingObj,
        imported_by: userId,
      }).select('id').single()
      if (importErr || !importRec) throw importErr ?? new Error('Failed to create import record')
      const importId = importRec.id

      // 2. Insert all rows into crm_import_records staging table
      const BATCH = 50
      for (let start = 0; start < allRows.length; start += BATCH) {
        const chunk = allRows.slice(start, start + BATCH)
        const payload = chunk.map((r) => ({
          import_id: importId,
          company_name: r.mapped.company_name,
          industry: r.mapped.industry, zone: r.mapped.zone,
          state: r.mapped.state, city: r.mapped.city,
          status: r.mapped.status, priority: r.mapped.priority,
          lead_source: r.mapped.lead_source,
          contact_first_name: r.mapped.contact_first_name, contact_last_name: r.mapped.contact_last_name,
          contact_job_title: r.mapped.contact_job_title, contact_email: r.mapped.contact_email,
          contact_phone: r.mapped.contact_phone,
          contact_phones: buildContactPhonesJson(r.mapped.contact_phone, r.mapped.contact_mobile),
          address: r.mapped.address,
          number_of_locations: r.mapped.number_of_locations,
          revenue_range: r.mapped.revenue_range, employee_range: r.mapped.employee_range,
          last_call_status: r.mapped.last_call_status, last_call_date: r.mapped.last_call_date,
          extras: Object.keys(r.mapped.extras).length > 0 ? r.mapped.extras : null,
          duplicate_of: r.duplicates[0]?.id ?? null,
          duplicate_score: r.duplicates[0]?.score ?? null,
          merge_decision: r.decision === 'skip' ? 'skip' : r.decision,
          row_index: r.index,
        }))
        const { data: insertedStaging, error: batchErr } = await supabase.from('crm_import_records').insert(payload).select('id')
        if (batchErr) throw batchErr

        const insertedIds = (insertedStaging ?? []) as { id: string }[]
        const contactInserts: Array<Record<string, unknown>> = []
        for (let i = 0; i < chunk.length; i++) {
          const r = chunk[i]
          const stagingId = insertedIds[i]?.id
          if (!stagingId) continue
          if (r.mapped.contact_first_name || r.mapped.contact_last_name || r.mapped.contact_email || r.mapped.contact_phone) {
            contactInserts.push({
              import_record_id: stagingId,
              contact_order: 1,
              first_name: r.mapped.contact_first_name,
              last_name: r.mapped.contact_last_name,
              title: r.mapped.contact_job_title,
              email: r.mapped.contact_email,
              phones: buildContactPhonesJson(r.mapped.contact_phone, r.mapped.contact_mobile),
              call_status: r.mapped.last_call_status,
              call_date: r.mapped.last_call_date,
            })
          }
        }
        if (contactInserts.length > 0) {
          await supabase.from('crm_import_contacts').insert(contactInserts)
        }

        setImportProgress(Math.min(allRows.length, start + chunk.length))
      }

      // 3. Update import record count
      await supabase.from('crm_imports').update({ record_count: allRows.length }).eq('id', importId)

      setFinalStats({ companies: allRows.filter((r) => r.decision === 'import').length, contacts: 0, skipped: allRows.filter((r) => r.decision === 'skip').length, merged: allRows.filter((r) => r.decision === 'merge').length })
      setStagingImportId(importId)
      setStep('done')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setImportError(msg)
    }
  }

  function ImportingStep() {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-gray-700 mb-4">Staging records… {importProgress} of {importTotal}</p>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-md mx-auto">
          <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${importTotal === 0 ? 0 : Math.round((importProgress / importTotal) * 100)}%` }} />
        </div>
        {importError && <p className="text-xs text-red-600 mt-4">{importError}</p>}
      </div>
    )
  }

  function DoneStep() {
    return (
      <div className="py-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-amber-500 mb-4 text-lg">✓</div>
        <h4 className="text-base font-medium text-gray-900 mb-1">Records staged for review</h4>
        <p className="text-sm text-gray-500">
          {finalStats.companies} record{finalStats.companies === 1 ? '' : 's'} ready to review.
          {finalStats.merged > 0 && ` ${finalStats.merged} flagged for merge.`}
          {finalStats.skipped > 0 && ` ${finalStats.skipped} skipped.`}
        </p>
        <p className="text-xs text-gray-400 mt-1">Review and edit records before approving them into the live CRM.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => { resetImportFlow(); fetchImports(); setView('history') }} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg">Back to Import Center</button>
          <button onClick={() => { if (stagingImportId) openStagingView(stagingImportId) }} className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors">Review & Edit</button>
        </div>
      </div>
    )
  }
}

function ImportHistoryCard({ imp, onReview, onDelete }: { imp: ImportRecord; onReview?: (id: string) => void; onDelete?: (id: string) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const date = new Date(imp.created_at)
  const formatted = date.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  }) + ' at ' + date.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit',
  })

  const typeBadge: Record<string, { bg: string; text: string }> = {
    csv: { bg: 'bg-blue-50', text: 'text-blue-600' },
    xlsx: { bg: 'bg-green-50', text: 'text-green-600' },
    xls: { bg: 'bg-green-50', text: 'text-green-600' },
    numbers: { bg: 'bg-purple-50', text: 'text-purple-600' },
    pdf: { bg: 'bg-red-50', text: 'text-red-600' },
  }
  const badge = typeBadge[imp.file_type] ?? { bg: 'bg-gray-50', text: 'text-gray-600' }

  const statusColor: Record<string, string> = {
    completed: 'text-green-600',
    failed: 'text-red-600',
    partial: 'text-amber-600',
    staged: 'text-blue-600',
  }

  const statusLabel: Record<string, string> = {
    completed: 'Completed',
    failed: 'Failed',
    partial: 'Partial',
    staged: 'Pending review',
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-900 truncate">{imp.file_name}</span>
          <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${badge.bg} ${badge.text}`}>
            {imp.file_type.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${statusColor[imp.status] ?? 'text-gray-500'}`}>
            {statusLabel[imp.status] ?? imp.status}
          </span>
          {imp.status === 'staged' && onReview && (
            <button onClick={() => onReview(imp.id)} className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-500 transition-colors">
              Review & Edit
            </button>
          )}
          {onDelete && (
            <button onClick={() => setConfirmOpen(true)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Delete import">
              <Trash2Icon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
        <span>{imp.status === 'staged' ? `${imp.record_count} records staged` : `${imp.record_count} of ${imp.total_rows} records imported`}</span>
        <span>·</span>
        <span>{formatted}</span>
      </div>
      {imp.error_message && (
        <p className="text-xs text-red-500 mt-1">{imp.error_message}</p>
      )}
      {confirmOpen && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-800 mb-2">
            {imp.status === 'staged'
              ? `Delete this import? This will permanently remove all ${imp.record_count} staged records. This cannot be undone.`
              : 'Delete this import record? The companies already imported to the CRM will NOT be affected.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => { setConfirmOpen(false); onDelete?.(imp.id) }} className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-500 transition-colors">
              Delete
            </button>
            <button onClick={() => setConfirmOpen(false)} className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatBadge({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border ${accent ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
      <span className={`text-sm font-semibold tabular-nums ${accent ? 'text-amber-600' : 'text-gray-900'}`}>{value}</span>
      <span className="text-gray-500">{label}</span>
    </div>
  )
}

const FIELD_PLACEHOLDERS: Record<string, string> = {
  company_name: 'Company name', industry: 'Industry', city: 'City', state: 'State',
  zone: 'Zone', number_of_locations: 'Locations', revenue_range: 'Revenue',
  employee_range: 'Employees', status: 'Status',
  priority: 'Priority', contact_first_name: 'First name', contact_last_name: 'Last name',
  contact_job_title: 'Job title', contact_email: 'Email address', contact_phone: 'Phone number',
  last_call_status: 'Call status', last_call_date: 'Call date',
}

function StagingCompanyWithContact({ rec, groupIndex, contacts, companyFields, crmStatuses, selected, onSelect, editingCell, onStartEdit, onSave, onDecisionChange, onAddContact, onDeleteContact, onUpdateContactField, onUpdateContactPhones, dimmed, approved }: {
  rec: StagingRecord
  groupIndex: number
  contacts: ImportContact[]
  companyFields: { key: keyof StagingRecord; label: string; width: string }[]
  crmStatuses: readonly string[]
  selected: boolean
  onSelect: (sel: boolean) => void
  editingCell: { id: string; field: string } | null
  onStartEdit: (field: string) => void
  onSave: (field: string, value: string | null) => void
  onDecisionChange: (d: StagingRecord['merge_decision']) => void
  onAddContact: () => void
  onDeleteContact: (contactId: string) => void
  onUpdateContactField: (contactId: string, field: string, value: unknown) => void
  onUpdateContactPhones: (contactId: string, phones: Array<{ type: string; number: string }>) => void
  dimmed: boolean
  approved?: boolean
}) {
  const stripeBg = groupIndex % 2 === 1 ? 'bg-gray-50/60' : ''
  function renderEditableCell(f: { key: keyof StagingRecord; label: string; width: string }, isContact?: boolean) {
    const isEditing = editingCell?.id === rec.id && editingCell?.field === f.key
    const value = rec[f.key]
    const display = value != null ? String(value) : ''

    if (f.key === 'status' && !approved) {
      return (
        <td key={f.key} className={`px-3 py-2 ${f.width}`}>
          {dimmed && !approved ? (
            <span className="text-gray-500">{display || <span className="text-gray-300">—</span>}</span>
          ) : (
            <select
              value={display || 'prospect'}
              onChange={(e) => onSave(f.key, e.target.value)}
              className="px-1.5 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
              disabled={approved}
            >
              {crmStatuses.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          )}
        </td>
      )
    }

    if (f.key === 'priority' && !approved) {
      return (
        <td key={f.key} className={`px-3 py-2 ${f.width}`}>
          {dimmed ? (
            <span className="text-gray-500">{display || <span className="text-gray-300">—</span>}</span>
          ) : (
            <select
              value={display || 'medium'}
              onChange={(e) => onSave(f.key, e.target.value)}
              className="px-1.5 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          )}
        </td>
      )
    }

    const placeholder = FIELD_PLACEHOLDERS[f.key] ?? '—'

    if (approved) {
      return (
        <td key={f.key} className={`px-3 py-2 text-gray-500 ${f.width}`}>{display || '—'}</td>
      )
    }

    if (isEditing && !dimmed) {
      return (
        <td key={f.key} className={`px-1 py-1 ${f.width}`}>
          <input
            autoFocus
            defaultValue={display}
            placeholder={placeholder}
            onBlur={(e) => onSave(f.key, e.target.value.trim() || null)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { onSave(f.key, display || null) } }}
            className={`w-full px-2 py-1 text-xs border border-amber-400 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 ${isContact ? 'text-gray-600' : ''}`}
          />
        </td>
      )
    }
    return (
      <td
        key={f.key}
        className={`px-3 py-2 ${isContact ? 'text-gray-500' : 'text-gray-700'} ${!dimmed ? 'cursor-pointer hover:bg-amber-50/50' : ''} ${f.width}`}
        onClick={() => { if (!dimmed) onStartEdit(f.key) }}
        title={!dimmed ? 'Click to edit' : undefined}
      >
        {display || <span className="text-gray-300 italic text-[10px]">{placeholder}</span>}
      </td>
    )
  }

  return (
    <>
      {/* Company row */}
      <tr className={`border-b border-gray-50 ${stripeBg} ${dimmed ? 'opacity-40' : ''} ${approved ? 'opacity-50' : ''}`}>
        <td className="px-3 py-2 w-8">
          {!dimmed && !approved && <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} className="w-3.5 h-3.5 text-amber-500 rounded" />}
        </td>
        <td className="px-3 py-2 text-gray-400 w-8">{rec.row_index + 1}</td>
        {companyFields.map((f) => renderEditableCell(f))}
        <td className="px-3 py-2">
          {approved ? (
            <span className="text-green-600 font-medium">✓</span>
          ) : dimmed ? (
            <button onClick={() => onDecisionChange('import')} className="text-[10px] text-blue-600 hover:underline">Restore</button>
          ) : (
            <select
              value={rec.merge_decision}
              onChange={(e) => onDecisionChange(e.target.value as StagingRecord['merge_decision'])}
              className="px-1.5 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              <option value="import">Import</option>
              <option value="merge">Merge</option>
              <option value="skip">Skip</option>
              <option value="rejected">Reject</option>
            </select>
          )}
        </td>
      </tr>
      {/* Contact sub-rows */}
      {contacts.map((ct, ci) => (
        <tr key={ct.id} className={`border-b border-gray-100 ${stripeBg} ${dimmed ? 'opacity-40' : ''} ${approved ? 'opacity-50' : ''}`}>
          <td className="w-8" />
          <td className="w-8" />
          <td colSpan={companyFields.length + 1} className="py-1.5">
            <div className="flex items-center gap-0 text-[11px]" style={{ paddingLeft: 28 }}>
              <span className="inline-flex items-center gap-1 text-gray-400 mr-3 shrink-0">
                <UserIcon className="w-3 h-3" />
                <span className="text-[10px] uppercase tracking-wide font-medium">Contact{contacts.length > 1 ? ` ${ci + 1}` : ''}</span>
              </span>
              <div className="flex items-center gap-0 flex-1 overflow-x-auto">
                <ImportContactRow
                  contact={ct}
                  approved={!!approved}
                  dimmed={dimmed}
                  onUpdateField={(field, val) => onUpdateContactField(ct.id, field, val)}
                  onUpdatePhones={(phones) => onUpdateContactPhones(ct.id, phones)}
                />
              </div>
              {!dimmed && !approved && contacts.length > 1 && (
                <button onClick={() => onDeleteContact(ct.id)} className="ml-1 p-0.5 text-gray-300 hover:text-red-400 shrink-0" title="Remove contact">
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </td>
        </tr>
      ))}
      {/* Empty contact placeholder when no contacts exist */}
      {contacts.length === 0 && (
        <tr className={`border-b border-gray-100 ${stripeBg} ${dimmed ? 'opacity-40' : ''} ${approved ? 'opacity-50' : ''}`}>
          <td className="w-8" />
          <td className="w-8" />
          <td colSpan={companyFields.length + 1} className="py-1.5">
            <div className="flex items-center gap-0 text-[11px]" style={{ paddingLeft: 28 }}>
              <span className="inline-flex items-center gap-1 text-gray-400 mr-3 shrink-0">
                <UserIcon className="w-3 h-3" />
                <span className="text-[10px] uppercase tracking-wide font-medium">Contact</span>
              </span>
              <span className="text-gray-300 italic text-[10px]">No contacts</span>
            </div>
          </td>
        </tr>
      )}
      {/* + Add contact button */}
      {!dimmed && !approved && (
        <tr className={`border-b border-gray-100 ${stripeBg}`}>
          <td className="w-8" />
          <td className="w-8" />
          <td colSpan={companyFields.length + 1} className="py-1">
            <button
              onClick={onAddContact}
              className="inline-flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-600 transition-colors"
              style={{ marginLeft: 56 }}
            >
              <PlusIcon className="w-3 h-3" />
              Add contact
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

const IMPORT_CONTACT_FIELDS: { key: keyof ImportContact; label: string; placeholder: string; width: string }[] = [
  { key: 'first_name', label: 'First name', placeholder: 'First name', width: 'min-w-[100px]' },
  { key: 'last_name', label: 'Last name', placeholder: 'Last name', width: 'min-w-[100px]' },
  { key: 'title', label: 'Title', placeholder: 'Job title', width: 'min-w-[100px]' },
  { key: 'email', label: 'Email', placeholder: 'Email address', width: 'min-w-[140px]' },
  { key: 'call_status', label: 'Last call status', placeholder: 'Call status', width: 'min-w-[110px]' },
  { key: 'call_date', label: 'Last call date', placeholder: 'Call date', width: 'min-w-[100px]' },
]

function ImportContactRow({ contact, approved, dimmed, onUpdateField, onUpdatePhones }: {
  contact: ImportContact
  approved: boolean
  dimmed: boolean
  onUpdateField: (field: string, value: unknown) => void
  onUpdatePhones: (phones: Array<{ type: string; number: string }>) => void
}) {
  const [editingField, setEditingField] = useState<string | null>(null)
  return (
    <table className="text-[11px]">
      <tbody>
        <tr>
          {IMPORT_CONTACT_FIELDS.map((f) => {
            const cellKey = `${contact.id}_${f.key}`
            const isEditing = editingField === f.key
            const value = contact[f.key]
            const display = value != null ? String(value) : ''

            if (approved) {
              return <td key={cellKey} className={`px-2 py-0.5 text-gray-400 ${f.width}`}>{display || '—'}</td>
            }
            if (isEditing && !dimmed) {
              return (
                <td key={cellKey} className={`px-1 py-0.5 ${f.width}`}>
                  <input
                    autoFocus
                    defaultValue={display}
                    placeholder={f.placeholder}
                    onBlur={(e) => { onUpdateField(f.key, e.target.value.trim() || null); setEditingField(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingField(null) }}
                    className="w-full px-2 py-0.5 text-[11px] border border-amber-400 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </td>
              )
            }
            return (
              <td
                key={cellKey}
                className={`px-2 py-0.5 text-gray-500 ${!dimmed ? 'cursor-pointer hover:bg-amber-50/50' : ''} ${f.width}`}
                onClick={() => { if (!dimmed) setEditingField(f.key) }}
                title={!dimmed ? 'Click to edit' : undefined}
              >
                {display || <span className="text-gray-300 italic text-[10px]">{f.placeholder}</span>}
              </td>
            )
          })}
          <ImportContactPhoneCell
            contact={contact}
            approved={approved}
            dimmed={dimmed}
            onSavePhones={onUpdatePhones}
          />
        </tr>
      </tbody>
    </table>
  )
}

const PHONE_TYPE_LABELS: Record<string, string> = { office: 'Office', mobile: 'Mobile', fax: 'Fax', other: 'Other' }

function ImportContactPhoneCell({ contact, approved, dimmed, onSavePhones }: {
  contact: ImportContact
  approved: boolean
  dimmed: boolean
  onSavePhones: (phones: Array<{ type: string; number: string }>) => void
}) {
  const phones: Array<{ type: string; number: string }> = contact.phones && contact.phones.length > 0
    ? contact.phones : []
  const [editing, setEditing] = useState<number | null>(null)

  function updatePhone(idx: number, field: 'type' | 'number', val: string) {
    const next = phones.map((p, i) => i === idx ? { ...p, [field]: val } : p)
    onSavePhones(next)
  }
  function addPhone() { onSavePhones([...phones, { type: 'office', number: '' }]) }
  function removePhone(idx: number) { onSavePhones(phones.filter((_, i) => i !== idx)) }

  if (approved) {
    return (
      <td className="px-2 py-0.5 text-gray-400 min-w-[160px]">
        {phones.length > 0 ? phones.map((p, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-gray-300 text-[10px]">{PHONE_TYPE_LABELS[p.type] ?? p.type}:</span>
            <span>{p.number}</span>
          </div>
        )) : '—'}
      </td>
    )
  }

  return (
    <td className="px-2 py-0.5 min-w-[200px] align-top">
      <div className="flex flex-col gap-0.5">
        {phones.map((p, i) => (
          <div key={i} className="flex items-center gap-1">
            <select value={p.type} onChange={(e) => updatePhone(i, 'type', e.target.value)} disabled={dimmed} className="px-1 py-0 text-[10px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white text-gray-500">
              <option value="office">Office</option>
              <option value="mobile">Mobile</option>
              <option value="fax">Fax</option>
              <option value="other">Other</option>
            </select>
            {editing === i && !dimmed ? (
              <input autoFocus defaultValue={p.number} placeholder="Phone number" onBlur={(e) => { updatePhone(i, 'number', e.target.value.trim()); setEditing(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} className="flex-1 px-1 py-0 text-[11px] border border-amber-400 rounded focus:outline-none focus:ring-1 focus:ring-amber-400" />
            ) : (
              <span className={`flex-1 text-[11px] text-gray-500 ${!dimmed ? 'cursor-pointer hover:bg-amber-50/50' : ''} px-1 rounded`} onClick={() => { if (!dimmed) setEditing(i) }}>
                {p.number || <span className="text-gray-300 italic text-[10px]">Phone number</span>}
              </span>
            )}
            {!dimmed && phones.length > 1 && (
              <button onClick={() => removePhone(i)} className="text-gray-300 hover:text-red-400 p-0"><XIcon className="w-3 h-3" /></button>
            )}
          </div>
        ))}
        {phones.length === 0 && !dimmed && (
          <span className="text-gray-300 italic text-[10px]">Phone number</span>
        )}
        {!dimmed && (
          <button onClick={addPhone} className="text-[10px] text-amber-500 hover:text-amber-600 mt-0.5 self-start">+ Add number</button>
        )}
      </div>
    </td>
  )
}

