'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, PlusIcon, UploadCloudIcon, FileTextIcon, AlertTriangleIcon } from 'lucide-react'
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

type Step = 'upload' | 'mapping' | 'review' | 'importing' | 'done'

type TargetField =
  | 'skip' | 'company_name' | 'industry' | 'zone' | 'region' | 'state'
  | 'county' | 'city' | 'status' | 'priority' | 'lead_source' | 'deal_value'
  | 'contact_first_name' | 'contact_last_name' | 'contact_job_title'
  | 'contact_email' | 'contact_phone' | 'address' | 'address_label'

const TARGET_LABELS: Record<TargetField, string> = {
  skip: '— Skip this column —', company_name: 'Company name', industry: 'Industry',
  zone: 'Zone', region: 'Region', state: 'State', county: 'County', city: 'City',
  status: 'Status', priority: 'Priority', lead_source: 'Lead source', deal_value: 'Deal value',
  contact_first_name: 'Contact first name', contact_last_name: 'Contact last name',
  contact_job_title: 'Contact job title', contact_email: 'Contact email',
  contact_phone: 'Contact phone', address: 'Address', address_label: 'Address label',
}

const TARGET_OPTIONS: TargetField[] = Object.keys(TARGET_LABELS) as TargetField[]

function guessMapping(header: string): TargetField {
  const h = header.toLowerCase().trim()
  if (!h) return 'skip'
  if (/(company|business|account)\s*(name)?/.test(h)) return 'company_name'
  if (/^industry$|sector|vertical/.test(h)) return 'industry'
  if (/^zone$|territory/.test(h)) return 'zone'
  if (/^region$/.test(h)) return 'region'
  if (/^state$|province/.test(h)) return 'state'
  if (/^county$/.test(h)) return 'county'
  if (/^city$|town/.test(h)) return 'city'
  if (/^status$/.test(h)) return 'status'
  if (/priority/.test(h)) return 'priority'
  if (/(lead|referr?al)\s*source|source/.test(h)) return 'lead_source'
  if (/deal\s*value|revenue|amount/.test(h)) return 'deal_value'
  if (/first\s*name|^fname$|^given/.test(h)) return 'contact_first_name'
  if (/last\s*name|^lname$|surname|family/.test(h)) return 'contact_last_name'
  if (/job\s*title|^title$|position|role/.test(h)) return 'contact_job_title'
  if (/email|^e-?mail$/.test(h)) return 'contact_email'
  if (/phone|mobile|cell|telephone/.test(h)) return 'contact_phone'
  if (/^address$|street|address\s*1/.test(h)) return 'address'
  if (/address\s*(label|type)/.test(h)) return 'address_label'
  return 'skip'
}

interface MappedRow {
  company_name: string
  industry: string | null; zone: string | null; region: string | null
  state: string | null; county: string | null; city: string | null
  status: string | null; priority: string | null; lead_source: string | null
  deal_value: number | null
  contact_first_name: string | null; contact_last_name: string | null
  contact_job_title: string | null; contact_email: string | null; contact_phone: string | null
  address: string | null; address_label: string | null
  extras: Record<string, string>
}

function buildMappedRow(headers: string[], row: string[], mapping: TargetField[]): MappedRow {
  const out: MappedRow = {
    company_name: '', industry: null, zone: null, region: null,
    state: null, county: null, city: null, status: null, priority: null,
    lead_source: null, deal_value: null,
    contact_first_name: null, contact_last_name: null,
    contact_job_title: null, contact_email: null, contact_phone: null,
    address: null, address_label: null, extras: {},
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
    else if (target === 'deal_value') {
      const n = Number(raw.replace(/[$,]/g, ''))
      out.deal_value = Number.isFinite(n) ? n : null
    } else {
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

type View = 'history' | 'new-import'

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

  type DupeMatch = { id: string; name: string; score: number }
  type RowDecision = 'import' | 'skip' | 'merge'
  interface ReviewedRow { index: number; mapped: MappedRow; duplicates: DupeMatch[]; decision: RowDecision; mergeTargetId: string | null }
  const [reviewedRows, setReviewedRows] = useState<ReviewedRow[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [finalStats, setFinalStats] = useState({ companies: 0, contacts: 0, skipped: 0, merged: 0 })

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

  function setMappingAt(idx: number, value: TargetField) {
    setMapping((prev) => {
      const next = [...prev]
      if (value !== 'skip') {
        for (let i = 0; i < next.length; i++) {
          if (i !== idx && next[i] === value) next[i] = 'skip'
        }
      }
      next[idx] = value
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
    setParseError(null); setDetectedFormat(null); setMapping([]); setReviewedRows([])
    setImportProgress(0); setImportTotal(0); setImportError(null)
    setFinalStats({ companies: 0, contacts: 0, skipped: 0, merged: 0 })
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
                <ImportHistoryCard key={imp.id} imp={imp} />
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
    return (
      <div>
        <p className="text-xs text-gray-500 mb-4">Match each column in your file to a CRM field. Columns set to <em>Skip</em> will be saved as additional data.</p>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-0 text-xs bg-gray-50 border-b border-gray-200">
            <div className="px-3 py-2 font-medium text-gray-600">Source column</div>
            <div className="px-3 py-2 text-gray-400" />
            <div className="px-3 py-2 font-medium text-gray-600">Maps to</div>
          </div>
          {headers.map((h, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-0 items-center border-b border-gray-100 last:border-b-0">
              <div className="px-3 py-2 text-sm text-gray-900 truncate">
                {h || <span className="text-gray-300">(empty)</span>}
                <div className="text-[11px] text-gray-400 truncate">{rows[0]?.[i] ?? ''}</div>
              </div>
              <div className="px-2 text-gray-300 text-xs">→</div>
              <div className="px-3 py-2">
                <select value={mapping[i] ?? 'skip'} onChange={(e) => setMappingAt(i, e.target.value as TargetField)} className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500">
                  {TARGET_OPTIONS.map((f) => <option key={f} value={f}>{TARGET_LABELS[f]}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
        {!companyNameMapped && <p className="text-xs text-amber-600 mt-3">At least one column must be mapped to <strong>Company name</strong>.</p>}
        <div className="mt-6 flex justify-between">
          <button onClick={() => setStep('upload')} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg">Back</button>
          <button onClick={async () => { setStep('review'); await runDuplicateDetection() }} disabled={!companyNameMapped} className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors">Next</button>
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
    const batchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const toImport = reviewedRows.filter((r) => r.decision !== 'skip')
    setImportTotal(toImport.length)
    let createdCompanies = 0, createdContacts = 0, mergedCount = 0
    const skippedCount = reviewedRows.filter((r) => r.decision === 'skip').length

    try {
      const BATCH = 50
      for (let start = 0; start < toImport.length; start += BATCH) {
        const chunk = toImport.slice(start, start + BATCH)
        const newRows = chunk.filter((r) => r.decision === 'import')
        const mergeRows = chunk.filter((r) => r.decision === 'merge' && r.mergeTargetId)

        if (newRows.length > 0) {
          const payload = newRows.map((r) => ({
            name: r.mapped.company_name, industry: r.mapped.industry, zone: r.mapped.zone, region: r.mapped.region,
            state: r.mapped.state, county: r.mapped.county, city: r.mapped.city,
            status: normalizeStatus(r.mapped.status) ?? 'prospect', priority: normalizePriority(r.mapped.priority) ?? 'medium',
            lead_source: r.mapped.lead_source, deal_value: r.mapped.deal_value ?? 0,
            import_metadata: Object.keys(r.mapped.extras).length > 0 ? r.mapped.extras : null,
            import_batch_id: batchId, created_by: userId, archived: false,
          }))
          const { data: inserted, error: insertErr } = await supabase.from('companies').insert(payload).select('id, name')
          if (insertErr) throw insertErr
          const insertedRows = (inserted ?? []) as { id: string; name: string }[]
          createdCompanies += insertedRows.length

          const contactPayload: Array<Record<string, unknown>> = []
          const addressPayload: Array<Record<string, unknown>> = []
          for (let i = 0; i < newRows.length; i++) {
            const row = newRows[i], co = insertedRows[i]
            if (!co) continue
            if (row.mapped.contact_first_name || row.mapped.contact_last_name) {
              contactPayload.push({ company_id: co.id, first_name: row.mapped.contact_first_name || '', last_name: row.mapped.contact_last_name || '', job_title: row.mapped.contact_job_title, email: row.mapped.contact_email, phone: row.mapped.contact_phone, is_primary: true, import_batch_id: batchId })
            }
            if (row.mapped.address) {
              addressPayload.push({ company_id: co.id, label: row.mapped.address_label || 'Primary', address: row.mapped.address, city: row.mapped.city, state: row.mapped.state, is_primary: true })
            }
          }
          if (contactPayload.length > 0) { const { error: cerr } = await supabase.from('contacts').insert(contactPayload); if (cerr) throw cerr; createdContacts += contactPayload.length }
          if (addressPayload.length > 0) { const { error: aerr } = await supabase.from('crm_company_addresses').insert(addressPayload); if (aerr) throw aerr }
        }

        for (const row of mergeRows) {
          const targetId = row.mergeTargetId!
          if (row.mapped.contact_first_name || row.mapped.contact_last_name) {
            const { error: cerr } = await supabase.from('contacts').insert({ company_id: targetId, first_name: row.mapped.contact_first_name || '', last_name: row.mapped.contact_last_name || '', job_title: row.mapped.contact_job_title, email: row.mapped.contact_email, phone: row.mapped.contact_phone, is_primary: false, import_batch_id: batchId })
            if (cerr) throw cerr; createdContacts += 1
          }
          if (row.mapped.address) {
            const { error: aerr } = await supabase.from('crm_company_addresses').insert({ company_id: targetId, label: row.mapped.address_label || 'Imported', address: row.mapped.address, city: row.mapped.city, state: row.mapped.state, is_primary: false })
            if (aerr) throw aerr
          }
          mergedCount += 1
        }
        setImportProgress(Math.min(toImport.length, start + chunk.length))
      }
      setFinalStats({ companies: createdCompanies, contacts: createdContacts, skipped: skippedCount, merged: mergedCount })

      // Save import record
      const fileExt = (fileName ?? '').split('.').pop()?.toLowerCase() ?? 'csv'
      const validTypes = ['csv', 'xlsx', 'xls', 'numbers', 'pdf']
      const mappingObj: Record<string, string> = {}
      headers.forEach((h, i) => { if (mapping[i] && mapping[i] !== 'skip') mappingObj[h] = mapping[i] })
      await supabase.from('crm_imports').insert({
        company_id: userId,
        file_name: fileName ?? 'unknown',
        file_type: validTypes.includes(fileExt) ? fileExt : 'csv',
        record_count: createdCompanies + mergedCount,
        total_rows: rows.length,
        status: 'completed',
        column_mapping: mappingObj,
        imported_by: userId,
      })

      setStep('done')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setImportError(msg)

      const fileExt = (fileName ?? '').split('.').pop()?.toLowerCase() ?? 'csv'
      const validTypes = ['csv', 'xlsx', 'xls', 'numbers', 'pdf']
      await supabase.from('crm_imports').insert({
        company_id: userId,
        file_name: fileName ?? 'unknown',
        file_type: validTypes.includes(fileExt) ? fileExt : 'csv',
        record_count: createdCompanies + mergedCount,
        total_rows: rows.length,
        status: createdCompanies + mergedCount > 0 ? 'partial' : 'failed',
        column_mapping: null,
        error_message: msg,
        imported_by: userId,
      })
    }
  }

  function ImportingStep() {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-gray-700 mb-4">Importing… {importProgress} of {importTotal}</p>
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
        <h4 className="text-base font-medium text-gray-900 mb-1">Import complete</h4>
        <p className="text-sm text-gray-500">
          Successfully imported {finalStats.companies} compan{finalStats.companies === 1 ? 'y' : 'ies'} and {finalStats.contacts} contact{finalStats.contacts === 1 ? '' : 's'}.
          {finalStats.merged > 0 && ` Merged ${finalStats.merged} into existing.`}
          {finalStats.skipped > 0 && ` Skipped ${finalStats.skipped}.`}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => { resetImportFlow(); fetchImports(); setView('history') }} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg">Back to Import Center</button>
          <Link href="/sales/crm" className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors">View in CRM</Link>
        </div>
      </div>
    )
  }
}

function ImportHistoryCard({ imp }: { imp: ImportRecord }) {
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
        <span className={`text-xs font-medium capitalize ${statusColor[imp.status] ?? 'text-gray-500'}`}>
          {imp.status}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
        <span>{imp.record_count} of {imp.total_rows} records imported</span>
        <span>·</span>
        <span>{formatted}</span>
      </div>
      {imp.error_message && (
        <p className="text-xs text-red-500 mt-1">{imp.error_message}</p>
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
