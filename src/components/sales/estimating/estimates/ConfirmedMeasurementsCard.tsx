'use client'

// Placeholder for Phase 2 — the Project Measurements sidebar is intentionally
// not wired to real data yet. It surfaces a copy hint about the takeoff tool
// (the future source of these measurements) and renders an empty state.

export default function ConfirmedMeasurementsCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Project measurements
      </h4>
      <p className="text-xs text-gray-500 dark:text-[#a0a0a0] leading-relaxed">
        No project measurements yet — visit the takeoff tool to add measurements.
      </p>
    </div>
  )
}
