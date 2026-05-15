'use client'

// Placeholder for Phase 2 — the Measurement references sidebar module is
// intentionally not wired to real data yet. Renders an empty state.

export default function MeasurementReferences() {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Measurement references
      </h4>
      <p className="text-xs text-gray-500 dark:text-[#a0a0a0] leading-relaxed">
        No references yet.
      </p>
    </div>
  )
}
