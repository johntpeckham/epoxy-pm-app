'use client'

export default function MeasurementReferences() {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Measurement references
      </h4>
      <div className="grid grid-cols-1 gap-2">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-600">
            Floor plan — main area
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            From project measurements
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-600">
            Photo — warehouse overview
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            From project measurements
          </p>
        </div>
      </div>
    </div>
  )
}
