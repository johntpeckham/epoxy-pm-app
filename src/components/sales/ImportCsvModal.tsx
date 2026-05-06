'use client'

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { XIcon, UploadCloudIcon, FileTextIcon, AlertTriangleIcon } from 'lucide-react'
import Portal from '@/components/ui/Portal'
import { createClient } from '@/lib/supabase/client'
import { parseCsv, findSimilarNames } from '@/lib/csv'
import * as XLSX from 'xlsx'

interface ImportCsvModalProps {
  userId: string
  onClose: () => void
  onImported: () => void
}

type Step = 'upload' | 'mapping' | 'review' | 'importing' | 'done'

// Target CRM fields a CSV column can map to.
type TargetField =
  | 'skip'
  | 'company_name'
  | 'industry'
  | 'zone'
  | 'state'
  | 'city'
  | 'status'
  | 'priority'
  | 'lead_source'
  | 'contact_first_name'
  | 'contact_last_name'
  | 'contact_job_title'
  | 'contact_email'
  | 'address'

const TARGET_FIELD_LABELS: Record<TargetField, string> = {
  skip: '— Skip this column —',
  company_name: 'Company name',
  industry: 'Industry',
  zone: 'Zone',
  state: 'State',
  city: 'City',
  status: 'Status',
  priority: 'Priority',
  lead_source: 'Lead source',
  contact_first_name: 'Contact first name',
  contact_last_name: 'Contact last name',
  contact_job_title: 'Contact job title',
  contact_email: 'Contact email',
  address: 'Address',
}

const TARGET_FIELD_OPTIONS: TargetField[] = [
  'skip',
  'company_name',
  'industry',
  'zone',
  'state',
  'city',
  'status',
  'priority',
  'lead_source',
  'contact_first_name',
  'contact_last_name',
  'contact_job_title',
  'contact_email',
  'address',
]

// Coerce a free-text status into one of the allowed values.
function normalizeStatus(s: string | null): string | null {
  if (!s) return null
  const v = s.toLowerCase().trim().replace(/[\s-]/g, '_')
  if (['prospect', 'contacted', 'lead_created', 'appointment_made', 'job_walk_scheduled', 'not_very_interested', 'do_not_call', 'active', 'inactive'].includes(v)) return v
  if (/hot/.test(v)) return 'contacted'
  if (/contact/.test(v)) return 'contacted'
  if (/black|do.?not.?call|dnc/.test(v)) return 'do_not_call'
  if (/lost|dead/.test(v)) return 'not_very_interested'
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

// Best-guess default mapping from a raw header name.
function guessMapping(header: string): TargetField {
  const h = header.toLowerCase().trim()
  if (!h) return 'skip'
  if (/(company|business|account)\s*(name)?/.test(h)) return 'company_name'
  if (/^industry$/.test(h) || /sector|vertical/.test(h)) return 'industry'
  if (/^zone$/.test(h) || /territory/.test(h)) return 'zone'
  if (/^state$|province/.test(h)) return 'state'
  if (/^city$|town/.test(h)) return 'city'
  if (/^status$/.test(h)) return 'status'
  if (/priority/.test(h)) return 'priority'
  if (/(lead|referr?al)\s*source|source/.test(h)) return 'lead_source'
  if (/first\s*name|^fname$|^given/.test(h)) return 'contact_first_name'
  if (/last\s*name|^lname$|surname|family/.test(h)) return 'contact_last_name'
  if (/job\s*title|^title$|position|role/.test(h)) return 'contact_job_title'
  if (/email|^e-?mail$/.test(h)) return 'contact_email'
  if (/^address$|street|address\s*1/.test(h)) return 'address'
  return 'skip'
}

export default function ImportCsvModal({
  userId,
  onClose,
  onImported,
}: ImportCsvModalProps) {
  const supabase = useMemo(() => createClient(), [])
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mapping: index in headers → target field
  const [mapping, setMapping] = useState<TargetField[]>([])

  // Auto-guess mapping when headers change.
  useEffect(() => {
    if (headers.length === 0) {
      setMapping([])
      return
    }
    // Only assign a target to the first column that guesses to it, to prevent
    // duplicate mappings of the same field.
    const used = new Set<TargetField>()
    const next = headers.map((h) => {
      const guess = guessMapping(h)
      if (guess !== 'skip' && used.has(guess)) return 'skip' as TargetField
      if (guess !== 'skip') used.add(guess)
      return guess
    })
    setMapping(next)
  }, [headers])

  const mappedTargets = useMemo(() => new Set(mapping.filter((m) => m !== 'skip')), [mapping])
  const companyNameMapped = mappedTargets.has('company_name')

  function setMappingAt(idx: number, value: TargetField) {
    setMapping((prev) => {
      const next = [...prev]
      // If the chosen value already exists elsewhere, clear the previous column
      if (value !== 'skip') {
        for (let i = 0; i < next.length; i++) {
          if (i !== idx && next[i] === value) next[i] = 'skip'
        }
      }
      next[idx] = value
      return next
    })
  }

  // Review / duplicates
  type DupeMatch = { id: string; name: string; score: number }
  type RowDecision = 'import' | 'skip' | 'merge'
  interface ReviewedRow {
    index: number
    mapped: MappedRow
    duplicates: DupeMatch[]
    decision: RowDecision
    mergeTargetId: string | null
  }
  const [reviewedRows, setReviewedRows] = useState<ReviewedRow[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)

  // Import execution
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const [finalStats, setFinalStats] = useState<{
    companies: number
    contacts: number
    skipped: number
    merged: number
  }>({ companies: 0, contacts: 0, skipped: 0, merged: 0 })

  async function runDuplicateDetection() {
    setReviewLoading(true)
    // Build mapped rows for all data rows with a non-empty company_name.
    const built: { mapped: MappedRow; index: number }[] = []
    for (let i = 0; i < rows.length; i++) {
      const m = buildMappedRow(headers, rows[i], mapping)
      if (m.company_name.trim()) built.push({ mapped: m, index: i })
    }
    // Load existing companies once.
    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('id, name')
      .order('name', { ascending: true })
    const candidates = (existingCompanies ?? []) as { id: string; name: string }[]

    const reviewed: ReviewedRow[] = built.map(({ mapped, index }) => {
      const matches = findSimilarNames(mapped.company_name, candidates, 0.82)
      return {
        index,
        mapped,
        duplicates: matches.slice(0, 3),
        decision: 'import',
        mergeTargetId: matches[0]?.id ?? null,
      }
    })
    setReviewedRows(reviewed)
    setReviewLoading(false)
  }

  function setRowDecision(idx: number, decision: RowDecision) {
    setReviewedRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], decision }
      return next
    })
  }

  function setRowMergeTarget(idx: number, targetId: string) {
    setReviewedRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], mergeTargetId: targetId, decision: 'merge' }
      return next
    })
  }

  async function runImport() {
    setStep('importing')
    setImportError(null)
    setImportProgress(0)

    const batchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const toImport = reviewedRows.filter((r) => r.decision !== 'skip')
    setImportTotal(toImport.length)

    let createdCompanies = 0
    let createdContacts = 0
    const skippedCount = reviewedRows.filter((r) => r.decision === 'skip').length
    let mergedCount = 0

    try {
      // Chunk into batches of 50.
      const BATCH = 50
      for (let start = 0; start < toImport.length; start += BATCH) {
        const chunk = toImport.slice(start, start + BATCH)

        // Split into new vs merge
        const newRows = chunk.filter((r) => r.decision === 'import')
        const mergeRows = chunk.filter(
          (r) => r.decision === 'merge' && r.mergeTargetId
        )

        // Insert new companies
        if (newRows.length > 0) {
          const companyPayload = newRows.map((r) => ({
            name: r.mapped.company_name,
            industry: r.mapped.industry,
            zone: r.mapped.zone,
            address: r.mapped.address,
            state: r.mapped.state,
            city: r.mapped.city,
            status: normalizeStatus(r.mapped.status) ?? 'prospect',
            priority: normalizePriority(r.mapped.priority) ?? 'medium',
            lead_source: r.mapped.lead_source,
            import_metadata:
              Object.keys(r.mapped.extras).length > 0 ? r.mapped.extras : null,
            import_batch_id: batchId,
            created_by: userId,
            archived: false,
          }))
          const { data: inserted, error: insertErr } = await supabase
            .from('companies')
            .insert(companyPayload)
            .select('id, name')
          if (insertErr) throw insertErr
          const insertedRows = (inserted ?? []) as { id: string; name: string }[]
          createdCompanies += insertedRows.length

          // For each new company, insert contact if present
          const contactPayload: Array<Record<string, unknown>> = []
          for (let i = 0; i < newRows.length; i++) {
            const row = newRows[i]
            const co = insertedRows[i]
            if (!co) continue
            if (row.mapped.contact_first_name || row.mapped.contact_last_name) {
              contactPayload.push({
                company_id: co.id,
                first_name: row.mapped.contact_first_name || '',
                last_name: row.mapped.contact_last_name || '',
                job_title: row.mapped.contact_job_title,
                email: row.mapped.contact_email,
                phone: null,
                is_primary: true,
                import_batch_id: batchId,
              })
            }
          }
          if (contactPayload.length > 0) {
            const { error: cerr } = await supabase
              .from('contacts')
              .insert(contactPayload)
            if (cerr) throw cerr
            createdContacts += contactPayload.length
          }
        }

        // For merge rows: attach contacts/addresses/extras to existing company
        for (const row of mergeRows) {
          const targetId = row.mergeTargetId!
          // Contact (if present)
          if (row.mapped.contact_first_name || row.mapped.contact_last_name) {
            const { error: cerr } = await supabase.from('contacts').insert({
              company_id: targetId,
              first_name: row.mapped.contact_first_name || '',
              last_name: row.mapped.contact_last_name || '',
              job_title: row.mapped.contact_job_title,
              email: row.mapped.contact_email,
              phone: null,
              is_primary: false,
              import_batch_id: batchId,
            })
            if (cerr) throw cerr
            createdContacts += 1
          }
          // Merge extras into existing import_metadata
          if (Object.keys(row.mapped.extras).length > 0) {
            const { data: existing } = await supabase
              .from('companies')
              .select('import_metadata')
              .eq('id', targetId)
              .maybeSingle()
            const existingMeta = (existing?.import_metadata ?? {}) as Record<
              string,
              string
            >
            const nextMeta = { ...existingMeta, ...row.mapped.extras }
            await supabase
              .from('companies')
              .update({ import_metadata: nextMeta })
              .eq('id', targetId)
          }
          mergedCount += 1
        }

        setImportProgress(Math.min(toImport.length, start + chunk.length))
      }

      setFinalStats({
        companies: createdCompanies,
        contacts: createdContacts,
        skipped: skippedCount,
        merged: mergedCount,
      })
      setStep('done')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setImportError(msg)
    }
  }

  const handleFile = useCallback(async (file: File) => {
    setParseError(null)
    setDetectedFormat(null)
    setFileName(file.name)
    const name = file.name.toLowerCase()

    const applyParsed = (parsed: string[][]) => {
      if (parsed.length < 2) {
        setParseError('File has no data rows.')
        return
      }
      const [head, ...rest] = parsed
      setHeaders(head.map((h) => h.trim()))
      setRows(rest)
    }

    try {
      if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
        setDetectedFormat(name.endsWith('.tsv') ? 'TSV' : 'CSV')
        const text = await file.text()
        const delim = name.endsWith('.tsv') ? '\t' : undefined
        applyParsed(parseCsv(text, delim))
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.numbers')) {
        const ext = name.endsWith('.numbers') ? 'Numbers' : name.endsWith('.xlsx') ? 'Excel (.xlsx)' : 'Excel (.xls)'
        setDetectedFormat(ext)
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        if (!sheetName) { setParseError('No sheets found in the file.'); return }
        const sheet = wb.Sheets[sheetName]
        const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
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
          let currentLine = ''
          let lastY: number | null = null
          for (const item of content.items) {
            if (!('str' in item)) continue
            const y = Math.round((item as { transform: number[] }).transform[5])
            if (lastY !== null && Math.abs(y - lastY) > 3) {
              if (currentLine.trim()) lines.push(currentLine.trim())
              currentLine = ''
            }
            currentLine += (currentLine ? '\t' : '') + item.str
            lastY = y
          }
          if (currentLine.trim()) lines.push(currentLine.trim())
        }
        if (lines.length < 2) {
          setParseError("This PDF doesn't appear to contain tabular data. Please use CSV, Excel, or Numbers format for best results.")
          return
        }
        const tabCounts = lines.map((l) => (l.match(/\t/g) ?? []).length)
        const medianTabs = tabCounts.sort((a, b) => a - b)[Math.floor(tabCounts.length / 2)]
        if (medianTabs < 1) {
          setParseError("This PDF doesn't appear to contain tabular data. Please use CSV, Excel, or Numbers format for best results.")
          return
        }
        const tabular = lines.filter((l) => (l.match(/\t/g) ?? []).length >= medianTabs - 1)
        applyParsed(tabular.map((l) => l.split('\t')))
      } else {
        setParseError('Unsupported file format. Please use CSV, Excel (.xlsx/.xls), Numbers, or PDF.')
      }
    } catch {
      setParseError('Could not read the file.')
    }
  }, [])

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    // Reset so the same file can be re-picked.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const previewRows = rows.slice(0, 3)

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-black/50 modal-below-header"
        onClick={onClose}
      >
        <div
          className="mt-auto md:my-auto md:mx-auto w-full md:max-w-3xl h-full md:h-auto md:max-h-[85vh] bg-white md:rounded-xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex-none flex items-center justify-between px-5 border-b border-gray-200"
            style={{ minHeight: '56px' }}
          >
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Import Data</h3>
              <StepIndicator step={step} />
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'upload' && (
              <div>
                <label
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-12 cursor-pointer transition-colors ${
                    dragging
                      ? 'border-gray-400 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <UploadCloudIcon className="w-10 h-10 text-gray-300" />
                  <div className="text-sm text-gray-700 font-medium">
                    Drop a file here, or click to browse
                  </div>
                  <p className="text-xs text-gray-400">
                    Accepts CSV, Excel (.xlsx/.xls), Numbers, or PDF · first row should be headers
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.xlsx,.xls,.numbers,.pdf,text/csv,text/tab-separated-values"
                    className="hidden"
                    onChange={onPickFile}
                  />
                </label>

                {parseError && (
                  <p className="text-xs text-red-600 mt-3">{parseError}</p>
                )}

                {fileName && headers.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                      <FileTextIcon className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{fileName}</span>
                      <span className="text-gray-400">
                        · {rows.length} row{rows.length === 1 ? '' : 's'}, {headers.length}{' '}
                        column{headers.length === 1 ? '' : 's'}
                      </span>
                      {detectedFormat && (
                        <span className="inline-flex px-2 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-600 rounded-full">
                          {detectedFormat}
                        </span>
                      )}
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            {headers.map((h, i) => (
                              <th
                                key={i}
                                className="text-left px-3 py-2 font-medium text-gray-700 border-b border-gray-200 whitespace-nowrap"
                              >
                                {h || <span className="text-gray-300">(empty)</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((r, ri) => (
                            <tr key={ri} className="border-b border-gray-100 last:border-b-0">
                              {headers.map((_, ci) => (
                                <td
                                  key={ci}
                                  className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[200px] truncate"
                                  title={r[ci] ?? ''}
                                >
                                  {r[ci] ?? ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'mapping' && (
              <div>
                <p className="text-xs text-gray-500 mb-4">
                  Match each column in your file to a CRM field. Columns set to{' '}
                  <em>Skip</em> will be saved as additional data, viewable on the
                  company detail page.
                </p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-0 text-xs bg-gray-50 border-b border-gray-200">
                    <div className="px-3 py-2 font-medium text-gray-600">
                      Source column
                    </div>
                    <div className="px-3 py-2 text-gray-400" />
                    <div className="px-3 py-2 font-medium text-gray-600">
                      Maps to
                    </div>
                  </div>
                  {headers.map((h, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_auto_1fr] gap-0 items-center border-b border-gray-100 last:border-b-0"
                    >
                      <div className="px-3 py-2 text-sm text-gray-900 truncate">
                        {h || <span className="text-gray-300">(empty)</span>}
                        <div className="text-[11px] text-gray-400 truncate">
                          {rows[0]?.[i] ?? ''}
                        </div>
                      </div>
                      <div className="px-2 text-gray-300 text-xs">→</div>
                      <div className="px-3 py-2">
                        <select
                          value={mapping[i] ?? 'skip'}
                          onChange={(e) =>
                            setMappingAt(i, e.target.value as TargetField)
                          }
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        >
                          {TARGET_FIELD_OPTIONS.map((f) => (
                            <option key={f} value={f}>
                              {TARGET_FIELD_LABELS[f]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                {!companyNameMapped && (
                  <p className="text-xs text-amber-600 mt-3">
                    At least one column must be mapped to <strong>Company name</strong>.
                  </p>
                )}

                <div className="mt-6">
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">
                    Preview (first 3 rows)
                  </p>
                  <MappingPreview headers={headers} rows={rows.slice(0, 3)} mapping={mapping} />
                </div>
              </div>
            )}
            {step === 'review' && (
              <div>
                {reviewLoading ? (
                  <p className="text-sm text-gray-400 italic">
                    Checking for duplicates…
                  </p>
                ) : (
                  <>
                    <ReviewSummary rows={reviewedRows} />
                    <div className="mt-4 space-y-2">
                      {reviewedRows
                        .filter((r) => r.duplicates.length > 0)
                        .map((r) => (
                          <div
                            key={r.index}
                            className="border border-gray-200 rounded-lg p-3"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangleIcon className="w-4 h-4 text-amber-600 flex-none" />
                              <span className="text-sm font-medium text-gray-900">
                                Possible duplicate
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">
                                  Incoming
                                </p>
                                <p className="text-gray-900 font-medium">
                                  {r.mapped.company_name}
                                </p>
                                {r.mapped.city || r.mapped.state ? (
                                  <p className="text-gray-500">
                                    {[r.mapped.city, r.mapped.state]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </p>
                                ) : null}
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">
                                  Existing match{r.duplicates.length > 1 ? 'es' : ''}
                                </p>
                                <ul className="space-y-0.5">
                                  {r.duplicates.map((d) => (
                                    <li key={d.id} className="flex items-center gap-2">
                                      <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`merge-${r.index}`}
                                          checked={r.mergeTargetId === d.id}
                                          onChange={() =>
                                            setRowMergeTarget(
                                              reviewedRows.indexOf(r),
                                              d.id
                                            )
                                          }
                                          className="w-3 h-3 text-amber-500 focus:ring-amber-500/20"
                                        />
                                        <span className="text-gray-900">{d.name}</span>
                                      </label>
                                      <span className="text-gray-400 text-[10px]">
                                        {Math.round(d.score * 100)}% match
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              {(['import', 'skip', 'merge'] as const).map((dec) => (
                                <button
                                  key={dec}
                                  onClick={() =>
                                    setRowDecision(reviewedRows.indexOf(r), dec)
                                  }
                                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                    r.decision === dec
                                      ? 'bg-gray-900 text-white border-gray-900'
                                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {dec === 'import'
                                    ? 'Import as new'
                                    : dec === 'skip'
                                      ? 'Skip'
                                      : 'Merge'}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {step === 'importing' && (
              <div className="py-10 text-center">
                <p className="text-sm text-gray-700 mb-4">
                  Importing… {importProgress} of {importTotal}
                </p>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{
                      width: `${
                        importTotal === 0
                          ? 0
                          : Math.round((importProgress / importTotal) * 100)
                      }%`,
                    }}
                  />
                </div>
                {importError && (
                  <p className="text-xs text-red-600 mt-4">{importError}</p>
                )}
              </div>
            )}
            {step === 'done' && (
              <div className="py-8 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-amber-500 mb-4">
                  ✓
                </div>
                <h4 className="text-base font-medium text-gray-900 mb-1">
                  Import complete
                </h4>
                <p className="text-sm text-gray-500">
                  Successfully imported {finalStats.companies} compan
                  {finalStats.companies === 1 ? 'y' : 'ies'} and {finalStats.contacts}{' '}
                  contact{finalStats.contacts === 1 ? '' : 's'}.
                  {finalStats.merged > 0 &&
                    ` Merged ${finalStats.merged} into existing.`}
                  {finalStats.skipped > 0 && ` Skipped ${finalStats.skipped}.`}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex-none flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-200"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            {step !== 'importing' && step !== 'done' && (
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
              >
                Cancel
              </button>
            )}
            <div className={step === 'importing' || step === 'done' ? 'flex-1' : ''} />
            <div className="flex items-center gap-2">
              {step === 'mapping' && (
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
                >
                  Back
                </button>
              )}
              {step === 'upload' && (
                <button
                  onClick={() => setStep('mapping')}
                  disabled={headers.length === 0 || rows.length === 0}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              )}
              {step === 'mapping' && (
                <button
                  onClick={async () => {
                    setStep('review')
                    await runDuplicateDetection()
                  }}
                  disabled={!companyNameMapped}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              )}
              {step === 'review' && (
                <button
                  onClick={() => setStep('mapping')}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg"
                >
                  Back
                </button>
              )}
              {step === 'review' && (
                <button
                  onClick={runImport}
                  disabled={reviewLoading || reviewedRows.length === 0}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors"
                >
                  Import
                </button>
              )}
              {step === 'done' && (
                <button
                  onClick={() => {
                    onImported()
                    onClose()
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}

// Build a structured object from a CSV row given the user's mapping.
interface MappedRow {
  company_name: string
  industry: string | null
  zone: string | null
  state: string | null
  city: string | null
  status: string | null
  priority: string | null
  lead_source: string | null
  contact_first_name: string | null
  contact_last_name: string | null
  contact_job_title: string | null
  contact_email: string | null
  address: string | null
  extras: Record<string, string>
}

function buildMappedRow(
  headers: string[],
  row: string[],
  mapping: TargetField[]
): MappedRow {
  const out: MappedRow = {
    company_name: '',
    industry: null,
    zone: null,
    state: null,
    city: null,
    status: null,
    priority: null,
    lead_source: null,
    contact_first_name: null,
    contact_last_name: null,
    contact_job_title: null,
    contact_email: null,
    address: null,
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

function MappingPreview({
  headers,
  rows,
  mapping,
}: {
  headers: string[]
  rows: string[][]
  mapping: TargetField[]
}) {
  const mappedCols: { label: string; target: TargetField }[] = []
  for (let i = 0; i < mapping.length; i++) {
    if (mapping[i] !== 'skip') {
      mappedCols.push({ label: TARGET_FIELD_LABELS[mapping[i]], target: mapping[i] })
    }
  }
  if (mappedCols.length === 0) {
    return <p className="text-xs text-gray-400 italic">No columns mapped yet.</p>
  }
  return (
    <div className="border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            {mappedCols.map((c) => (
              <th
                key={c.target}
                className="text-left px-3 py-2 font-medium text-gray-700 border-b border-gray-200 whitespace-nowrap"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const built = buildMappedRow(headers, r, mapping)
            return (
              <tr key={ri} className="border-b border-gray-100 last:border-b-0">
                {mappedCols.map((c) => {
                  const v =
                    c.target === 'company_name'
                      ? built.company_name
                      : (built as unknown as Record<string, string | number | null>)[
                          c.target
                        ]
                  return (
                    <td
                      key={c.target}
                      className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[200px] truncate"
                      title={v == null ? '' : String(v)}
                    >
                      {v == null || v === '' ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        String(v)
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ReviewSummary({
  rows,
}: {
  rows: Array<{
    duplicates: Array<{ id: string }>
    decision: 'import' | 'skip' | 'merge'
    mapped: { contact_first_name: string | null; contact_last_name: string | null }
  }>
}) {
  let newCompanies = 0
  let skipped = 0
  let merged = 0
  let contacts = 0
  for (const r of rows) {
    if (r.decision === 'skip') {
      skipped += 1
      continue
    }
    if (r.decision === 'merge') merged += 1
    else newCompanies += 1
    if (r.mapped.contact_first_name || r.mapped.contact_last_name) contacts += 1
  }
  const duplicatesFound = rows.filter((r) => r.duplicates.length > 0).length
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Stat label="New companies" value={newCompanies} accent />
      <Stat label="Contacts" value={contacts} />
      <Stat label="Possible duplicates" value={duplicatesFound} />
      {merged > 0 && <Stat label="Will merge" value={merged} />}
      {skipped > 0 && <Stat label="Skipped" value={skipped} />}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div
      className={`inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border ${
        accent ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'
      }`}
    >
      <span
        className={`text-sm font-semibold tabular-nums ${
          accent ? 'text-amber-600' : 'text-gray-900'
        }`}
      >
        {value}
      </span>
      <span className="text-gray-500">{label}</span>
    </div>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const labels: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'mapping', label: 'Map fields' },
    { key: 'review', label: 'Review' },
    { key: 'importing', label: 'Import' },
  ]
  const activeIdx = labels.findIndex((l) => l.key === step)
  return (
    <div className="hidden md:flex items-center gap-1.5 text-xs">
      {labels.map((l, i) => {
        const isCurrent = i === activeIdx
        const isDone = i < activeIdx || step === 'done'
        return (
          <div key={l.key} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${
                isDone
                  ? 'bg-amber-500 text-white'
                  : isCurrent
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}
            </span>
            <span
              className={
                isCurrent
                  ? 'text-gray-900 font-medium'
                  : isDone
                    ? 'text-gray-500'
                    : 'text-gray-400'
              }
            >
              {l.label}
            </span>
            {i < labels.length - 1 && <span className="text-gray-300">→</span>}
          </div>
        )
      })}
    </div>
  )
}
