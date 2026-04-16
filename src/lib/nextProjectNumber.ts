import type { SupabaseClient } from '@supabase/supabase-js'

export interface ParsedProjectFormat {
  prefix: string
  numeric: number
  suffix: string
}

/**
 * Parse a project-number format string into prefix / numeric / suffix parts.
 * Finds the first continuous digit sequence; everything before is prefix,
 * everything after is suffix.
 *
 *   "1000-P"       -> { prefix: "",    numeric: 1000, suffix: "-P" }
 *   "P-1000"       -> { prefix: "P-",  numeric: 1000, suffix: ""   }
 *   "1000"         -> { prefix: "",    numeric: 1000, suffix: ""   }
 *   "ABC-1000-XY"  -> { prefix: "ABC-",numeric: 1000, suffix: "-XY"}
 */
export function parseProjectFormat(input: string): ParsedProjectFormat {
  const raw = (input ?? '').trim()
  const match = raw.match(/(\d+)/)
  if (!match || match.index === undefined) {
    return { prefix: raw, numeric: 1000, suffix: '' }
  }
  const numeric = parseInt(match[1], 10)
  const prefix = raw.slice(0, match.index)
  const suffix = raw.slice(match.index + match[1].length)
  return { prefix, numeric, suffix }
}

export function formatProjectNumber(parts: ParsedProjectFormat): string {
  return `${parts.prefix}${parts.numeric}${parts.suffix}`
}

interface UserProjectSequenceRow {
  id: string
  user_id: string
  prefix: string
  suffix: string
  current_number: number
  format_example: string | null
}

/**
 * Reserve the next project number for a user. Creates a default sequence
 * if none exists (first project becomes 1000).
 *
 * Atomically increments current_number and returns the assembled string.
 */
export async function assignNextProjectNumber(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('user_project_sequences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  let seq = existing as UserProjectSequenceRow | null

  if (!seq) {
    const defaults = await loadSequenceDefaults(supabase)
    const { data: created } = await supabase
      .from('user_project_sequences')
      .insert({
        user_id: userId,
        prefix: defaults.prefix,
        suffix: defaults.suffix,
        current_number: defaults.numeric - 1,
        format_example: defaults.formatExample,
      })
      .select('*')
      .single()
    seq = (created as UserProjectSequenceRow) ?? {
      id: '',
      user_id: userId,
      prefix: defaults.prefix,
      suffix: defaults.suffix,
      current_number: defaults.numeric - 1,
      format_example: defaults.formatExample,
    }
  }

  const nextNumeric = seq.current_number + 1
  const assembled = `${seq.prefix}${nextNumeric}${seq.suffix}`

  await supabase
    .from('user_project_sequences')
    .update({ current_number: nextNumeric })
    .eq('user_id', userId)

  return assembled
}

/**
 * Preview the next number without incrementing. Used for live previews
 * in settings and fallback displays.
 */
export function previewNextNumber(
  prefix: string,
  suffix: string,
  currentNumber: number
): string {
  return `${prefix}${currentNumber + 1}${suffix}`
}

/**
 * Loads the admin-configured default project number format from
 * sales_settings. Falls back to "1000" if no row exists.
 */
async function loadSequenceDefaults(supabase: SupabaseClient): Promise<{
  prefix: string
  suffix: string
  numeric: number
  formatExample: string
}> {
  const { data } = await supabase
    .from('sales_settings')
    .select('default_project_number_format')
    .limit(1)
    .maybeSingle()
  const formatExample =
    (data?.default_project_number_format as string | undefined)?.trim() ||
    '1000'
  const parsed = parseProjectFormat(formatExample)
  return {
    prefix: parsed.prefix,
    suffix: parsed.suffix,
    numeric: parsed.numeric,
    formatExample,
  }
}

/**
 * Peek at the next project number for a user without incrementing the
 * sequence. If the user has no sequence yet, uses the admin's default
 * format. Used to pre-populate the New Project modal.
 */
export async function peekNextProjectNumber(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('user_project_sequences')
    .select('prefix, suffix, current_number')
    .eq('user_id', userId)
    .maybeSingle()

  const seq = data as
    | { prefix: string; suffix: string; current_number: number }
    | null

  if (!seq) {
    const defaults = await loadSequenceDefaults(supabase)
    return defaults.formatExample
  }

  return `${seq.prefix}${seq.current_number + 1}${seq.suffix}`
}
