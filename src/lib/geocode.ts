interface GeoResult {
  latitude: number
  longitude: number
}

const memoryCache = new Map<string, GeoResult>()

export async function geocodeLocation(locationName: string): Promise<GeoResult | null> {
  const key = locationName.trim().toLowerCase()
  if (!key) return null

  const cached = memoryCache.get(key)
  if (cached) return cached

  try {
    const stored = localStorage.getItem(`geocode:${key}`)
    if (stored) {
      const parsed = JSON.parse(stored) as GeoResult
      memoryCache.set(key, parsed)
      return parsed
    }
  } catch {}

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(locationName)}`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    if (!data.result) return null

    const result: GeoResult = data.result
    memoryCache.set(key, result)
    try {
      localStorage.setItem(`geocode:${key}`, JSON.stringify(result))
    } catch {}

    return result
  } catch {
    return null
  }
}

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function findLocationsWithinRadius(
  targetLocation: string,
  allLocations: string[],
  radiusMiles: number
): Promise<Set<string>> {
  const result = new Set<string>()
  result.add(targetLocation)

  if (radiusMiles <= 0) return result

  const targetGeo = await geocodeLocation(targetLocation)
  if (!targetGeo) return result

  for (const loc of allLocations) {
    if (loc === targetLocation) continue
    const geo = await geocodeLocation(loc)
    if (!geo) continue
    const dist = haversineDistance(
      targetGeo.latitude,
      targetGeo.longitude,
      geo.latitude,
      geo.longitude
    )
    if (dist <= radiusMiles) {
      result.add(loc)
    }
  }

  return result
}
