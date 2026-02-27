/**
 * Fetches current weather for a project address using Open-Meteo free APIs.
 *
 * Strategy:
 *  1. Extract zip code from address → geocode with Open-Meteo
 *  2. If that fails, extract city name → geocode with Open-Meteo
 *  3. If that fails, try city + state → geocode with Open-Meteo
 *  4. Use the resulting lat/lon to fetch current weather
 */

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'

/** Extract a 5-digit US zip code from an address string */
function extractZipCode(address: string): string | null {
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/)
  return match ? match[1] : null
}

/**
 * Extract the city name from a US address.
 * "123 Main St, Houston, TX 77027" → "Houston"
 * "Houston, TX 77027" → "Houston"
 * "Houston" → "Houston"
 */
function extractCity(address: string): string | null {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 3) {
    // "Street, City, State ZIP" → City is the second part
    return parts[1] || null
  }
  if (parts.length === 2) {
    // "City, State ZIP" → City is the first part
    return parts[0].replace(/^\d+\s+\S+\s+/, '').trim() || parts[0]
  }
  // Single segment — strip leading street numbers and return
  const stripped = address.replace(/^\d+\s+/, '').trim()
  return stripped || null
}

/**
 * Extract "City, State" from a US address.
 * "123 Main St, Houston, TX 77027" → "Houston, TX"
 */
function extractCityState(address: string): string | null {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 3) {
    const cityState = parts.slice(1).join(', ')
    return cityState
      .replace(/\b\d{5}(-\d{4})?\b/g, '')
      .replace(/,\s*$/g, '')
      .trim() || null
  }
  if (parts.length === 2) {
    const joined = parts.join(', ')
    return joined
      .replace(/\b\d{5}(-\d{4})?\b/g, '')
      .trim()
      .replace(/,\s*$/g, '')
      .trim() || null
  }
  return null
}

/** Try to geocode a query string, returning { latitude, longitude } or null */
async function geocode(query: string): Promise<{ latitude: number; longitude: number } | null> {
  console.log('[fetchWeather] Geocoding query:', JSON.stringify(query))
  const res = await fetch(
    `${GEO_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`
  )
  if (!res.ok) {
    console.warn('[fetchWeather] Geocoding HTTP error:', res.status, res.statusText)
    return null
  }
  const data = await res.json()
  if (!data.results || data.results.length === 0) {
    console.warn('[fetchWeather] Geocoding returned no results for:', query)
    return null
  }
  const { latitude, longitude, name, admin1, country } = data.results[0]
  console.log('[fetchWeather] Geocoded to:', { name, admin1, country, latitude, longitude })
  return { latitude, longitude }
}

/** Fetch current weather for a lat/lon from Open-Meteo */
async function fetchWeatherForCoords(lat: number, lon: number): Promise<string | null> {
  console.log('[fetchWeather] Fetching weather for coords:', { lat, lon })
  const res = await fetch(
    `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`
  )
  if (!res.ok) {
    console.warn('[fetchWeather] Weather HTTP error:', res.status, res.statusText)
    return null
  }
  const data = await res.json()
  const current = data.current
  if (!current) {
    console.warn('[fetchWeather] Weather response missing "current" field:', data)
    return null
  }

  const temp = Math.round(current.temperature_2m)
  const wind = Math.round(current.wind_speed_10m)
  const condition = weatherCodeToDescription(current.weather_code)
  const result = `${temp}°F, ${condition}, Wind ${wind} mph`
  console.log('[fetchWeather] Weather result:', result)
  return result
}

/**
 * Main entry point: fetch weather for a project address.
 * Tries zip code geocoding first, then city, then city+state.
 */
export async function fetchWeatherForAddress(address: string): Promise<string | null> {
  if (!address.trim()) {
    console.warn('[fetchWeather] Empty address, skipping')
    return null
  }

  console.log('[fetchWeather] Starting weather fetch for address:', address)

  try {
    let coords: { latitude: number; longitude: number } | null = null

    // Strategy 1: Try zip code
    const zip = extractZipCode(address)
    if (zip) {
      console.log('[fetchWeather] Trying zip code:', zip)
      coords = await geocode(zip)
    }

    // Strategy 2: Try city name only
    if (!coords) {
      const city = extractCity(address)
      if (city) {
        console.log('[fetchWeather] Trying city name:', city)
        coords = await geocode(city)
      }
    }

    // Strategy 3: Try city + state
    if (!coords) {
      const cityState = extractCityState(address)
      if (cityState) {
        console.log('[fetchWeather] Trying city+state:', cityState)
        coords = await geocode(cityState)
      }
    }

    if (!coords) {
      console.warn('[fetchWeather] All geocoding strategies failed for:', address)
      return null
    }

    return await fetchWeatherForCoords(coords.latitude, coords.longitude)
  } catch (err) {
    console.error('[fetchWeather] Unexpected error:', err)
    return null
  }
}

/** Convert WMO weather code to human-readable description */
function weatherCodeToDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear Sky',
    1: 'Mainly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing Rime Fog',
    51: 'Light Drizzle',
    53: 'Moderate Drizzle',
    55: 'Dense Drizzle',
    61: 'Slight Rain',
    63: 'Moderate Rain',
    65: 'Heavy Rain',
    71: 'Slight Snow',
    73: 'Moderate Snow',
    75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Slight Rain Showers',
    81: 'Moderate Rain Showers',
    82: 'Violent Rain Showers',
    85: 'Slight Snow Showers',
    86: 'Heavy Snow Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with Slight Hail',
    99: 'Thunderstorm with Heavy Hail',
  }
  return descriptions[code] ?? 'Unknown'
}
