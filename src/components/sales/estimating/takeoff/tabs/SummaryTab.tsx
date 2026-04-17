'use client'

export default function SummaryTab() {
  return (
    <div className="space-y-4 max-w-4xl">
      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Total measurements" value="4,850 sf" />
        <MetricCard label="Hard cost" value="$18,420" />
        <MetricCard label="Final total" value="$27,694" highlight />
      </div>

      {/* Estimate calculator */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Estimate calculator
        </h3>
        <div className="space-y-2 text-sm">
          <LineItem label="Material cost" value="$8,240" />
          <LineItem label="Labor" value="$6,480" />
          <LineItem label="Travel" value="$1,200" />
          <LineItem label="Prep & tools" value="$1,350" />
          <LineItem label="Sundries" value="$650" />
          <LineItem label="Misc" value="$0" />
          <LineItem label="Mobilization cost" value="$500" />
          <div className="border-t border-gray-200 my-2" />
          <LineItem label="Hard cost" value="$18,420" bold bg />
          <LineItem label="Overhead (15%)" value="$2,763" />
          <LineItem label="Subtotal" value="$21,183" />
          <LineItem label="Profit (30%)" value="$6,511" />
          <div className="border-t border-gray-200 my-2" />
          <div className="flex justify-between items-center py-1.5 px-2 bg-green-50 rounded-lg">
            <span className="font-semibold text-gray-900">Final total</span>
            <span className="text-lg font-bold text-green-600">$27,694</span>
          </div>
          <LineItem label="$/SF" value="$5.71" />
        </div>
      </div>

      {/* Measurements summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Measurements summary
        </h3>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
            Floor
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
            Cove
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
            Walls
          </span>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-gray-700">Main production floor</span>
            <span className="text-gray-500 font-medium">3,200 SF</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-700">Office area floor</span>
            <span className="text-gray-500 font-medium">850 SF</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-700">Cove base — main floor</span>
            <span className="text-gray-500 font-medium">420 LF</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-700">North wall</span>
            <span className="text-gray-500 font-medium">380 SF</span>
          </div>
          <div className="border-t border-gray-200 my-1" />
          <div className="flex justify-between py-1 font-semibold">
            <span className="text-gray-900">Total</span>
            <span className="text-gray-900">4,850 SF</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p
        className={`text-xl font-bold ${
          highlight ? 'text-green-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function LineItem({
  label,
  value,
  bold,
  bg,
}: {
  label: string
  value: string
  bold?: boolean
  bg?: boolean
}) {
  return (
    <div
      className={`flex justify-between py-1 px-2 rounded ${
        bg ? 'bg-amber-50' : ''
      }`}
    >
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>
        {label}
      </span>
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-700'}>
        {value}
      </span>
    </div>
  )
}
