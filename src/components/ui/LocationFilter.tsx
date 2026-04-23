'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon, XIcon } from 'lucide-react'
import { findLocationsWithinRadius } from '@/lib/geocode'

export interface LocationFilterValue {
  zones: string[]
  cities: string[]
  states: string[]
  radiusCity: string | null
  radiusMiles: number | null
}

export const EMPTY_LOCATION_VALUE: LocationFilterValue = {
  zones: [],
  cities: [],
  states: [],
  radiusCity: null,
  radiusMiles: null,
}

export interface CityStatePair {
  city: string
  state: string | null
}

interface LocationFilterProps {
  value: LocationFilterValue
  onChange: (next: LocationFilterValue) => void
  availableZones: string[]
  availableCities: string[]
  availableStates: string[]
  /**
   * Optional city→state pairs used to disambiguate geocoding (e.g. "Springfield, IL").
   * If omitted, cities are geocoded by name only.
   */
  cityStatePairs?: CityStatePair[]
  /**
   * Fires whenever the async radius geocoding resolves. null means no radius is active.
   * Consumers pass this set into applyLocationFilter() to filter companies.
   */
  onRadiusCitiesChange?: (cities: Set<string> | null) => void
  triggerLabel?: string
  /**
   * Trigger style:
   *  - 'chip' (default): compact pill, for filter bars like the CRM table.
   *  - 'input': full-width dropdown input, for forms like Dialer/Emailer auto-select.
   */
  variant?: 'chip' | 'input'
  className?: string
}

const RADIUS_MIN = 1
const RADIUS_MAX = 500

function companyField(
  company: { zone?: string | null; city?: string | null; state?: string | null },
  field: 'zone' | 'city' | 'state',
): string | null {
  const v = company[field]
  return typeof v === 'string' ? v : null
}

/**
 * Pure, synchronous filter predicate. Returns true if the company matches the
 * location filter value. Pass `radiusCities` when a radius search is active — it
 * is the pre-computed expanded set of city names within the radius of
 * value.radiusCity.
 *
 * Semantics match CRM: AND across sections, OR within a section. When radius is
 * active and cities are selected, the city set is REPLACED by radiusCities
 * (which is the selected city + every other city within the mile radius).
 */
export function applyLocationFilter(
  company: { zone?: string | null; city?: string | null; state?: string | null },
  value: LocationFilterValue,
  radiusCities?: Set<string> | null,
): boolean {
  if (value.zones.length > 0) {
    const z = companyField(company, 'zone')
    if (!z || !value.zones.includes(z)) return false
  }
  if (value.states.length > 0) {
    const s = companyField(company, 'state')
    if (!s || !value.states.includes(s)) return false
  }
  const radiusActive =
    radiusCities != null &&
    radiusCities.size > 0 &&
    value.cities.length > 0 &&
    value.radiusCity != null &&
    value.radiusMiles != null &&
    value.radiusMiles > 0
  if (radiusActive) {
    const c = companyField(company, 'city')
    if (!c || !radiusCities!.has(c)) return false
  } else if (value.cities.length > 0) {
    const c = companyField(company, 'city')
    if (!c || !value.cities.includes(c)) return false
  }
  return true
}

function clampMiles(n: number): number {
  if (!Number.isFinite(n)) return RADIUS_MIN
  const r = Math.round(n)
  if (r < RADIUS_MIN) return RADIUS_MIN
  if (r > RADIUS_MAX) return RADIUS_MAX
  return r
}

export default function LocationFilter({
  value,
  onChange,
  availableZones,
  availableCities,
  availableStates,
  cityStatePairs,
  onRadiusCitiesChange,
  triggerLabel = 'Location',
  variant = 'chip',
  className = '',
}: LocationFilterProps) {
  const [open, setOpen] = useState(false)
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const [radiusLoading, setRadiusLoading] = useState(false)
  const [radiusError, setRadiusError] = useState(false)
  const [radiusCities, setRadiusCities] = useState<Set<string> | null>(null)
  const [milesInput, setMilesInput] = useState<string>(
    value.radiusMiles != null ? String(value.radiusMiles) : '',
  )

  // Sync text input when value.radiusMiles changes externally
  useEffect(() => {
    setMilesInput(value.radiusMiles != null ? String(value.radiusMiles) : '')
  }, [value.radiusMiles])

  const activeCount = value.zones.length + value.cities.length + value.states.length
  const radiusDisplayActive =
    value.radiusCity != null && value.radiusMiles != null && value.radiusMiles > 0

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const zonesSorted = useMemo(
    () => [...availableZones].sort((a, b) => a.localeCompare(b)),
    [availableZones],
  )
  const citiesSorted = useMemo(
    () => [...availableCities].sort((a, b) => a.localeCompare(b)),
    [availableCities],
  )
  const statesSorted = useMemo(
    () => [...availableStates].sort((a, b) => a.localeCompare(b)),
    [availableStates],
  )

  // Build label helpers for geocoding (city + state for disambiguation)
  const cityStateMap = useMemo(() => {
    const m = new Map<string, string | null>()
    if (cityStatePairs) {
      for (const p of cityStatePairs) {
        if (!m.has(p.city)) m.set(p.city, p.state ?? null)
      }
    }
    return m
  }, [cityStatePairs])

  const labelForCity = useCallback(
    (city: string): string => {
      const st = cityStateMap.get(city)
      return st ? `${city}, ${st}` : city
    },
    [cityStateMap],
  )

  // ─── Radius geocoding effect ────────────────────────────────────────────
  useEffect(() => {
    const target = value.radiusCity
    const miles = value.radiusMiles
    if (!target || miles == null || miles <= 0) {
      setRadiusCities(null)
      setRadiusLoading(false)
      setRadiusError(false)
      onRadiusCitiesChange?.(null)
      return
    }
    setRadiusLoading(true)
    setRadiusError(false)
    let cancelled = false

    const targetLabel = labelForCity(target)
    const allLabels = citiesSorted.map(labelForCity)

    findLocationsWithinRadius(targetLabel, allLabels, miles)
      .then((labelSet) => {
        if (cancelled) return
        const result = new Set<string>()
        for (const city of citiesSorted) {
          if (labelSet.has(labelForCity(city))) result.add(city)
        }
        // Ensure the target city is always present
        result.add(target)
        setRadiusCities(result)
        setRadiusLoading(false)
        onRadiusCitiesChange?.(result)
      })
      .catch(() => {
        if (cancelled) return
        setRadiusLoading(false)
        setRadiusError(true)
        onRadiusCitiesChange?.(null)
      })

    return () => {
      cancelled = true
    }
  }, [
    value.radiusCity,
    value.radiusMiles,
    citiesSorted,
    labelForCity,
    onRadiusCitiesChange,
  ])

  function toggleArray(arr: string[], v: string): string[] {
    const idx = arr.indexOf(v)
    if (idx === -1) return [...arr, v]
    const next = arr.slice()
    next.splice(idx, 1)
    return next
  }

  function toggleZone(z: string) {
    onChange({ ...value, zones: toggleArray(value.zones, z) })
  }
  function toggleState(s: string) {
    onChange({ ...value, states: toggleArray(value.states, s) })
  }
  function toggleCity(c: string) {
    const nextCities = toggleArray(value.cities, c)
    // Keep radiusCity in sync with the cities selection (CRM parity):
    // - If radiusCity is null and we just added a city, auto-set it.
    // - If the removed city equaled radiusCity, clear radiusCity (and miles).
    let nextRadiusCity = value.radiusCity
    let nextRadiusMiles = value.radiusMiles
    const added = nextCities.length > value.cities.length
    if (added && value.radiusCity == null) {
      nextRadiusCity = c
    } else if (!added && value.radiusCity === c) {
      nextRadiusCity = nextCities[0] ?? null
      if (nextRadiusCity == null) nextRadiusMiles = null
    }
    onChange({
      ...value,
      cities: nextCities,
      radiusCity: nextRadiusCity,
      radiusMiles: nextRadiusMiles,
    })
  }

  function commitMiles(raw: string) {
    const trimmed = raw.trim()
    if (trimmed === '') {
      onChange({ ...value, radiusMiles: null })
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      setMilesInput(value.radiusMiles != null ? String(value.radiusMiles) : '')
      return
    }
    const clamped = clampMiles(n)
    setMilesInput(String(clamped))
    onChange({ ...value, radiusMiles: clamped })
  }

  function clearRadius() {
    setMilesInput('')
    onChange({ ...value, radiusCity: null, radiusMiles: null })
  }

  function clearAll() {
    setMilesInput('')
    onChange({
      zones: [],
      cities: [],
      states: [],
      radiusCity: null,
      radiusMiles: null,
    })
  }

  function handleTriggerClick(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setDropdownRect(rect)
    setOpen((v) => !v)
  }

  const sectionHeaderStyle = { color: '#EF9F27' }
  const mutedOrange = 'rgba(239,159,39,0.6)'

  const radiusSuffix = radiusDisplayActive ? ` +${value.radiusMiles}mi` : ''

  return (
    <div className={`relative ${className}`}>
      {variant === 'input' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="w-full px-3 py-2 text-sm text-left border border-gray-200 dark:border-[#333] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 flex items-center justify-between"
        >
          <span className="truncate">
            {triggerLabel}
            {activeCount > 0 && (
              <span className="text-[10px] text-blue-500 ml-1">
                ({activeCount}){radiusSuffix}
              </span>
            )}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleTriggerClick}
          className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border transition-colors ${
            activeCount > 0
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
          style={{ borderRadius: 20 }}
        >
          {triggerLabel}
          {activeCount > 0 && (
            <span className="text-[10px] text-blue-500">
              ({activeCount}){radiusSuffix}
            </span>
          )}
          {activeCount > 0 ? (
            <XIcon
              className="w-3 h-3 ml-0.5 hover:text-blue-900"
              onClick={(e) => {
                e.stopPropagation()
                clearAll()
              }}
            />
          ) : (
            <ChevronDownIcon className="w-3 h-3" />
          )}
        </button>
      )}

      {open &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[220px] max-h-[380px] overflow-y-auto"
              style={{ top: dropdownRect.bottom + 4, left: dropdownRect.left }}
              role="dialog"
              aria-label="Location filter"
            >
              {/* ZONE */}
              <div>
                <div
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={sectionHeaderStyle}
                >
                  Zone
                </div>
                {zonesSorted.length === 0 ? (
                  <div className="px-3 py-1.5 text-xs text-gray-300">No values</div>
                ) : (
                  zonesSorted.map((z) => {
                    const checked = value.zones.includes(z)
                    return (
                      <label
                        key={z}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleZone(z)}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                        />
                        <span className="truncate">{z}</span>
                      </label>
                    )
                  })
                )}
              </div>

              {/* RADIUS SEARCH */}
              <div className="mt-2 pt-2 border-t border-gray-100 px-3 pb-2">
                <div
                  className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
                  style={sectionHeaderStyle}
                >
                  Radius search
                </div>
                {value.radiusCity == null ? (
                  <div
                    className="text-[10px]"
                    style={{ color: 'rgba(239,159,39,0.55)' }}
                  >
                    Select a city first
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700 truncate flex-1">
                        {value.radiusCity}
                      </span>
                      <input
                        type="number"
                        min={RADIUS_MIN}
                        max={RADIUS_MAX}
                        value={milesInput}
                        onChange={(e) => setMilesInput(e.target.value)}
                        onBlur={(e) => commitMiles(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitMiles((e.target as HTMLInputElement).value)
                          }
                        }}
                        placeholder="mi"
                        aria-label="Radius in miles"
                        className="w-16 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={clearRadius}
                        className="text-[10px] text-gray-400 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                    {radiusLoading && (
                      <div
                        className="text-[10px] mt-1"
                        style={{ color: mutedOrange }}
                      >
                        Calculating…
                      </div>
                    )}
                    {radiusError && (
                      <div className="text-[10px] text-red-500 mt-1">
                        Radius search unavailable
                      </div>
                    )}
                    {!radiusLoading &&
                      !radiusError &&
                      value.radiusMiles != null &&
                      value.radiusMiles > 0 &&
                      radiusCities && (
                        <div
                          className="text-[10px] mt-1"
                          style={{ color: 'rgba(239,159,39,0.7)' }}
                        >
                          {radiusCities.size}{' '}
                          {radiusCities.size === 1 ? 'city' : 'cities'} within{' '}
                          {value.radiusMiles} mi
                        </div>
                      )}
                  </>
                )}
              </div>

              {/* CITY */}
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={sectionHeaderStyle}
                >
                  City
                </div>
                {citiesSorted.length === 0 ? (
                  <div className="px-3 py-1.5 text-xs text-gray-300">No values</div>
                ) : (
                  citiesSorted.map((c) => {
                    const checked = value.cities.includes(c)
                    return (
                      <label
                        key={c}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCity(c)}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                        />
                        <span className="truncate">{c}</span>
                      </label>
                    )
                  })
                )}
              </div>

              {/* STATE */}
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={sectionHeaderStyle}
                >
                  State
                </div>
                {statesSorted.length === 0 ? (
                  <div className="px-3 py-1.5 text-xs text-gray-300">No values</div>
                ) : (
                  statesSorted.map((s) => {
                    const checked = value.states.includes(s)
                    return (
                      <label
                        key={s}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleState(s)}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/20"
                        />
                        <span className="truncate">{s}</span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
