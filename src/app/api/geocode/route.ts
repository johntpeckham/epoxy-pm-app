import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'EpoxyPM/1.0'

let lastRequestTime = 0

export async function GET(req: NextRequest) {
  // Any authenticated user can use geocoding (utility endpoint, no feature key).
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })

  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < 1100) {
    await new Promise((r) => setTimeout(r, 1100 - elapsed))
  }
  lastRequestTime = Date.now()

  try {
    const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(q)}&format=json&limit=1`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return NextResponse.json({ error: 'Nominatim error' }, { status: 502 })
    const data = await res.json()
    if (!data || data.length === 0) return NextResponse.json({ result: null })
    return NextResponse.json({
      result: { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) },
    })
  } catch {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 })
  }
}
