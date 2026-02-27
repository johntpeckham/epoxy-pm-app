/**
 * Fetches current weather for a given address using Open-Meteo free APIs.
 * 1. Geocodes the address to lat/lon
 * 2. Fetches current weather conditions
 */
export async function fetchWeatherForAddress(address: string): Promise<string | null> {
  if (!address.trim()) return null

  try {
    // Geocode the address
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&language=en&format=json`
    )
    if (!geoRes.ok) return null
    const geoData = await geoRes.json()

    if (!geoData.results || geoData.results.length === 0) return null

    const { latitude, longitude } = geoData.results[0]

    // Fetch current weather
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`
    )
    if (!weatherRes.ok) return null
    const weatherData = await weatherRes.json()

    const current = weatherData.current
    if (!current) return null

    const temp = Math.round(current.temperature_2m)
    const wind = Math.round(current.wind_speed_10m)
    const condition = weatherCodeToDescription(current.weather_code)

    return `${temp}°F, ${condition}, Wind ${wind} mph`
  } catch {
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
