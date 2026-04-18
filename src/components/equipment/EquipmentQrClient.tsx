'use client'

import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeftIcon } from 'lucide-react'

const CATEGORY_LABEL: Record<string, string> = {
  vehicle: 'Vehicle',
  heavy_equipment: 'Heavy Equipment',
  trailer: 'Trailer',
  tool: 'Tool',
}

interface Props {
  equipment: {
    id: string
    name: string
    category: string
    year: string | null
    make: string | null
    model: string | null
  }
}

export default function EquipmentQrClient({ equipment }: Props) {
  const equipmentUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/equipment/${equipment.id}`

  const yearMakeModel = [equipment.year, equipment.make, equipment.model]
    .filter(Boolean)
    .join(' / ')

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      {/* Back link — hidden when printing */}
      <div className="print:hidden fixed top-4 left-4">
        <Link
          href={`/equipment/${equipment.id}`}
          className="inline-flex items-center text-gray-400 hover:text-gray-600"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
      </div>

      {/* Sticker content */}
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Equipment name */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{equipment.name}</h1>
          {(equipment.category || yearMakeModel) && (
            <p className="text-sm text-gray-500 mt-1">
              {[CATEGORY_LABEL[equipment.category] ?? equipment.category, yearMakeModel]
                .filter(Boolean)
                .join(' — ')}
            </p>
          )}
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <QRCodeSVG value={equipmentUrl} size={200} level="M" />
        </div>

        {/* Scan instructions */}
        <p className="text-xs text-gray-400">Scan to view equipment record</p>

        {/* Company name */}
        <p className="text-sm font-semibold text-gray-700">Peckham Coatings</p>
      </div>
    </div>
  )
}
