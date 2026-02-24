'use client'

import { CalendarIcon } from 'lucide-react'

// REPLACE THIS WITH YOUR GOOGLE CALENDAR EMBED URL
const GOOGLE_CALENDAR_EMBED_URL =
  'https://calendar.google.com/calendar/embed?src=en.usa%23holiday%40group.v.calendar.google.com&ctz=America%2FNew_York'

export default function CalendarPageClient() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Header */}
      <div className="px-4 py-5 sm:px-6 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <CalendarIcon className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
            <p className="text-sm text-gray-500 mt-0.5">Project schedule and events</p>
          </div>
        </div>
      </div>

      {/* Calendar embed */}
      <div className="flex-1 px-4 pb-4 sm:px-6 sm:pb-6 min-h-0">
        <div className="h-full max-w-6xl mx-auto bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <iframe
            src={GOOGLE_CALENDAR_EMBED_URL}
            title="Google Calendar"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </div>
  )
}
