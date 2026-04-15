// Static lookup of California city coordinates for the Zone Map feature.
// Covers the Central Valley (Peckham Coatings' primary territory) plus the
// major metros we occasionally have companies in. Kept intentionally small —
// if a city isn't here, the company is just skipped on the map.

export interface LatLng {
  lat: number
  lng: number
}

// Keys are lowercase city names. Values are [lat, lng].
const CITY_COORDS: Record<string, LatLng> = {
  // Central Valley core
  fresno: { lat: 36.7378, lng: -119.7871 },
  clovis: { lat: 36.8252, lng: -119.7029 },
  visalia: { lat: 36.3302, lng: -119.2921 },
  tulare: { lat: 36.2077, lng: -119.3473 },
  madera: { lat: 36.9613, lng: -120.0607 },
  bakersfield: { lat: 35.3733, lng: -119.0187 },
  hanford: { lat: 36.3274, lng: -119.6457 },
  porterville: { lat: 36.0652, lng: -119.0168 },
  merced: { lat: 37.3022, lng: -120.483 },
  modesto: { lat: 37.6391, lng: -120.9969 },
  stockton: { lat: 37.9577, lng: -121.2908 },
  sacramento: { lat: 38.5816, lng: -121.4944 },

  // Additional Central Valley / nearby cities
  selma: { lat: 36.5708, lng: -119.6121 },
  reedley: { lat: 36.5963, lng: -119.4504 },
  sanger: { lat: 36.7080, lng: -119.5593 },
  kingsburg: { lat: 36.5138, lng: -119.5543 },
  dinuba: { lat: 36.5432, lng: -119.3873 },
  lindsay: { lat: 36.2030, lng: -119.0887 },
  exeter: { lat: 36.2961, lng: -119.1421 },
  lemoore: { lat: 36.3008, lng: -119.7829 },
  coalinga: { lat: 36.1396, lng: -120.3601 },
  chowchilla: { lat: 37.1230, lng: -120.2602 },
  'los banos': { lat: 37.0583, lng: -120.8499 },
  turlock: { lat: 37.4947, lng: -120.8466 },
  ceres: { lat: 37.5949, lng: -120.9577 },
  manteca: { lat: 37.7974, lng: -121.2161 },
  tracy: { lat: 37.7396, lng: -121.4252 },
  delano: { lat: 35.7688, lng: -119.2471 },
  wasco: { lat: 35.5941, lng: -119.3408 },
  shafter: { lat: 35.5006, lng: -119.2718 },
  'oakdale': { lat: 37.7665, lng: -120.8471 },
  atwater: { lat: 37.3480, lng: -120.6091 },
  livingston: { lat: 37.3869, lng: -120.7235 },

  // Central coast
  'los osos': { lat: 35.3108, lng: -120.8328 },
  'san luis obispo': { lat: 35.2828, lng: -120.6596 },
  'morro bay': { lat: 35.3658, lng: -120.8499 },
  'paso robles': { lat: 35.6266, lng: -120.6910 },
  atascadero: { lat: 35.4894, lng: -120.6707 },
  'santa maria': { lat: 34.9530, lng: -120.4357 },
  'pismo beach': { lat: 35.1428, lng: -120.6413 },

  // Major metros
  'san jose': { lat: 37.3382, lng: -121.8863 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'san diego': { lat: 32.7157, lng: -117.1611 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  oakland: { lat: 37.8044, lng: -122.2712 },
  riverside: { lat: 33.9533, lng: -117.3962 },
}

// Common aliases / abbreviations → canonical key
const ALIASES: Record<string, string> = {
  slo: 'san luis obispo',
  'san luis': 'san luis obispo',
  sf: 'san francisco',
  la: 'los angeles',
  'los angeles ca': 'los angeles',
}

function normalize(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, '')
}

/**
 * Look up lat/lng for a California city. Case-insensitive, trims whitespace,
 * handles a few common abbreviations. Returns null if the city isn't in the
 * lookup table.
 */
export function lookupCityCoords(
  city: string | null | undefined
): LatLng | null {
  if (!city) return null
  const key = normalize(city)
  if (CITY_COORDS[key]) return CITY_COORDS[key]
  const aliased = ALIASES[key]
  if (aliased && CITY_COORDS[aliased]) return CITY_COORDS[aliased]
  return null
}

// Default map view — roughly centered on the Central Valley.
export const CA_DEFAULT_CENTER: LatLng = { lat: 36.75, lng: -119.8 }
export const CA_DEFAULT_ZOOM = 7
